/* Site soundtrack · 5 original songs × 3 theme palettes = 15 tracks, synthesized live with Web Audio.
 *
 * Songs (the same blueprint for every theme):
 *   1 the theme      hypnotic 16th-note bass, heavy drums, dark synths (104 bpm)
 *   2 horror chase   fast, dissonant string stabs, heartbeat, screeches (148 bpm)
 *   3 the lowest     slow, emotional, strings and piano carry it (66 bpm)
 *   4 the standoff   drum & bass, two hackers trading phrases left vs right (172 bpm)
 *   5 the epilogue   calm, A=432 tuning, soft 2.5 Hz binaural drone, strings, brass at the end (60 bpm)
 * Palettes: Phthalo (E minor, cold analog) · Dark Knight (D minor, heavier, choir, low brass) ·
 *           Golden (G minor, glassy bells, shimmer). The secret CRT skin uses Phthalo.
 * Track 6 (secret, per theme) is the director's cut: one long original piece built from the same motifs, unlocked
 *   in the Patch Bay (assets/js/patchbay.js), which wakes after you've heard all five songs.
 * Tracks 7–10 are bonus tracks, one per arcade game, unlocked in every theme by finishing a run of that game:
 *   7 Sidekiq Rush  underground techno, rolling bass and three drops (132 bpm, ~3½ min)
 *   8 Gem Match     somber piano, strings and low brass, hopeful (72 bpm, 5 min)
 *   9 Schema Stack  electric guitar riffs, a singing lead and a solo (150 bpm, 3 min)
 *  10 Pit Wall      a grand-prix fanfare that falls into a tribal fever dream and back (124 bpm, 4 min)
 * The main rotation is the five songs plus every unlocked bonus track (1–5, 7–10, round again). Track 6 stays out
 *   of it: it plays only when picked in the player, then hands over to Ring Zero.
 * Every song ends with an outro that eases its tempo and tuning into the next track (or itself, when looping)
 *   and teases that track's opening, so songs hand over on the beat instead of crossfading.
 * On the site the current theme's songs play in order; switching theme crossfades to the same song.
 * SamukaLofi.preview(theme, n) loops one track (used by the /soundtrack/ listening page).
 */
(function () {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.55, LOOK = 0.12, TICK = 25;
  var ctx = null, master = null, analyser = null, noiseBuf = null, verbBuf = null;
  var on = false, timer = null, cur = null, token = 0, btn = null, nextBtn = null, pinned = null;

  var THEMES = {
    phthalo: { name: "Phthalo", tr: 0, bpm: 1, drive: 2.2, bassDrive: 1.6, kickLow: 44, strBright: 2400, pianoLp: 3200, arp: "saw", lead: "saw", lead2: "pulse", choir: 0, shimmer: 0, verb: 0.55, brass: 1,
      titles: ["Ring Zero", "Something in the Wires", "Alone at 3 AM", "Two Cursors, One Shell", "Green Dawn", "Root Access"] },
    knight: { name: "Dark Knight", tr: -2, bpm: 0.97, drive: 3.4, bassDrive: 2.6, kickLow: 38, strBright: 1700, pianoLp: 1900, arp: "grit", lead: "grit", lead2: "saw", choir: 1, shimmer: 0, verb: 0.75, brass: 1.3,
      titles: ["Crimson Protocol", "Footsteps Behind You", "What Is Left of Me", "Blade Against Blade", "After the Rain", "The Long Night"] },
    golden: { name: "Golden", tr: 3, bpm: 1.02, drive: 1.6, bassDrive: 1.3, kickLow: 48, strBright: 3300, pianoLp: 5200, arp: "bell", lead: "glass", lead2: "pulse", choir: 0, shimmer: 1, verb: 0.8, brass: 0.8,
      titles: ["Golden Hour Uplink", "Gilded Nightmare", "Violet Rain", "Mirror Match", "Lullaby in Gold", "Alchemy"] }
  };   // titles[5] is the secret suite (track 6), unlocked per theme in the Patch Bay
  function themeId() { var s = document.documentElement.dataset.skin; return THEMES[s] ? s : "phthalo"; }
  function quiet(p) { if (p && p.catch) p.catch(function () {}); }

  function ensureCtx() {
    if (ctx) return true;
    try { ctx = new AC(); graph(); return true; } catch (e) { ctx = null; return false; }
  }
  function graph() {   // master bus, analyser, noise and reverb buffers for the current ctx
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8; comp.connect(analyser);
    var sr = ctx.sampleRate, i, len = sr * 2, d;
    noiseBuf = ctx.createBuffer(1, len, sr); d = noiseBuf.getChannelData(0);
    for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var vlen = Math.floor(sr * 3.2);   // a dark hall: stereo noise, exponential tail, top end rolled off
    verbBuf = ctx.createBuffer(2, vlen, sr);
    for (var ch = 0; ch < 2; ch++) {
      d = verbBuf.getChannelData(ch); var lp = 0;
      for (i = 0; i < vlen; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.33; d[i] = lp * Math.pow(1 - i / vlen, 3); }
    }
  }

  /* ---------- building blocks ---------- */
  function F(o, m) { return o.ref * Math.pow(2, (m + o.P.tr - 69) / 12); }
  function filt(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; return b; }
  function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
  function shaper(k) {
    var ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    ws.curve = c; ws.oversample = "2x"; return ws;
  }
  function env(g, t, a, d, peak) {
    a = Math.max(0.002, a);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function swell(g, t, a, hold, r, peak) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, hold)); g.gain.linearRampToValueAtTime(0.0001, t + Math.max(a, hold) + r);
  }
  function osc(type, f, t, stop, detune) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t); o.stop(stop); return o;
  }
  function noise(t, d) { var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 1.5); s.stop(t + d + 0.05); return s; }
  function send(o, node, verb, delay) {
    if (verb) { var v = gain(verb); node.connect(v); v.connect(o.verb); }
    if (delay) { var d = gain(delay); node.connect(d); d.connect(o.delay); }
  }
  function vibrato(o, oscNode) { o.vibG.connect(oscNode.detune); oscNode.onended = function () { try { o.vibG.disconnect(oscNode.detune); } catch (e) {} }; }
  function panner(v) { if (!ctx.createStereoPanner) return gain(1); var p = ctx.createStereoPanner(); p.pan.value = v; return p; }
  function triad(r, maj) { return [r, r + (maj ? 4 : 3), r + 7]; }

  /* ---------- drums ---------- */
  function duckAt(o, t, depth) { var d = o.duck.gain; d.cancelScheduledValues(t); d.setValueAtTime(depth, t); d.setTargetAtTime(1, t + 0.03, 0.09); }
  function kick(o, t, v) {
    var s = osc("sine", 160, t, t + 0.6), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(o.P.kickLow, t + 0.09);
    env(g, t, 0.002, 0.5, v); s.connect(g); g.connect(o.drums);
    var c = noise(t, 0.02), cf = filt("highpass", 2500), cg = gain(0); env(cg, t, 0.001, 0.018, 0.25 * v); c.connect(cf); cf.connect(cg); cg.connect(o.drums);
    duckAt(o, t, 0.32);
  }
  function snare(o, t, v) {
    var n = noise(t, 0.3), bp = filt("bandpass", o.P.shimmer ? 2400 : 1900, 0.7), g = gain(0); env(g, t, 0.002, 0.22, 0.42 * v);
    n.connect(bp); bp.connect(g); g.connect(o.drums); send(o, g, 0.5 * v);
    var b = osc("triangle", 200, t, t + 0.2), bg = gain(0); b.frequency.exponentialRampToValueAtTime(140, t + 0.1); env(bg, t, 0.001, 0.12, 0.35 * v); b.connect(bg); bg.connect(o.drums);
  }
  function hat(o, t, v, open) {
    var n = noise(t, open ? 0.25 : 0.06), hp = filt("highpass", 7600, 0.8), g = gain(0);
    env(g, t, 0.001, open ? 0.2 : 0.035, 0.12 * v); n.connect(hp); hp.connect(g); g.connect(o.drums);
  }
  function ride(o, t, v) {
    [5200, 7300, 9100].forEach(function (f) { var s = osc("square", f, t, t + 0.3), g = gain(0); env(g, t, 0.001, 0.25, 0.004 * v); s.connect(g); g.connect(o.drums); });
    var n = noise(t, 0.2), hp = filt("highpass", 8000), g = gain(0); env(g, t, 0.001, 0.18, 0.03 * v); n.connect(hp); hp.connect(g); g.connect(o.drums);
  }
  function clank(o, t, v) {
    var n = noise(t, 0.2), bp = filt("bandpass", o.P.choir ? 2100 : 3100, 9), g = gain(0); env(g, t, 0.001, 0.14, 0.5 * v);
    n.connect(bp); bp.connect(g);
    [843, 1219].forEach(function (f) { var s = osc("square", f * (o.P.choir ? 0.7 : 1), t, t + 0.12), sg = gain(0); env(sg, t, 0.001, 0.07, 0.03 * v); s.connect(sg); sg.connect(g); });
    var dry = gain(0.35); g.connect(dry); dry.connect(o.drums); send(o, g, 0.9);
  }
  function tom(o, t, f, v) {
    var s = osc("sine", f, t, t + 0.6), g = gain(0); s.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.3);
    env(g, t, 0.002, 0.45, 0.55 * v); s.connect(g); g.connect(o.drums); send(o, g, 0.3);
  }
  function heart(o, t, v) {   // lub-dub
    [[0, 1], [0.2, 0.7]].forEach(function (b) {
      var tt = t + b[0], s = osc("sine", 80, tt, tt + 0.3), g = gain(0), lp = filt("lowpass", 300);
      s.frequency.exponentialRampToValueAtTime(40, tt + 0.12); env(g, tt, 0.004, 0.2, 0.7 * v * b[1]);
      s.connect(lp); lp.connect(g); g.connect(o.bus);
    });
  }
  function riser(o, t, len, peak) {
    var n = noise(t, len), bp = filt("bandpass", 400, 3), g = gain(0);
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak || 0.09, t + len); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.05);
    n.connect(bp); bp.connect(g); g.connect(o.bus); send(o, g, 0.5);
  }

  /* ---------- melodic instruments (each one takes its colour from the theme palette) ---------- */
  function bassNote(o, t, m, v, len) {
    var g = gain(0), f = filt("lowpass", 1, 2);
    f.frequency.setValueAtTime(o.cut * 2.6, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, o.cut * 0.55), t + len * 0.9);
    [[-8, "sawtooth"], [8, "sawtooth"], [0, "square"]].forEach(function (p) { osc(p[1], F(o, m), t, t + len + 0.05, p[0]).connect(f); });
    env(g, t, 0.003, len * 0.95, 0.2 * v); f.connect(g); g.connect(o.bassLp);
  }
  function arpNote(o, t, m, v) {
    var g = gain(0), f0 = F(o, m);
    if (o.P.arp === "bell") {   // glassy FM bell
      var c = osc("sine", f0, t, t + 1), mod = osc("sine", f0 * 3.5, t, t + 1), mg = gain(f0 * 2);
      mg.gain.setValueAtTime(f0 * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.4); mod.connect(mg); mg.connect(c.frequency);
      env(g, t, 0.002, 0.55, 0.045 * v); c.connect(g); g.connect(o.duck); send(o, g, 0.4, 0.7);
      return;
    }
    var s = osc("sawtooth", f0, t, t + 0.25, 4), lp = filt("lowpass", 1200, 6);
    lp.frequency.setValueAtTime(o.P.arp === "grit" ? 1300 : 1900, t); lp.frequency.exponentialRampToValueAtTime(o.P.arp === "grit" ? 380 : 500, t + 0.14);
    env(g, t, 0.002, 0.15, (o.P.arp === "grit" ? 0.06 : 0.05) * v); s.connect(lp);
    if (o.P.arp === "grit") { var sh = shaper(3); lp.connect(sh); sh.connect(g); } else lp.connect(g);
    g.connect(o.duck); send(o, g, 0, 0.6);
  }
  // pad: "saw" (dark analog) or "warm" (soft triangles); Knight adds a choir, Golden a shimmer
  function pad(o, t, notes, len, vol, kind) {
    var lp = filt("lowpass", 700, 0.8), g = gain(0);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(kind === "warm" ? 1400 : 1100, t + len * 0.5); lp.frequency.linearRampToValueAtTime(600, t + len);
    swell(g, t, len * 0.35, len * 0.6, len * 0.4 + 0.6, vol);
    notes.forEach(function (m) {
      [-11, 11].forEach(function (dt) { osc(kind === "warm" ? "triangle" : "sawtooth", F(o, m), t, t + len * 1.05 + 0.8, dt).connect(lp); });
      if (o.P.choir) {   // "ah" formants
        var v = osc("sawtooth", F(o, m), t, t + len * 1.05 + 0.8, 3), f1 = filt("bandpass", 700, 6), f2 = filt("bandpass", 1150, 7), cg = gain(1.4);
        v.connect(f1); v.connect(f2); f1.connect(cg); f2.connect(cg); cg.connect(g); vibrato(o, v);
      }
      if (o.P.shimmer) { var sh = osc("sine", F(o, m + 12), t, t + len * 1.05 + 0.8), sg = gain(0.35); sh.connect(sg); sg.connect(g); }
    });
    lp.connect(g); g.connect(o.duck); send(o, g, 0.6);
  }
  // string ensemble: three detuned saws per note, shared vibrato, slow bow; opt: a, r, trem, bright, dest
  function strings(o, t, notes, len, vol, opt) {
    opt = opt || {};
    var a = opt.a != null ? opt.a : Math.min(1.2, len * 0.25), r = opt.r != null ? opt.r : 1;
    var lp = filt("lowpass", o.P.strBright * (opt.bright || 1), 0.5), hp = filt("highpass", 90), g = gain(0), stop = t + Math.max(a, len) + r + 0.1;
    swell(g, t, a, len, r, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) {
      [-9, 0, 9].forEach(function (dt) { var s = osc("sawtooth", F(o, m), t, stop, dt + (Math.random() * 4 - 2)); vibrato(o, s); s.connect(lp); });
      if (o.P.shimmer && m > 60) { var sh = osc("sine", F(o, m + 12), t, stop), sg = gain(0.25); sh.connect(sg); sg.connect(lp); }
    });
    var last = hp;
    lp.connect(hp);
    if (opt.trem) {   // horror tremolo bowing
      var tg = gain(0.5), lfo = osc("sine", 11, t, stop), lg = gain(0.5); lfo.connect(lg); lg.connect(tg.gain); hp.connect(tg); last = tg;
    }
    last.connect(g); g.connect(opt.dest || o.duck); send(o, g, 0.75);
  }
  function stab(o, t, notes, v) {
    strings(o, t, notes, 0.08, 0.065 * v, { a: 0.004, r: 0.22, bright: 1.6 });
    var n = noise(t, 0.08), bp = filt("bandpass", 1500, 1.5), g = gain(0); env(g, t, 0.001, 0.06, 0.08 * v); n.connect(bp); bp.connect(g); g.connect(o.duck);
  }
  function screech(o, t, m, len, v) {
    var s = osc("sawtooth", F(o, m), t, t + len + 0.3), bp = filt("bandpass", 2600, 4), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(F(o, m + 6), t + len); vibrato(o, s);
    swell(g, t, len * 0.3, len * 0.7, 0.3, v); s.connect(bp); bp.connect(g); g.connect(o.duck); send(o, g, 1.2);
  }
  function piano(o, t, m, v, len) {
    var f = F(o, m), g = gain(0), lp = filt("lowpass", o.P.pianoLp, 0.5);
    lp.frequency.setValueAtTime(o.P.pianoLp, t); lp.frequency.exponentialRampToValueAtTime(o.P.pianoLp * 0.3, t + len);
    [["triangle", 1, 1], ["sine", 2, 0.3], ["sine", 3.01, o.P.shimmer ? 0.12 : 0.05]].forEach(function (p) {
      var s = osc(p[0], f * p[1], t, t + len + 0.1, p[1] === 1 ? 0 : 3), sg = gain(p[2]); s.connect(sg); sg.connect(lp);
    });
    env(g, t, 0.004, len, 0.12 * v); lp.connect(g); g.connect(o.duck); send(o, g, 0.55, 0.15);
  }
  function brass(o, t, notes, len, vol, opt) {
    opt = opt || {};
    var a = opt.a != null ? opt.a : Math.min(0.8, len * 0.4), lp = filt("lowpass", 250, 1.2), g = gain(0), stop = t + Math.max(a, len) + 0.9;
    lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(1500 * o.P.brass, t + a); lp.frequency.linearRampToValueAtTime(900 * o.P.brass, t + Math.max(a, len));
    swell(g, t, a, len, 0.8, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) {
      [-6, 6].forEach(function (dt) { var s = osc("sawtooth", F(o, m), t, stop, dt); vibrato(o, s); s.connect(lp); });
      if (o.P.brass > 1) osc("sawtooth", F(o, m - 12), t, stop).connect(lp);
    });
    lp.connect(g); g.connect(o.duck); send(o, g, 0.5);
  }

  /* ---------- persistent voices ---------- */
  function makeSub(o, t) {
    var s = osc("sine", 55, t, t + 36000), g = gain(0); s.connect(g); g.connect(o.duck); o.nodes.push(s);
    return { set: function (tt, m, lvl) { s.frequency.setTargetAtTime(F(o, m), tt, 0.01); g.gain.setTargetAtTime(lvl, tt, 0.3); } };
  }
  function makeLead(o, t, kind, panV) {
    var spec = { saw: [["sawtooth", 1, -7], ["square", 0.5, 6]], grit: [["sawtooth", 1, -9], ["sawtooth", 1, 9]], glass: [["triangle", 1, 0], ["sine", 2, 0]], pulse: [["square", 1, 0], ["square", 1.0, 8]] }[kind];
    var mix = gain(0.5), lp = filt("lowpass", 1400, kind === "pulse" ? 6 : 3), g = gain(0.0001), p = panner(panV || 0), oscs = [];
    spec.forEach(function (sp) { var s = osc(sp[0], 440, t, t + 36000, sp[2]); s.connect(mix); o.vibG.connect(s.detune); o.nodes.push(s); oscs.push([s, sp[1]]); });
    if (kind === "grit") { var sh = shaper(2.5); mix.connect(sh); sh.connect(lp); } else mix.connect(lp);
    lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.22, 0.12);
    return {
      play: function (tt, m, len, vol) {
        var f = F(o, m);
        oscs.forEach(function (x) { x[0].frequency.setTargetAtTime(f * x[1], tt, 0.02); });
        var gg = g.gain; gg.cancelScheduledValues(tt); gg.setTargetAtTime(vol, tt, 0.015); gg.setTargetAtTime(0.0001, tt + len * 0.85, 0.06);
        lp.frequency.cancelScheduledValues(tt); lp.frequency.setTargetAtTime(kind === "glass" ? 3200 : 2300, tt, 0.02); lp.frequency.setTargetAtTime(kind === "glass" ? 1800 : 1000, tt + 0.07, 0.25);
      }
    };
  }
  function makeReese(o, t) {   // drum & bass "reese": two detuned saws, moving filter, grit
    var a = osc("sawtooth", 82, t, t + 36000, -14), b = osc("sawtooth", 82, t, t + 36000, 14), lp = filt("lowpass", 380, 4), sh = shaper(o.P.bassDrive * 1.4), g = gain(0.0001);
    var lfo = osc("sine", 0.35, t, t + 36000), lg = gain(260); lfo.connect(lg); lg.connect(lp.frequency);
    a.connect(lp); b.connect(lp); lp.connect(sh); sh.connect(g); g.connect(o.duck); o.nodes.push(a, b, lfo);
    return {
      play: function (tt, m, len, vol) {
        var f = F(o, m); a.frequency.setTargetAtTime(f, tt, 0.01); b.frequency.setTargetAtTime(f, tt, 0.01);
        var gg = g.gain; gg.cancelScheduledValues(tt); gg.setTargetAtTime(vol, tt, 0.008); gg.setTargetAtTime(0.0001, tt + len * 0.9, 0.03);
      },
      rate: function (tt, r) { lfo.frequency.setTargetAtTime(r, tt, 0.1); },
      bend: function (tt, m, tc) { a.frequency.setTargetAtTime(F(o, m), tt, tc); b.frequency.setTargetAtTime(F(o, m), tt, tc); }   // tape-stop dive
    };
  }
  function makeBinaural(o, t, f, delta, lvl) {   // left f, right f + delta: a slow "beat" felt inside the head
    var mg = ctx.createChannelMerger(2), l = osc("sine", f, t, t + 36000), r = osc("sine", f + delta, t, t + 36000), gl = gain(lvl), gr = gain(lvl), out = gain(0.0001);
    l.connect(gl); r.connect(gr); gl.connect(mg, 0, 0); gr.connect(mg, 0, 1); mg.connect(out); out.connect(o.bus); o.nodes.push(l, r);
    return { level: function (tt, v) { out.gain.setTargetAtTime(Math.max(0.0001, v), tt, 2); } };
  }

  /* ======================= the five songs ======================= */
  function melodyAt(list, bar, st) { return list.filter(function (n) { return n[0] === bar && n[1] === st; }); }

  // 1 · the theme (Ring Zero)
  var RZ = {
    chords: [
      { bass: 40, pad: [52, 55, 59, 64], arp: [64, 67, 71, 76] },
      { bass: 36, pad: [48, 55, 60, 64], arp: [60, 64, 67, 72] },
      { bass: 33, pad: [45, 52, 57, 60], arp: [57, 60, 64, 69] },
      { bass: 35, pad: [47, 51, 54, 59], arp: [59, 63, 66, 71] }
    ],
    bass: [0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 7, 12],
    acc: [1, 0.55, 0.8, 0.5, 0.9, 0.6, 0.55, 0.5, 1, 0.55, 0.8, 0.5, 0.9, 0.7, 0.75, 0.6],
    arp: [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 0, 3, 2, 1, 2],
    lead: [
      [0, 71, 6], [6, 69, 2], [8, 67, 4], [12, 66, 2], [14, 67, 2], [16, 64, 12],
      [32, 76, 6], [38, 74, 2], [40, 72, 4], [44, 71, 2], [46, 72, 2], [48, 67, 12],
      [64, 69, 6], [70, 72, 2], [72, 76, 6], [78, 74, 2], [80, 72, 8], [88, 71, 4], [92, 69, 4],
      [96, 75, 8], [104, 78, 4], [108, 75, 4], [112, 71, 16]
    ],
    sec: function (bar) {
      if (bar < 4) return { id: "intro", cut: 300 + bar * 130, hats: bar >= 2 ? 1 : 0 };
      if (bar < 8) return { id: "rise", cut: 820, kick: 1, hats: 1, clank: bar >= 6, fill: bar === 7 };
      if (bar < 24) return { id: "main", cut: 1150, kick: 1, snare: 1, hats: 2, arp: 1, clank: 1, fill: bar === 15 || bar === 23 };
      if (bar < 32) return { id: "break", cut: 520, lead: 1, hats: bar >= 28 ? 1 : 0, riser: bar === 28 };
      if (bar < 56) return { id: "drive", cut: 1500, kick: 1, snare: 1, hats: 2, arp: 1, lead: 1, clank: 1, fill: bar === 39 || bar === 47 || bar === 55 };
      return { id: "fade", cut: 900 - (bar - 56) * 60, kick: 1, hats: 1, fill: bar === 63 };
    }
  };
  var SONG_THEME = {
    mood: "the theme · hypnotic, driving", bpm: 104, bars: 64,
    init: function (o, t) { o.sub = makeSub(o, t); o.lead = makeLead(o, t, o.P.lead, 0); },
    play: function (o, t, st, bar) {
      var sec = RZ.sec(bar), ch = RZ.chords[Math.floor(bar / 2) % 4], six = o.six;
      o.cut = sec.cut;
      if (st === 0) {
        o.bassLp.frequency.setTargetAtTime(sec.cut * 1.5, t, 1.2);
        o.sub.set(t, ch.bass - 12, sec.kick ? 0.26 : 0.16);
        if (bar % 2 === 0) pad(o, t, ch.pad, six * 32, 0.05);
        if (sec.riser) riser(o, t, six * 64);
        if (o.P.brass > 1 && (sec.id === "main" || sec.id === "drive") && bar % 4 === 0) brass(o, t, ch.pad.slice(0, 3), six * 6, 0.07, { a: 0.05 });
      }
      bassNote(o, t, ch.bass + RZ.bass[st], RZ.acc[st], six * 0.9);
      var fill = sec.fill && st >= 12;
      if (sec.kick && (st % 4 === 0 || (st === 14 && bar % 4 === 3 && sec.id !== "fade")) && !(fill && st > 12)) kick(o, t, st % 4 === 0 ? 1 : 0.7);
      if (sec.snare && (st === 4 || st === 12)) snare(o, t, 1);
      if (sec.hats === 2 && !fill) hat(o, t, st % 4 === 2 ? 1 : st % 2 ? 0.45 : 0.6, st === 14 && bar % 2 === 1);
      else if (sec.hats === 1 && st % 4 === 2) hat(o, t, 0.8, false);
      if (sec.clank && st === 10 && bar % 2 === 1) clank(o, t, 0.8);
      if (fill) { tom(o, t, [180, 150, 120, 95][st - 12], 1); if (st === 15 && sec.snare) snare(o, t + six * 0.5, 0.6); }
      if (sec.arp) arpNote(o, t, ch.arp[RZ.arp[st]], st % 4 === 0 ? 1 : 0.7);
      if (sec.lead) {
        var pos = (bar % 8) * 16 + st;
        RZ.lead.forEach(function (n) { if (n[0] === pos) o.lead.play(t, n[1], n[2] * six, sec.id === "break" ? 0.11 : 0.085); });
      }
    }
  };

  // 2 · horror chase
  var KP = {
    chords: [{ bass: 40, cl: [64, 65, 71] }, { bass: 41, cl: [65, 68, 71] }, { bass: 40, cl: [64, 67, 70] }, { bass: 46, cl: [58, 64, 65] }],
    bass: [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 6, 0, 1, 12, 13],
    stab: [0, 3, 6, 8, 11, 14],
    sec: function (bar) {
      if (bar < 8) return { id: "dread", heart: 1, trem: 0.035 };
      if (bar < 16) return { id: "hunt", heart: 1, bass: 1, cut: 300 + (bar - 8) * 90, hats: 1, trem: 0.03 };
      if (bar < 40) return { id: "chase", bass: 1, cut: 1300, kick: 1, snare: 1, hats: 2, stab: 1, screech: 1, trem: 0.022 };
      if (bar < 48) return { id: "hide", heart: 2, trem: 0.04 };
      return { id: "run", bass: 1, cut: 1700, kick: 2, snare: 1, hats: 2, stab: 1, screech: 1, trem: 0.025, clank: 1 };
    }
  };
  var SONG_HORROR = {
    mood: "horror chase · fast, dissonant, relentless", bpm: 148, bars: 72,
    init: function (o, t) { o.sub = makeSub(o, t); },
    play: function (o, t, st, bar) {
      var sec = KP.sec(bar), ch = KP.chords[Math.floor(bar / 2) % 4], six = o.six;
      o.cut = sec.cut || 400;
      if (st === 0) {
        o.sub.set(t, ch.bass - 12, sec.id === "hide" || sec.id === "dread" ? 0.2 : 0.24);
        o.bassLp.frequency.setTargetAtTime(o.cut * 1.5, t, 0.5);
        if (bar % 2 === 0) strings(o, t, ch.cl.map(function (n) { return n + 12; }), six * 32, sec.trem, { a: 0.6, r: 1, trem: true, bright: 1.3 });
        if (bar === 12 || bar === 44) riser(o, t, six * 64, 0.12);
        if (sec.id === "hide" && bar % 2 === 0) { piano(o, t, ch.bass - 12, 0.9, 4); piano(o, t, ch.bass - 11, 0.6, 4); }
        if (sec.clank && bar % 4 === 0) clank(o, t, 1);
        if (o.P.choir && sec.id === "dread" && bar % 4 === 0) pad(o, t, [ch.bass + 12, ch.bass + 13, ch.bass + 18], six * 64, 0.03);
      }
      if (sec.heart && (st === 0 || st === 8 || (sec.heart === 2 && (st === 4 || st === 12)))) heart(o, t, 0.9);
      if (sec.bass) bassNote(o, t, ch.bass + KP.bass[st], st % 4 === 0 ? 1 : 0.65, six * 0.85);
      if (sec.kick && (st % 4 === 0 || (sec.kick === 2 && st === 7))) kick(o, t, 1);
      if (sec.snare && (st === 4 || st === 12)) snare(o, t, 1);
      if (sec.id === "run" && bar % 8 === 7 && st >= 8) snare(o, t, 0.45 + (st - 8) * 0.07);
      if (sec.hats === 1 && st % 4 === 2) hat(o, t, 0.8);
      else if (sec.hats === 2) hat(o, t, st % 4 === 2 ? 1 : 0.5, st === 14);
      if (sec.stab && KP.stab.indexOf(st) >= 0) {
        stab(o, t, ch.cl, st === 0 ? 1 : 0.7);
        if (o.P.brass > 1 && st === 0) brass(o, t, ch.cl.map(function (n) { return n - 12; }), six * 1.5, 0.06, { a: 0.01 });
        if (o.P.arp === "bell" && st === 0) arpNote(o, t, ch.cl[2] + 12, 1);
      }
      if (sec.screech && bar % 4 === 3 && st === 8) screech(o, t, ch.cl[2] + 12, six * 8, 0.05);
    }
  };

  // 3 · the lowest point
  var LM = {
    chords: [[52, 0], [48, 1], [55, 1], [50, 1], [57, 0], [52, 0], [48, 1], [59, 1]],   // Em C G D Am Em C B
    mel: [[0, 0, 71, 6], [0, 6, 69, 2], [0, 8, 67, 8], [1, 0, 76, 8], [1, 8, 74, 4], [1, 12, 72, 4], [2, 0, 71, 12], [2, 12, 74, 4],
      [3, 0, 69, 6], [3, 6, 66, 2], [3, 8, 69, 8], [4, 0, 72, 6], [4, 6, 71, 2], [4, 8, 69, 4], [4, 12, 76, 4],
      [5, 0, 79, 8], [5, 8, 78, 4], [5, 12, 76, 4], [6, 0, 76, 6], [6, 6, 74, 2], [6, 8, 72, 8], [7, 0, 75, 8], [7, 8, 71, 8]],
    sec: function (bar) {
      if (bar < 8) return { id: "alone", piano: 0.8, pad: 0.018 };
      if (bar < 16) return { id: "memory", piano: 0.7, pad: 0.018, cello: 0.05, mel: -12, mv: 0.06 };
      if (bar < 24) return { id: "weight", piano: 0.6, cello: 0.05, str: 0.05, mel: 0, mv: 0.065 };
      if (bar < 32) return { id: "breaking", piano: 0.55, cello: 0.06, str: 0.065, mel: 12, mv: 0.06, timp: 1, bass: 1 };
      return { id: "after", piano: 0.75, pad: 0.015 };
    }
  };
  var SONG_LOWEST = {
    mood: "the lowest point · strings and piano, aching", bpm: 66, bars: 40,
    init: function (o, t) { o.sub = makeSub(o, t); },
    play: function (o, t, st, bar) {
      var sec = LM.sec(bar), c = LM.chords[bar % 8], r = c[0], t3 = r + (c[1] ? 4 : 3), six = o.six, barLen = six * 16;
      if (st === 0) {
        o.sub.set(t, r - 24, sec.bass ? 0.12 : 0.05);
        if (sec.pad) pad(o, t, [r, t3, r + 7], barLen * 1.05, sec.pad, "warm");
        if (sec.cello) strings(o, t, [r - 12], barLen * 1.02, sec.cello, { a: 0.9, r: 1.2, bright: 0.6 });
        if (sec.bass) strings(o, t, [r - 24], barLen * 1.02, 0.04, { a: 0.6, r: 1.2, bright: 0.4 });
        if (sec.str) strings(o, t, [t3, r + 7, r + 12], barLen * 1.02, sec.str, { a: 1.2, r: 1.4 });
        if (sec.timp && (bar % 2 === 0)) tom(o, t, F(o, r - 24) * 2, 0.55);
        if (bar === 32) strings(o, t, [r + 24], barLen * 7, 0.025, { a: 3, r: 4, bright: 1.2 });
        if (o.P.choir && sec.id === "breaking" && bar % 2 === 0) pad(o, t, [r, t3, r + 7], barLen * 2, 0.025);
      }
      if (sec.piano && st % 2 === 0 && !(bar === 39 && st > 0)) {
        var arp = [r - 12, r - 5, r, t3, r + 7, r + 12, r + 7, t3];
        piano(o, t, arp[st / 2] + (sec.id === "after" ? 12 : 0), sec.piano * (st === 0 ? 1 : 0.7), bar === 39 ? 6 : 2.4);
      }
      if (sec.mel != null) melodyAt(LM.mel, bar % 8, st).forEach(function (n) { strings(o, t, [n[2] + sec.mel], n[3] * six, sec.mv, { a: 0.35, r: 0.9, bright: 1.1 }); });
    }
  };

  // 4 · the standoff (drum & bass, two hackers trading phrases)
  var RC = {
    chords: [[40, 0], [36, 1], [45, 0], [35, 1]],   // Em C Am B
    bass: [[0, 0, 5], [6, 0, 2], [10, 0, 3], [14, 12, 2]],
    ghost: { 7: 0.22, 9: 0.15, 15: 0.25 },
    a1: [[0, 76, 2], [2, 79, 1], [3, 81, 1], [4, 83, 2], [6, 81, 1], [7, 79, 1], [8, 76, 3], [12, 74, 1], [13, 76, 1], [14, 79, 2]],
    a2: [[0, 83, 1], [1, 81, 1], [2, 79, 1], [3, 81, 1], [4, 86, 3], [8, 84, 2], [10, 83, 1], [11, 81, 1], [12, 79, 2], [14, 76, 2]],
    b1: [[0, 71, 1], [1, 74, 1], [3, 76, 2], [6, 79, 1], [7, 78, 1], [8, 76, 2], [11, 74, 1], [12, 71, 2], [14, 74, 2]],
    b2: [[0, 79, 1], [1, 81, 1], [2, 83, 1], [3, 86, 2], [6, 84, 1], [7, 83, 1], [8, 81, 1], [9, 79, 1], [10, 78, 2], [12, 76, 4]],
    sec: function (bar) {
      if (bar < 8) return { id: "intro", pad: 1, hats: 1, a: 1, sub: 0.1 };
      if (bar < 16) return { id: "build", pad: 1, hats: 1, a: 1, b: 1, sub: 0.14, roll: bar >= 12 };
      if (bar < 48) return { id: "drop", drums: 1, reese: 1, a: 1, b: 1, sub: 0.2, trade: 4 };
      if (bar < 56) return { id: "break", pad: 1, str: 1, both: 1, sub: 0.12, hats: 1 };
      if (bar < 88) return { id: "drop2", drums: 1, ride: 1, reese: 1, a: 1, b: 1, sub: 0.22, stab: 1, trade: 2 };
      return { id: "outro", hats: 1, kick: 1, sub: 0.1, pad: 1 };
    }
  };
  var SONG_STANDOFF = {
    mood: "the standoff · drum & bass, a battle of wits", bpm: 172, bars: 96,
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.la = makeLead(o, t, o.P.lead, -0.6); o.lb = makeLead(o, t, o.P.lead2, 0.6); },
    play: function (o, t, st, bar) {
      var sec = RC.sec(bar), c = RC.chords[Math.floor(bar / 2) % 4], root = c[0], six = o.six;
      if (st === 0) {
        o.sub.set(t, root - 12, sec.sub);
        if (bar % 2 === 0 && sec.pad) pad(o, t, triad(root + 12, c[1]).concat(root + 24), six * 32, sec.id === "break" ? 0.04 : 0.025);
        if (bar % 2 === 0 && sec.str) strings(o, t, triad(root + 24, c[1]), six * 32, 0.05, { a: 0.6 });
        if (bar === 12 || bar === 52) riser(o, t, six * 64, 0.11);
        if (sec.reese) o.reese.rate(t, bar % 4 === 3 ? 2 : 0.35);
        if (bar === 95) stab(o, t, triad(root + 12, c[1]), 1);
      }
      if (sec.drums || sec.kick) {
        if (st === 0 || st === 10 || (bar % 2 === 1 && st === 13 && sec.drums)) kick(o, t, 1);
      }
      if (sec.drums) {
        if (st === 4 || st === 12) snare(o, t, 1);
        if (RC.ghost[st]) snare(o, t, RC.ghost[st]);
        if (st % 2 === 0) hat(o, t, st % 4 === 2 ? 0.9 : 0.45);
        if (sec.ride && st % 4 === 0) ride(o, t, 0.8);
        if (bar % 8 === 7 && st >= 12) tom(o, t, [190, 160, 130, 100][st - 12], 0.9);
      } else if (sec.hats && st % 4 === 2) hat(o, t, 0.6);
      if (sec.roll) { var every = bar < 14 ? 4 : bar < 15 ? 2 : 1; if (st % every === 0) snare(o, t, 0.25 + 0.6 * ((bar - 12) * 16 + st) / 64); }
      if (sec.reese) RC.bass.forEach(function (b) { if (b[0] === st) o.reese.play(t, root + b[1], b[2] * six, 0.2); });
      if (sec.stab && bar % 2 === 0 && (st === 0 || st === 10)) stab(o, t, triad(root + 12, c[1]), 0.7);
      // the two hackers: A (left) calls, B (right) answers
      var trade = sec.trade || 4, aTurn = trade === 4 ? bar % 4 < 2 : bar % 2 === 0;
      function phrase(lead, list, vol, stretch) { list.forEach(function (n) { if (n[0] === st) lead.play(t, n[1], n[2] * six * (stretch || 1), vol); }); }
      if (sec.both) {   // break: both at once, slower, in counterpoint
        if (st % 2 === 0) { phrase(o.la, bar % 2 ? RC.a2 : RC.a1, 0.06, 2); phrase(o.lb, bar % 2 ? RC.b1 : RC.b2, 0.05, 2); }
      } else {
        if (sec.a && aTurn) phrase(o.la, bar % 2 ? RC.a2 : RC.a1, 0.07);
        if (sec.b && !aTurn) phrase(o.lb, bar % 2 ? RC.b2 : RC.b1, 0.065);
      }
    }
  };

  // 5 · the epilogue (A=432, slow, soothing; brass at the end)
  var EC = {
    chords: [[55, 1, 43], [50, 1, 42], [52, 0, 40], [48, 1, 36], [57, 0, 45], [55, 1, 47], [48, 1, 36], [50, 1, 38]],   // G D/F# Em C Am G/B C D
    mel: [[0, 0, 71, 8], [0, 8, 74, 8], [1, 0, 69, 12], [1, 12, 66, 4], [2, 0, 67, 8], [2, 8, 71, 8], [3, 0, 76, 12], [3, 12, 74, 4],
      [4, 0, 72, 8], [4, 8, 76, 8], [5, 0, 74, 16], [6, 0, 76, 8], [6, 8, 79, 8], [7, 0, 78, 8], [7, 8, 74, 8]],
    sec: function (bar) {
      if (bar < 8) return { id: "dawn", pad: 0.03, piano: 0.35 };
      if (bar < 16) return { id: "breathe", pad: 0.03, piano: 0.3, cello: 0.04 };
      if (bar < 32) return { id: "remember", pad: 0.022, piano: 0.22, cello: 0.045, str: 0.035, mel: 0, mv: 0.05 };
      if (bar < 40) return { id: "rise", pad: 0.02, cello: 0.05, str: 0.045, mel: 12, mv: 0.045, brass: bar >= 34 ? 0.035 : 0 };
      return { id: "home", cello: 0.055, str: 0.05, mel: 0, mv: 0.05, brass: 0.06, timp: 1 };
    }
  };
  var SONG_EPILOGUE = {
    mood: "the epilogue · calm, 432 Hz, sleep-slow, strings and brass", bpm: 60, bars: 48, ref: 432,
    init: function (o, t) { o.sub = makeSub(o, t); o.bin = makeBinaural(o, t, 108, 2.5, 0.03); },
    play: function (o, t, st, bar) {
      var sec = EC.sec(bar), c = EC.chords[bar % 8], r = c[0], t3 = r + (c[1] ? 4 : 3), six = o.six, barLen = six * 16, last = bar === 47;
      var len = last ? barLen * 4 : barLen * 1.03;
      if (st === 0) {
        if (bar === 0) o.bin.level(t, 1);
        if (bar === 44) o.bin.level(t, 0.0001);
        o.sub.set(t, c[2] - 12, 0.08);
        if (sec.pad) pad(o, t, [r, t3, r + 7, r + 12], len, sec.pad, "warm");
        if (sec.cello) strings(o, t, [c[2]], len, sec.cello, { a: 1.5, r: last ? 5 : 1.5, bright: 0.6 });
        if (sec.str) strings(o, t, [t3, r + 7, r + 12], len, sec.str, { a: 1.6, r: last ? 6 : 1.8 });
        if (sec.brass) brass(o, t, [r - 12, t3 - 12, r - 5], len, sec.brass, { a: last ? 2 : 1.2 });
        if (sec.timp && bar >= 44) tom(o, t, F(o, c[2]) * 2, 0.5 + (bar - 44) * 0.12);
        if (last) strings(o, t, [r + 24], len, 0.03, { a: 2, r: 6, bright: 1.2 });
      }
      if (sec.piano && (st === 0 || st === 6 || st === 10)) piano(o, t, [r + 12, r + 19, t3 + 12][st === 0 ? 0 : st === 6 ? 1 : 2], sec.piano, 3);
      if (sec.mel != null && !last) melodyAt(EC.mel, bar % 8, st).forEach(function (n) { strings(o, t, [n[2] + sec.mel], n[3] * six, sec.mv, { a: 0.6, r: 1.4, bright: 1.05 }); });
    }
  };

  var SONGS = [SONG_THEME, SONG_HORROR, SONG_LOWEST, SONG_STANDOFF, SONG_EPILOGUE];

  /* ======================= outros =======================
   * After its last bar every song plays a short outro (song.outroBars) that winds it down, resolves home to
   * E minor (G major for the epilogue) and, bar by bar, eases its tempo and tuning (440 ↔ 432) into whatever
   * plays next: the next song, itself when looping, or the theme after the director's cut. The final outro bar teases the next
   * song's opening, so the hand-off lands on the downbeat instead of a crossfade. */
  SONG_THEME.outroBars = 4;
  SONG_THEME.outro = function (o, t, st, k, N) {   // drums peel away, the bass filter closes, the hook rings out
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.cut = Math.max(320, 1150 - k * 260); o.bassLp.frequency.setTargetAtTime(o.cut * 1.5, t, 0.8);
      o.sub.set(t, 28, 0.04 + 0.2 * fade);
      if (k === 0) { kick(o, t, 1); clank(o, t, 1); pad(o, t, [52, 55, 59, 64], six * 56, 0.05); o.lead.play(t, 64, six * 24, 0.09); }
    }
    if (k < N - 1) bassNote(o, t, 40 + RZ.bass[st], RZ.acc[st] * fade, six * 0.9);
    if (k < 2 && st % 4 === 0) kick(o, t, 1 - k * 0.35);
    if (k < 3 && st % 4 === 2) hat(o, t, 0.8 * fade);
    if (k < 3) arpNote(o, t, [64, 67, 71, 76][RZ.arp[st]], (st % 4 === 0 ? 1 : 0.7) * fade);
    if (k === 1 && st >= 12) tom(o, t, [180, 150, 120, 95][st - 12], 0.8);
  };
  SONG_HORROR.outroBars = 4;
  SONG_HORROR.outro = function (o, t, st, k, N) {   // one last scream, then a heartbeat that slows to almost nothing
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.22 * fade + 0.02);
      if (k === 0) {
        kick(o, t, 1.1); clank(o, t, 1); stab(o, t, [64, 65, 71], 1.2); screech(o, t, 76, six * 16, 0.05);
        strings(o, t, [52, 53, 59], six * 48, 0.035, { a: 0.3, r: 2.5, trem: true, bright: 1.1 });
        if (o.P.choir) pad(o, t, [52, 53, 58], six * 48, 0.03);
      }
      if (k === 1) { piano(o, t, 28, 0.9, 5); piano(o, t, 29, 0.6, 5); }
    }
    if (k === 0 && (st === 4 || st === 8 || st === 12)) heart(o, t, 0.9);
    if (k === 1 && (st === 0 || st === 8)) heart(o, t, 0.75);
    if (k === 2 && st === 0) heart(o, t, 0.55);
    if (k === 0 && st % 4 === 2) hat(o, t, 0.5);
  };
  SONG_LOWEST.outroBars = 2;
  SONG_LOWEST.outro = function (o, t, st, k) {   // the piano lets go, strings hold the last breath
    var six = o.six;
    if (st === 0 && k === 0) {
      o.sub.set(t, 28, 0.06);
      strings(o, t, [55, 59, 64], six * 28, 0.05, { a: 1, r: 3 });
      strings(o, t, [40], six * 28, 0.05, { a: 0.8, r: 3, bright: 0.6 });
      if (o.P.choir) pad(o, t, [52, 55, 59], six * 28, 0.02);
    }
    if (k === 0 && st % 2 === 0) piano(o, t, [40, 47, 52, 55, 59, 64, 67, 71][st / 2], 0.7 - st * 0.025, 2.6);
    if (k === 1 && st === 0) piano(o, t, 76, 0.45, 5);
  };
  SONG_STANDOFF.outroBars = 4;
  SONG_STANDOFF.outro = function (o, t, st, k, N) {   // half-time, a tape-stop dive, the two hackers' last words
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.18 * fade + 0.03);
      if (k === 0) { stab(o, t, [52, 55, 59], 1.2); o.reese.rate(t, 0.2); o.reese.play(t, 40, six * 26, 0.22); }
      if (k === 1) pad(o, t, [52, 55, 59, 64], six * 40, 0.03);
      if (k === 1) { o.la.play(t, 76, six * 6, 0.07); }
      if (k === 2) { o.la.play(t, 67, six * 14, 0.05); o.lb.play(t, 64, six * 14, 0.045); }
    }
    if (k === 0 && st === 8) o.reese.bend(t, 28, six * 5);
    if (k === 1 && st === 8) o.lb.play(t, 71, six * 8, 0.065);
    if (k < 2) {
      if (st === 0) kick(o, t, 1);
      if (st === 8) snare(o, t, 0.9 - k * 0.3);
      if (st % 4 === 2) hat(o, t, 0.6 * fade);
      if (st % 8 === 0) ride(o, t, 0.6 * fade);
    }
  };
  SONG_EPILOGUE.outroBars = 2;
  SONG_EPILOGUE.outro = function (o, t, st, k) {   // a last glint of light over the held chord
    if (st === 0 && k === 0) { o.bin.level(t, 0.0001); o.sub.set(t, 31, 0.05); }
    if (k === 0 && (st === 0 || st === 4 || st === 8)) piano(o, t, [79, 83, 86][st / 4], 0.28, 3.5);
  };
  // the next song's opening, faded in under the outro's last bar (f runs 0 → 1 across it)
  function foreshadow(o, t, st, si, f) {
    var six = o.six;
    if (si === 0) {   // Ring Zero's 16th-note pulse, filter still shut
      if (st === 0) { o.cut = 380; o.bassLp.frequency.setTargetAtTime(560, t, 0.3); }
      bassNote(o, t, 40 + RZ.bass[st], 0.2 + 0.6 * f, six * 0.9);
      if (st >= 8 && st % 4 === 2) hat(o, t, 0.5);
    } else if (si === 1) {   // a heartbeat and a dissonant shiver
      if (st === 0 || st === 8) heart(o, t, 0.5 + 0.3 * f);
      if (st === 0) strings(o, t, [64, 65, 71], six * 16, 0.025, { a: six * 10, r: 0.6, trem: true, bright: 1.3 });
    } else if (si === 2) {   // a few lonely piano notes
      if (st % 4 === 0) piano(o, t, [52, 55, 59, 64][st / 4], 0.45, 2.4);
    } else if (si === 3) {   // hats and a cold pad
      if (st % 2 === 0) hat(o, t, 0.2 + 0.45 * f);
      if (st === 0) pad(o, t, [52, 55, 59, 64], six * 16, 0.025);
    } else if (si === 4) {   // dawn: a warm G chord
      if (st === 0) pad(o, t, [55, 59, 62, 67], six * 18, 0.03, "warm");
      if (st === 0 || st === 8) piano(o, t, st ? 74 : 67, 0.3, 3);
    } else if (si === 6) {   // a kick through the wall of the next room, an offbeat hat
      if (st % 4 === 0) kick(o, t, 0.35 + 0.5 * f);
      if (st >= 8 && st % 4 === 2) hat(o, t, 0.5, true);
    } else if (si === 7) {   // a few soft piano notes over C major 7
      if (st === 0 || st === 6 || st === 10) piano(o, t, [60, 64, 71][st === 0 ? 0 : st === 6 ? 1 : 2], 0.4, 3);
    } else if (si === 8) {   // palm-muted chugs on low E, getting closer
      if (st % 2 === 0 || st >= 12) power(o, t, 40, six * 0.9, 0.3 + 0.6 * f, { mute: 1 });
    } else if (si === 9) {   // an engine idling, the first red light
      if (st % 2 === 0) rev(o, t, 28, 0.25 + 0.3 * f);
      if (st === 8) beep(o, t, 69, six * 3, 0.8);
    }
  }
  function outroStep(o, t, st, k) {
    var song = o.song, N = song.outroBars;
    if (!o.tgt) {   // decided once, at the outro's first step
      var ti = o.loop ? o.si : nextIdx(o.theme, o.si), ts = TRACKS[ti];
      o.tgt = { si: ti, six: 60 / (ts.bpm * o.P.bpm) / 4, ref: ts.ref || 440, six0: o.six, ref0: o.ref };
    }
    var g = o.tgt, f = (k * 16 + st + 1) / (N * 16), e = f * f * (3 - 2 * f);
    o.six = o.dur = g.six0 + (g.six - g.six0) * e;   // tempo glides into the next song's
    o.ref = g.ref0 + (g.ref - g.ref0) * e;             // and so does the tuning (432 ↔ 440)
    song.outro(o, t, st, k, N);
    if (k === N - 2 && st === 0 && [0, 1, 3, 6, 8, 9].indexOf(g.si) >= 0) riser(o, t, o.six * 32, 0.1);   // lift into something fast
    if (k === N - 1) foreshadow(o, t, st, g.si, (st + 1) / 16);
  }
  function unTarget(o) { if (o && o.tgt) { o.six = o.dur = o.tgt.six0; o.ref = o.tgt.ref0; o.tgt = null; } }

  /* ======================= track 6 · the director's cut (secret) =======================
   * Not a medley: one long original piece telling the same story with the same motifs, arranged anew and in
   * story order. A cold open where a lone piano plays the Ring Zero hook · the machine booting up, the hook
   * reharmonised (Em G D B) over a new syncopated groove · something follows (the chase's E–F cluster, a
   * heartbeat kick, the hook crawling in the low brass) · two cursors at 172, where hacker B now answers with
   * the hook · the last commit, every motif at once · the collapse · 3 AM (the lowest point's melody, then the
   * hook on cello) · dawn at A=432, where the horns finally play the hook in G major.
   * One tempo map (CUT.tempo) carries it: it accelerates and slows between chapters, it never cuts. */
  var CUT = {
    chapters: [[0, "cold open"], [16, "boot sequence"], [32, "the machine"], [80, "something follows"], [104, "two cursors"], [180, "the last commit"], [196, "collapse"], [204, "3 AM"], [244, "dawn"]],
    // [bar, bpm]: straight lines between points; a repeated bar is a jump (196: 172 → 86, the half-time fall)
    tempo: [[0, 76], [16, 76], [32, 112], [80, 112], [84, 138], [104, 138], [108, 172], [196, 172], [196, 86], [204, 72], [244, 72], [248, 60], [300, 60]],
    prog: [[40, 0], [43, 1], [38, 1], [35, 1]]   // Em G D B: the hook's new harmony
  };
  var CUT_MOOD = "the director's cut · the same story, told once, end to end";
  function cutBpm(pos) {
    var T = CUT.tempo, i = T.length - 1;
    while (i > 0 && T[i][0] > pos) i--;
    var a = T[i], b = T[i + 1];
    if (!b || b[0] <= a[0]) return a[1];
    return a[1] + (b[1] - a[1]) * (pos - a[0]) / (b[0] - a[0]);
  }
  function hookAt(pos) { return RZ.lead.filter(function (n) { return n[0] === pos; }); }   // pos: 16ths into the 8-bar hook

  function cutCold(o, t, st, bar) {   // 0–16 · 76 bpm · the hook alone on piano, over its own chords
    var ch = RZ.chords[Math.floor(bar / 2) % 4], six = o.six, pos = (bar % 8) * 16 + st;
    if (st === 0) {
      o.sub.set(t, ch.bass - 12, bar < 4 ? 0.05 : 0.09);
      if (bar % 2 === 0) { piano(o, t, ch.bass, 0.45, six * 30); piano(o, t, ch.bass + 7, 0.3, six * 30); }
      if (bar >= 8 && bar % 2 === 0) strings(o, t, ch.pad, six * 32, 0.03, { a: 1.5, r: 2 });
      if (o.P.choir && bar >= 8 && bar % 4 === 0) pad(o, t, ch.pad.slice(0, 3), six * 64, 0.02);
      if (bar < 8) heart(o, t, 0.45);
      if (bar === 12) riser(o, t, six * 64, 0.06);
    }
    hookAt(pos).forEach(function (n) { piano(o, t, n[1], bar < 8 ? 0.75 : 0.85, n[2] * six * 1.4); if (bar >= 8) piano(o, t, n[1] - 12, 0.35, n[2] * six); });
    if (bar >= 12 && st % 4 === 2) hat(o, t, 0.2 + (bar - 12) * 0.08);
  }
  function cutMachine(o, t, st, bar) {   // 16–80 · 76 → 112 · boot, groove, breakdown, the hook over Em G D B
    var c = CUT.prog[Math.floor(bar / 2) % 4], r = c[0], tri = triad(r + 24, c[1]), six = o.six, pos = (bar % 8) * 16 + st;
    var boot = bar < 32, brk = bar >= 48 && bar < 56, full = bar >= 56;
    o.cut = boot ? 300 + (bar - 16) * 55 : brk ? 500 : full ? 1500 : 1200;
    if (st === 0) {
      o.bassLp.frequency.setTargetAtTime(o.cut * 1.5, t, 0.8);
      o.sub.set(t, r - 12, boot ? 0.12 : 0.24);
      if (bar % 2 === 0) pad(o, t, tri.concat(r + 36), six * 32, brk ? 0.05 : 0.035);
      if (bar === 28 || bar === 52) riser(o, t, six * 64, 0.1);
      if (full && bar % 4 === 0 && o.P.brass > 1) brass(o, t, tri.map(function (n) { return n - 12; }), six * 6, 0.07, { a: 0.05 });
      if (full && bar % 2 === 0) o.lb.play(t, tri[1] + 12, six * 28, 0.03);   // a held counter-line on the chord's third
    }
    var BS = { 0: [0, 1], 3: [0, 0.6], 6: [12, 0.8], 8: [0, 0.9], 11: [0, 0.6], 14: [12, 0.8] };   // a new, syncopated bass
    if (!brk && BS[st] && bar >= 20) bassNote(o, t, r + BS[st][0], BS[st][1], six * 1.6);
    if (!(brk && st % 2)) arpNote(o, t, [tri[0], tri[1], tri[2], tri[0] + 12][[0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 2][st]], st % 4 === 0 ? 0.9 : 0.6);
    var fill = bar % 8 === 7 && st >= 12 && !boot;
    if (bar >= 24 && !brk && (st === 0 || st === 7 || st === 10) && !fill) kick(o, t, st ? 0.8 : 1);
    if (!boot && !brk && (st === 4 || st === 12)) snare(o, t, 1);
    if (bar >= 20 && st % 2 === 0) hat(o, t, (st % 4 === 2 ? 0.9 : 0.5) * (brk ? 0.5 : 1), st === 14 && bar % 2 === 1);
    if (!boot && !brk && st === 10 && bar % 2 === 1) clank(o, t, 0.7);
    if (fill) tom(o, t, [180, 150, 120, 95][st - 12], 1);
    if (bar === 31 && st >= 8) snare(o, t, 0.3 + (st - 8) * 0.08);
    if (brk || full) hookAt(pos).forEach(function (n) { o.lead.play(t, n[1], n[2] * six, brk ? 0.1 : 0.085); if (brk) piano(o, t, n[1] + 12, 0.4, n[2] * six * 1.2); });
  }
  function cutFollows(o, t, st, bar) {   // 80–104 · 112 → 138 · a heartbeat kick, the cluster, the hook in the low brass
    var ch = KP.chords[Math.floor(bar / 2) % 4], six = o.six, k = bar - 80;
    o.cut = 1300;
    if (st === 0) {
      o.sub.set(t, ch.bass - 12, 0.22); o.bassLp.frequency.setTargetAtTime(1900, t, 0.5);
      if (bar % 2 === 0) strings(o, t, ch.cl.map(function (n) { return n + 12; }), six * 32, 0.025, { a: 0.6, r: 1, trem: true, bright: 1.3 });
      if (k === 0) { stab(o, t, ch.cl, 1.2); clank(o, t, 1); }
      if (bar === 100) riser(o, t, six * 64, 0.12);
      if (o.P.choir && bar % 4 === 0) pad(o, t, [ch.bass + 12, ch.bass + 13, ch.bass + 18], six * 64, 0.025);
    }
    if (st === 0 || st === 8) heart(o, t, 0.6);
    if (st === 0 || st === 3 || st === 8 || st === 11) kick(o, t, st % 8 ? 0.7 : 1);   // lub-dub, lub-dub
    if (k >= 4 && (st === 4 || st === 12)) snare(o, t, 0.9);
    if (st % 2 === 0) hat(o, t, st % 4 === 2 ? 0.8 : 0.4);
    if (k >= 4) bassNote(o, t, ch.bass + KP.bass[st], st % 4 === 0 ? 1 : 0.6, six * 0.85);
    if (k >= 4 && bar % 2 === 0 && KP.stab.indexOf(st) >= 0) stab(o, t, ch.cl, 0.6);
    if (bar % 4 === 3 && st === 8) screech(o, t, ch.cl[2] + 12, six * 8, 0.04);
    if (k >= 8) { var p = (k - 8) * 16 + st; if (p % 2 === 0) hookAt(p / 2).forEach(function (n) { brass(o, t, [n[1] - 24], n[2] * six * 2, 0.06, { a: 0.08 }); }); }
  }
  function cutCursors(o, t, st, bar) {   // 104–196 · 138 → 172 · the standoff, then the last commit
    var six = o.six, intro = bar < 108, build = bar >= 108 && bar < 116, brk = bar >= 140 && bar < 148, drop2 = bar >= 148 && bar < 180, last = bar >= 180;
    var root, maj, c;
    if (last) { c = CUT.prog[Math.floor((bar - 180) / 2) % 4]; root = c[0]; maj = c[1]; }
    else if (brk) { c = LM.chords[Math.floor((bar - 140) / 2) % 8]; root = c[0] - 12; maj = c[1]; }
    else { c = RC.chords[Math.floor(bar / 2) % 4]; root = c[0]; maj = c[1]; }
    var drums = !intro && !build && !brk;
    if (bar === 195 && st >= 8) return;   // a breath before the fall
    if (st === 0) {
      o.sub.set(t, root - 12, drums ? 0.2 : 0.12);
      if (bar % 2 === 0 && (build || brk || last)) pad(o, t, triad(root + 12, maj).concat(root + 24), six * 32, brk ? 0.04 : 0.025);
      if (bar % 2 === 0 && (brk || last)) strings(o, t, triad(root + 24, maj), six * 32, 0.045, { a: 0.6 });
      if (bar === 112 || bar === 144 || bar === 176) riser(o, t, six * 64, 0.11);
      if (drums) o.reese.rate(t, bar % 4 === 3 ? 2 : 0.35);
      if (last && o.P.choir && bar % 2 === 0) pad(o, t, triad(root + 12, maj), six * 32, 0.03);
    }
    if (intro) {   // the roll speeds up with the tempo, the reese wakes
      if (st % (bar < 106 ? 2 : 1) === 0) snare(o, t, 0.25 + 0.5 * ((bar - 104) * 16 + st) / 64);
      if (st === 0) kick(o, t, 1);
      if (bar >= 106) RC.bass.forEach(function (b) { if (b[0] === st) o.reese.play(t, 40 + b[1], b[2] * six, 0.12); });
      return;
    }
    if (drums) {
      var fill = bar % 8 === 7 && st >= 12;
      if (st === 0 || st === 10 || (bar % 2 === 1 && st === 13)) kick(o, t, 1);
      if (st === 4 || st === 12) snare(o, t, 1);
      if (RC.ghost[st]) snare(o, t, RC.ghost[st]);
      if (st % 2 === 0) hat(o, t, st % 4 === 2 ? 0.9 : 0.45);
      if ((drop2 || last) && st % 4 === 0) ride(o, t, 0.8);
      if (fill) tom(o, t, [190, 160, 130, 100][st - 12], 0.9);
      RC.bass.forEach(function (b) { if (b[0] === st) o.reese.play(t, root + b[1], b[2] * six, 0.2); });
      if ((drop2 || last) && bar % 2 === 0 && (st === 0 || st === 10)) stab(o, t, triad(root + 12, maj), 0.7);
    } else if (st % 4 === 2) hat(o, t, 0.6);
    function phrase(lead, list, vol) { list.forEach(function (n) { if (n[0] === st) lead.play(t, n[1], n[2] * six, vol); }); }
    if (brk) {   // the lowest point's melody, half speed, over its own chords
      var mstep = ((bar - 140) % 2) * 16 + st;
      if (mstep % 2 === 0) melodyAt(LM.mel, Math.floor((bar - 140) / 2) % 8, mstep / 2).forEach(function (n) { strings(o, t, [n[2] + 12], n[3] * six * 2, 0.06, { a: 0.3, r: 1 }); });
      return;
    }
    if (last) {   // everything at once: the hook in brass and high strings, the hackers underneath
      hookAt(((bar - 180) % 8) * 16 + st).forEach(function (n) { brass(o, t, [n[1] - 12], n[2] * six, 0.07, { a: 0.03 }); strings(o, t, [n[1] + 12], n[2] * six, 0.03, { a: 0.05, r: 0.4 }); });
      phrase(bar % 2 ? o.lb : o.la, bar % 2 ? RC.b1 : RC.a1, 0.04);
      return;
    }
    // A calls with its own phrases; B answers with the Ring Zero hook, the phrase that fits the chord
    var trade = drop2 ? 2 : 4, aTurn = build || (trade === 4 ? bar % 4 < 2 : bar % 2 === 0), phr = Math.floor(bar / 2) % 4;
    if (aTurn) phrase(o.la, bar % 2 ? RC.a2 : RC.a1, 0.07);
    else if (trade === 4) hookAt(phr * 32 + (bar % 2) * 16 + st).forEach(function (n) { o.lb.play(t, n[1] + 12, n[2] * six, 0.065); });
    else hookAt(phr * 32 + st * 2).forEach(function (n) { o.lb.play(t, n[1] + 12, n[2] * six / 2, 0.065); });   // twice as fast
  }
  function cutCollapse(o, t, st, bar) {   // 196–204 · 86 → 72 · the hit, a tape-stop dive, a heartbeat running down
    var six = o.six, k = bar - 196;
    if (st === 0) {
      o.sub.set(t, 28, Math.max(0.04, 0.2 - k * 0.02));
      if (k === 0) {
        kick(o, t, 1.2); tom(o, t, 62, 1); stab(o, t, [52, 55, 59, 64], 1.3);
        o.reese.rate(t, 0.2); o.reese.play(t, 40, six * 24, 0.22);
        strings(o, t, [28, 40, 47], six * 48, 0.06, { a: 0.01, r: 4, bright: 0.7 });
      }
      if (k === 2) strings(o, t, [52, 53, 59], six * 64, 0.03, { a: 0.5, r: 3, trem: true, bright: 1.1 });
      if (k === 5) { piano(o, t, 28, 0.8, 6); piano(o, t, 29, 0.5, 6); }
    }
    if (k === 0 && st === 4) o.reese.bend(t, 16, six * 6);
    if (k >= 1 && k < 6 && (st === 0 || (k < 3 && st === 8))) heart(o, t, 0.8 - k * 0.1);
  }
  function cutThreeAm(o, t, st, bar) {   // 204–244 · 72 · piano and strings; at the end the hook on cello
    var k = bar - 204, six = o.six, barLen = six * 16, r, t3, hookPart = k >= 32;
    if (hookPart) { var hi = Math.floor((k - 32) / 2) % 4; r = RZ.chords[hi].bass + 12; t3 = r + (hi % 2 ? 4 : 3); }   // Em C Am B
    else { var c = LM.chords[k % 8]; r = c[0]; t3 = r + (c[1] ? 4 : 3); }
    if (st === 0) {
      o.sub.set(t, r - 24, k >= 24 && !hookPart ? 0.12 : 0.05);
      if (k < 8 || hookPart) pad(o, t, [r, t3, r + 7], barLen * 1.05, 0.016, "warm");
      if (k >= 8) strings(o, t, [r - 12], barLen * 1.02, 0.05, { a: 0.9, r: 1.2, bright: 0.6 });
      if (k >= 16 && !hookPart) strings(o, t, [t3, r + 7, r + 12], barLen * 1.02, k >= 24 ? 0.065 : 0.05, { a: 1.2, r: 1.4 });
      if (k >= 24 && !hookPart && k % 2 === 0) tom(o, t, F(o, r - 24) * 2, 0.55);
      if (o.P.choir && k >= 24 && !hookPart && k % 2 === 0) pad(o, t, [r, t3, r + 7], barLen * 2, 0.025);
      if (k % 2 === 0) piano(o, t, r + 24, 0.25, 4);   // a music-box glint, new to this telling
      if (k === 39) pad(o, t, [55, 59, 62], barLen * 2, 0.03, "warm");   // dawn is coming: G
    }
    if (st % 2 === 0) piano(o, t, [r - 12, r, t3, r + 7, r + 12, r + 7, t3, r][st / 2], (hookPart ? 0.45 : 0.7) * (st === 0 ? 1 : 0.75), 2.4);
    if (!hookPart && k >= 8) {
      var oct = k < 16 ? -12 : k < 24 ? 0 : 12;
      melodyAt(LM.mel, k % 8, st).forEach(function (n) { strings(o, t, [n[2] + oct], n[3] * six, 0.06, { a: 0.35, r: 0.9, bright: 1.1 }); });
    }
    if (hookPart) hookAt(((k - 32) % 8) * 16 + st).forEach(function (n) { strings(o, t, [n[1] - 24], n[2] * six, 0.07, { a: 0.2, r: 1, bright: 0.7 }); });
  }
  function cutDawn(o, t, st, bar) {   // 244–300 · 72 → 60, A=432 · the epilogue's melody, then the hook in G major
    var eb = bar - 248, six = o.six, barLen = six * 16, c = EC.chords[Math.max(0, eb) % 8], r = c[0], t3 = r + (c[1] ? 4 : 3), last = bar === 299;
    var len = last ? barLen * 4 : barLen * 1.03;
    if (st === 0) {
      if (bar === 244) o.bin.level(t, 1);
      if (eb === 44) o.bin.level(t, 0.0001);
      o.sub.set(t, c[2] - 12, 0.08);
      if (eb < 32) pad(o, t, [r, t3, r + 7, r + 12], len, eb < 0 ? 0.035 : 0.025, "warm");
      if (eb >= 8) strings(o, t, [c[2]], len, 0.05, { a: 1.5, r: last ? 5 : 1.5, bright: 0.6 });
      if (eb >= 12) strings(o, t, [t3, r + 7, r + 12], len, 0.045, { a: 1.6, r: last ? 6 : 1.8 });
      if (eb >= 28) brass(o, t, [r - 12, t3 - 12, r - 5], len, eb >= 40 ? 0.05 : 0.035, { a: last ? 2 : 1.2 });
      if (eb >= 44) tom(o, t, F(o, c[2]) * 2, 0.5 + (eb - 44) * 0.08);
      if (last) strings(o, t, [r + 24], len, 0.03, { a: 2, r: 6, bright: 1.2 });
    }
    if (eb < 20 && st % 2 === 0) piano(o, t, [r + 12, t3 + 12, r + 19, r + 24][(st / 2) % 4], 0.16, 1.6);   // harp-like ripples
    if (eb >= 12 && eb < 40) {
      var oct = eb >= 24 ? 12 : 0;
      melodyAt(EC.mel, eb % 8, st).forEach(function (n) { strings(o, t, [n[2] + oct], n[3] * six, 0.05, { a: 0.6, r: 1.4, bright: 1.05 }); });
    }
    if (eb >= 40 && eb < 48 && st % 2 === 0)   // the horns finally sing the hook, in G major, at half speed
      hookAt(((eb - 40) * 16 + st) / 2).forEach(function (n) { brass(o, t, [n[1] - 12], n[2] * six * 2, 0.075, { a: 0.25 }); });
  }
  var SONG_CUT = {
    mood: CUT_MOOD, bpm: 76, bars: 300, outroBars: 2,
    tempo: cutBpm,
    refAt: function (pos) { return pos < 244 ? 440 : pos < 248 ? 440 - 2 * (pos - 244) : 432; },   // dawn retunes to A=432
    chapter: function (bar) { var name = CUT.chapters[0][1]; CUT.chapters.forEach(function (c) { if (bar >= c[0]) name = c[1]; }); return name; },
    init: function (o, t) {
      o.sub = makeSub(o, t); o.lead = makeLead(o, t, o.P.lead, 0); o.la = makeLead(o, t, o.P.lead, -0.6); o.lb = makeLead(o, t, o.P.lead2, 0.6);
      o.reese = makeReese(o, t); o.bin = makeBinaural(o, t, 108, 2.5, 0.03);
    },
    play: function (o, t, st, bar) {
      if (bar < 16) cutCold(o, t, st, bar);
      else if (bar < 80) cutMachine(o, t, st, bar);
      else if (bar < 104) cutFollows(o, t, st, bar);
      else if (bar < 196) cutCursors(o, t, st, bar);
      else if (bar < 204) cutCollapse(o, t, st, bar);
      else if (bar < 244) cutThreeAm(o, t, st, bar);
      else cutDawn(o, t, st, bar);
    },
    outro: SONG_EPILOGUE.outro
  };
  /* ======================= bonus tracks 7–10 · one per arcade game, unlocked by finishing a run =======================
   * Same rules as the five songs: E minor, A=440, an outro that glides into whatever comes next and a foreshadow
   * of each one's opening, so any track can hand over to any other. Once unlocked they join the main rotation
   * after the five songs, then it goes round again to Ring Zero. */
  function noiseL(t, d) { var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + d + 0.05); return s; }
  function bigKick(o, t, v) {   // a techno kick: long dive, a click, driven, and it ducks everything
    var s = osc("sine", 190, t, t + 0.9), g = gain(0), sh = shaper(1.8);
    s.frequency.exponentialRampToValueAtTime(o.P.kickLow * 0.92, t + 0.12);
    env(g, t, 0.002, 0.7, 0.95 * v); s.connect(sh); sh.connect(g); g.connect(o.drums);
    var c = noise(t, 0.015), cf = filt("highpass", 3000), cg = gain(0); env(cg, t, 0.001, 0.012, 0.3 * v); c.connect(cf); cf.connect(cg); cg.connect(o.drums);
    duckAt(o, t, 0.16);
  }
  function clap(o, t, v) {
    var n = noise(t, 0.35), bp = filt("bandpass", 1300, 1.1), g = gain(0);
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.011, 0.022].forEach(function (d) { g.gain.setValueAtTime(0.36 * v, t + d); g.gain.exponentialRampToValueAtTime(0.03 * v, t + d + 0.009); });
    g.gain.setValueAtTime(0.3 * v, t + 0.033); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp); bp.connect(g); g.connect(o.drums); send(o, g, 0.6 * v);
  }
  function crash(o, t, v) { var n = noiseL(t, 2), hp = filt("highpass", 4800, 0.6), g = gain(0); env(g, t, 0.002, 1.8, 0.1 * v); n.connect(hp); hp.connect(g); g.connect(o.drums); send(o, g, 0.5); }
  function boom(o, t, v) { var s = osc("sine", 72, t, t + 2.2), g = gain(0); s.frequency.exponentialRampToValueAtTime(30, t + 1.6); env(g, t, 0.004, 1.9, 0.55 * v); s.connect(g); g.connect(o.bus); send(o, g, 0.6); }
  function subDrop(o, t, len, v) {   // the floor falls away before a drop
    var s = osc("sine", 120, t, t + len + 0.1), g = gain(0), sh = shaper(1.5);
    s.frequency.exponentialRampToValueAtTime(28, t + len);
    swell(g, t, 0.02, len * 0.6, len * 0.4, 0.5 * v); s.connect(sh); sh.connect(g); g.connect(o.bus);
  }
  function techStab(o, t, notes, v, bright) {   // a dub-techno chord stab, thrown into the echo
    var lp = filt("lowpass", 900, 4), g = gain(0);
    lp.frequency.setValueAtTime(600 + 2600 * (bright || 0.5), t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    env(g, t, 0.003, 0.24, 0.05 * v);
    notes.forEach(function (m) { [-7, 7].forEach(function (d) { osc("sawtooth", F(o, m), t, t + 0.35, d).connect(lp); }); });
    lp.connect(g); g.connect(o.duck); send(o, g, 0.3, 0.75);
  }
  function makeAcid(o, t) {   // a squelchy resonant saw line with accents and slides
    var s = osc("sawtooth", 110, t, t + 36000), lp = filt("lowpass", 400, 14), sh = shaper(2.2), g = gain(0.0001), p = panner(0.15);
    s.connect(lp); lp.connect(sh); sh.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.12, 0.25); o.nodes.push(s);
    return {
      play: function (tt, m, len, vol, cut, acc, slide) {
        s.frequency.setTargetAtTime(F(o, m), tt, slide ? 0.04 : 0.003);
        var gg = g.gain; gg.cancelScheduledValues(tt); gg.setTargetAtTime(vol, tt, 0.004); gg.setTargetAtTime(0.0001, tt + len * 0.8, 0.02);
        var f = lp.frequency; f.cancelScheduledValues(tt); f.setValueAtTime(cut * (acc ? 3.2 : 2), tt); f.setTargetAtTime(cut * 0.5, tt + 0.005, acc ? 0.09 : 0.05);
      }
    };
  }
  function power(o, t, root, len, v, opt) {   // a distorted power chord (root, fifth, octave); mute = a palm-muted chug
    opt = opt || {};
    var mute = !!opt.mute, tone = opt.tone || 1, notes = mute ? [root, root + 7] : [root, root + 7, root + 12], dt = (opt.pan || 0) > 0 ? 9 : 5;
    var sum = gain(0.3), hp = filt("highpass", 85), sh = shaper(Math.min(28, 9 * o.P.drive * tone)), cab = filt("lowpass", (mute ? 1300 : 3400) * (tone < 1 ? 0.6 : 1), 0.8), pk = filt("peaking", 820, 0.9);
    var g = gain(0), p = panner(opt.pan || 0), stop = t + len + 0.35;
    pk.gain.value = 5;
    notes.forEach(function (m) { [-dt, dt].forEach(function (d) { osc("sawtooth", F(o, m), t, stop, d).connect(sum); }); });
    sum.connect(hp); hp.connect(sh); sh.connect(cab); cab.connect(pk); pk.connect(g);
    if (mute) env(g, t, 0.002, Math.min(len, 0.14), 0.1 * v); else swell(g, t, 0.004, len * 0.9, 0.2, 0.075 * v);
    g.connect(p); p.connect(o.duck); send(o, p, mute ? 0.06 : 0.22);
  }
  function makeGuitar(o, t, panV) {   // lead guitar: overdriven saw + square through a cabinet, bends and vibrato
    var a = osc("sawtooth", 220, t, t + 36000, -5), b = osc("square", 220, t, t + 36000, 5), mix = gain(0.5), hp = filt("highpass", 160), sh = shaper(18);
    var cab = filt("lowpass", 3800, 0.9), pk = filt("peaking", 1400, 0.8), g = gain(0.0001), p = panner(panV || 0);
    pk.gain.value = 6;
    [a, b].forEach(function (s) { s.connect(mix); o.vibG.connect(s.detune); o.nodes.push(s); });
    mix.connect(hp); hp.connect(sh); sh.connect(cab); cab.connect(pk); pk.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.3, 0.22);
    return {
      play: function (tt, m, len, vol, bendFrom) {
        var f = F(o, m);
        [a, b].forEach(function (s) {
          if (bendFrom != null) { s.frequency.setTargetAtTime(F(o, bendFrom), tt, 0.003); s.frequency.setTargetAtTime(f, tt + 0.03, 0.05); }
          else s.frequency.setTargetAtTime(f, tt, 0.006);
        });
        var gg = g.gain; gg.cancelScheduledValues(tt); gg.setTargetAtTime(vol, tt, 0.006); gg.setTargetAtTime(vol * 0.6, tt + 0.08, 0.3); gg.setTargetAtTime(0.0001, tt + len * 0.92, 0.04);
      }
    };
  }
  var EMIN = [0, 2, 3, 5, 7, 8, 10];
  function dia(m, steps) {   // move m by scale steps in E minor (for harmony lines)
    var r = ((m - 40) % 12 + 12) % 12, i = EMIN.indexOf(r); if (i < 0) return m - 3;
    var j = i + steps, oct = Math.floor(j / 7); j = ((j % 7) + 7) % 7;
    return m - r + EMIN[j] + oct * 12;
  }
  function voices(o, t, notes, len, vol) {   // a wordless choir: "ooh" formants, a slow swell
    var g = gain(0); swell(g, t, len * 0.3, len * 0.65, len * 0.35 + 0.8, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) {
      var v = osc("sawtooth", F(o, m), t, t + len + 1.2, Math.random() * 10 - 5), f1 = filt("bandpass", 400, 5), f2 = filt("bandpass", 900, 6), cg = gain(1.6);
      v.connect(f1); v.connect(f2); f1.connect(cg); f2.connect(cg); cg.connect(g); vibrato(o, v);
    });
    g.connect(o.duck); send(o, g, 0.9);
  }
  function spic(o, t, m, v) { strings(o, t, [m], o.six * 0.7, 0.05 * v, { a: 0.004, r: 0.09, bright: 1.5 }); }   // spiccato strings
  function beep(o, t, m, len, v) { var s = osc("sine", F(o, m), t, t + len + 0.1), g = gain(0); swell(g, t, 0.005, len, 0.05, 0.07 * v); s.connect(g); g.connect(o.bus); send(o, g, 0.3); }
  function rev(o, t, m, v) {   // an engine idling: a gritty low blip
    var s = osc("sawtooth", F(o, m), t, t + 0.14), lp = filt("lowpass", 420, 2), g = gain(0); env(g, t, 0.003, 0.09, 0.09 * v); s.connect(lp); lp.connect(g); g.connect(o.drums);
  }
  function flyby(o, t, len, v) {   // a car screams past, left to right, its pitch dropping as it goes
    var g = gain(0), lp = filt("lowpass", 2200, 2), sh = shaper(3), p = panner(-0.9);
    [["sawtooth", 1, 0], ["square", 2, 12]].forEach(function (x) {
      var s = osc(x[0], 260 * x[1], t, t + len + 0.1, x[2]);
      s.frequency.exponentialRampToValueAtTime(430 * x[1], t + len * 0.48); s.frequency.exponentialRampToValueAtTime(180 * x[1], t + len);
      s.connect(sh);
    });
    if (p.pan) { p.pan.setValueAtTime(-0.9, t); p.pan.linearRampToValueAtTime(0.9, t + len); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * v, t + len * 0.48); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    sh.connect(lp); lp.connect(g); g.connect(p); p.connect(o.bus); send(o, p, 0.4);
  }

  // 7 · Sidekiq Rush · underground techno (132 bpm): rolling bass, acid, three drops
  var DQ = {
    roots: [40, 40, 36, 38],   // E E C D, two bars each
    chords: { 40: [52, 55, 59, 62], 36: [48, 52, 55, 59], 38: [50, 54, 57, 62] },
    roll: [null, 0, 12, 0, null, 0, 12, 7, null, 0, 12, 0, null, 12, 10, 7],   // 16ths that roll around the kick
    acid: [0, 12, 0, 3, null, 0, 15, 12, 0, 7, 0, 10, null, 12, 3, 5],
    accent: { 0: 1, 6: 1, 10: 1, 13: 1 }, slide: { 3: 1, 7: 1, 14: 1 },
    stab: [3, 6, 11, 14],
    lead: [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 74, 8], [16, 72, 6], [22, 71, 2], [24, 67, 8],
      [32, 76, 4], [36, 79, 4], [40, 78, 2], [42, 74, 6], [48, 71, 16],
      [64, 76, 4], [68, 74, 2], [70, 71, 2], [72, 74, 8], [80, 72, 6], [86, 74, 2], [88, 76, 8],
      [96, 79, 6], [102, 78, 2], [104, 76, 4], [108, 74, 4], [112, 71, 16]],
    sec: function (bar) {
      if (bar < 8) return { id: "boot", kick: 1, hats: bar >= 4 ? 1 : 0, roll: 0.35, cut: 260 + bar * 40 };
      if (bar < 24) return { id: "groove", kick: 1, hats: 2, clap: 1, roll: 0.7, cut: 520 + (bar - 8) * 25, acid: bar >= 16 ? 0.5 : 0, acut: 380 + (bar - 16) * 30 };
      if (bar < 32) return { id: "build", kick: 1, hats: 2, clap: bar < 28 ? 1 : 0, roll: 0.75, cut: 900, acid: 0.8, acut: 600 + (bar - 24) * 160, sroll: bar >= 28 ? 28 : 0, gap: bar === 31 };
      if (bar < 48) return { id: "drop", big: 1, hats: 3, clap: 1, reese: 1, stab: 1, acid: 0.6, acut: 900, cut: 1400, hit: bar === 32 };
      if (bar < 56) return { id: "breakdown", pad: 1, stab: 0.6, lead: 0.08, acid: 0.45, acut: 500 + (bar - 48) * 60 };
      if (bar < 64) return { id: "build", kroll: 1, hats: bar >= 60 ? 2 : 1, pad: bar < 60 ? 1 : 0, lead: 0.07, roll: 0.6, cut: 500 + (bar - 56) * 120, sroll: bar >= 60 ? 60 : 0, gap: bar === 63, acid: 0.6, acut: 700 + (bar - 56) * 200 };
      if (bar < 88) return { id: "drop", big: 1, hats: 3, clap: 1, reese: 2, stab: 1, lead: 0.085, acid: 0.55, acut: 1300, cut: 1600, ride: 1, gap: bar === 79, hit: bar === 64 || bar === 80 };
      if (bar < 96) return { id: "tunnel", big: 1, hats: 1, roll: 0.8, cut: 700, acid: 0.85, acut: 500 + (bar - 88) * 150, clank: 1, sroll: bar >= 92 ? 92 : 0, gap: bar === 95 };
      return { id: "drop", big: 1, hats: 3, clap: 1, reese: 2, stab: 1, lead: 0.09, cut: 1600, ride: 1, acid: 0.4, acut: 1000, fill: bar === 111, hit: bar === 96 };
    }
  };
  var SONG_QUEUE = {
    mood: "Sidekiq Rush · underground techno, heavy bass drops", bpm: 132, bars: 112,
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.acid = makeAcid(o, t); o.lead = makeLead(o, t, o.P.lead, 0.2); },
    play: function (o, t, st, bar) {
      var sec = DQ.sec(bar), root = DQ.roots[Math.floor(bar / 2) % 4], six = o.six, hush = sec.gap && st >= 8;
      o.cut = sec.cut || 400;
      if (st === 0) {
        o.bassLp.frequency.setTargetAtTime(o.cut * 1.6, t, 0.6);
        o.sub.set(t, root - 12, sec.reese ? 0.3 : sec.big || sec.kick ? 0.2 : 0.08);
        if (sec.pad && bar % 2 === 0) pad(o, t, DQ.chords[root], six * 32, 0.035);
        if (sec.reese) o.reese.rate(t, sec.reese === 2 && bar % 4 === 3 ? 1 / (six * 2) : 0.5);   // the bass starts to wobble at each phrase end
        if (sec.hit) { crash(o, t, 1); boom(o, t, 1); o.reese.play(t, root + 12, six * 4, 0.27); o.reese.bend(t, root, six * 1.2); }   // the drop: the bass dives an octave
        else if (sec.id === "drop" && bar % 8 === 0) crash(o, t, 0.6);
        if (bar === 28 || bar === 60 || bar === 92) riser(o, t, six * 64, 0.13);
      }
      if (sec.gap && st === 8) { o.sub.set(t, root - 12, 0.0001); subDrop(o, t, six * 8, 1); }
      if (hush) return;
      if (sec.kick && st % 4 === 0) kick(o, t, 1);
      if (sec.big && st % 4 === 0) bigKick(o, t, 1);
      if (sec.kroll) { var ev = bar < 60 ? 4 : bar < 62 ? 2 : 1; if (st % ev === 0) bigKick(o, t, 0.55 + 0.45 * ((bar - 56) * 16 + st) / 128); }
      if (sec.clap && (st === 4 || st === 12)) clap(o, t, 1);
      if (sec.hats === 1 && st % 4 === 2) hat(o, t, 0.7);
      if (sec.hats >= 2) { if (st % 4 === 2) hat(o, t, 0.9, true); else if (st % 2 === 1) hat(o, t, sec.hats === 3 ? 0.5 : 0.3); }
      if (sec.ride && st % 4 === 0) ride(o, t, 0.55);
      if (sec.clank && st === 10) clank(o, t, 0.7);
      if (sec.sroll) { var rb = bar - sec.sroll, every = rb < 2 ? 4 : rb < 3 ? 2 : 1; if (st % every === 0) snare(o, t, 0.2 + 0.6 * (rb * 16 + st) / 64); }
      var r = DQ.roll[st];
      if (sec.roll && r != null) bassNote(o, t, root + r, sec.roll * (st % 2 ? 0.7 : 0.9), six * 0.8);
      if (sec.reese && r != null && !(sec.hit && st < 4)) o.reese.play(t, root + (r === 12 ? 12 : 0), six * 0.9, 0.22);
      if (sec.acid && DQ.acid[st] != null) o.acid.play(t, 52 + DQ.acid[st] + (root - 40), six * (DQ.slide[st] ? 1.1 : 0.7), 0.07 * sec.acid, sec.acut, DQ.accent[st], DQ.slide[st]);
      if (sec.stab && DQ.stab.indexOf(st) >= 0 && (bar % 2 === 1 || st !== 3)) techStab(o, t, DQ.chords[root], sec.stab * (st === 3 ? 1 : 0.7), sec.id === "drop" ? 0.8 : 0.4);
      if (sec.lead) { var pos = (bar % 8) * 16 + st; DQ.lead.forEach(function (n) { if (n[0] === pos) o.lead.play(t, n[1], n[2] * six, sec.lead); }); }
      if (sec.fill && st >= 8) tom(o, t, [200, 180, 160, 140, 120, 100, 90, 80][st - 8], 0.9);
    }
  };
  SONG_QUEUE.outroBars = 4;
  SONG_QUEUE.outro = function (o, t, st, k, N) {   // the bass tape-stops, the kick walks away, one dub stab echoes home
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.25 * fade + 0.02);
      if (k === 0) { crash(o, t, 1); boom(o, t, 0.8); o.reese.rate(t, 0.3); o.reese.play(t, 40, six * 14, 0.24); }
      if (k === 1) pad(o, t, [52, 55, 59, 64], six * 40, 0.03);
      if (k === 2) techStab(o, t, [52, 55, 59, 62], 1, 0.3);
    }
    if (k === 0 && st === 4) o.reese.bend(t, 28, six * 6);
    if (k < 2 && st % 4 === 0) bigKick(o, t, 1 - k * 0.3);
    if (k < 3 && st % 4 === 2) hat(o, t, 0.7 * fade, true);
    if (k < 2 && (st === 4 || st === 12)) clap(o, t, 0.8 - k * 0.3);
    if (k < 3 && DQ.acid[st] != null) o.acid.play(t, 52 + DQ.acid[st], six * 0.7, 0.06 * fade, 500 - k * 120, DQ.accent[st], DQ.slide[st]);
  };

  // 8 · Gem Match · somber and hopeful, piano, strings and low brass (72 bpm, five minutes)
  var GM = {
    // [bass, voicing, major?]: Cmaj7 G D/F# Em Am7 Em/G Cmaj7 B7
    chords: [[48, [52, 55, 59], 1], [43, [50, 55, 59], 1], [42, [50, 54, 57], 1], [40, [52, 55, 59], 0], [45, [52, 55, 60], 0], [43, [52, 55, 59], 0], [48, [52, 55, 59], 1], [47, [51, 54, 57], 1]],
    pa: { 0: -1, 4: 0, 6: 1, 10: 2, 12: 1 }, pb: { 0: -1, 2: 2, 6: 1, 8: 0, 12: 2 },   // the piano's two bar shapes (-1 = the bass)
    mel: [[0, 0, 71, 6], [0, 6, 72, 2], [0, 8, 74, 8], [1, 0, 71, 12], [1, 12, 67, 4], [2, 0, 69, 8], [2, 8, 66, 4], [2, 12, 69, 4],
      [3, 0, 71, 8], [3, 8, 67, 8], [4, 0, 72, 6], [4, 6, 71, 2], [4, 8, 69, 8], [5, 0, 67, 6], [5, 6, 69, 2], [5, 8, 71, 8],
      [6, 0, 76, 8], [6, 8, 74, 4], [6, 12, 72, 4], [7, 0, 71, 10], [7, 10, 69, 2], [7, 12, 66, 4]],
    sec: function (bar) {
      if (bar < 8) return { id: "first light", piano: 0.75, pad: bar >= 4 ? 0.014 : 0 };
      if (bar < 16) return { id: "descent", piano: 0.62, pad: 0.016, cello: 0.045 };
      if (bar < 24) return { id: "the mine", piano: 0.35, pmel: 0.75, pad: 0.014, cello: 0.045 };
      if (bar < 40) return { id: "lanterns", piano: 0.3, cello: 0.05, str: 0.035, smel: 0.055, horn: 0.03 };
      if (bar < 48) return { id: "alone", pmel: 0.8, poct: 12, high: 1, pad: 0.014 };
      if (bar < 64) return { id: "the climb", piano: 0.25, cello: 0.055, str: 0.04, bmel: 0.07, timp: 1 };
      if (bar < 72) return { id: "summit", cello: 0.06, str: 0.05, bmel: 0.08, smel: 0.045, smoct: 12, timp: 2, choir: 1 };
      if (bar < 80) return { id: "memory", piano: 0.25, pmel: 0.55, str: 0.03, horn: 0.025, cello: 0.04 };
      return { id: "rest", piano: 0.62 - (bar - 80) * 0.03, pad: 0.014 };
    }
  };
  var SONG_GEMS = {
    mood: "Gem Match · somber brass and strings, still hopeful", bpm: 72, bars: 88,
    init: function (o, t) { o.sub = makeSub(o, t); },
    play: function (o, t, st, bar) {
      var sec = GM.sec(bar), last = bar === 87, c = last ? [40, [52, 55, 59], 0] : GM.chords[bar % 8], b = c[0], v = c[1], six = o.six, barLen = six * 16;
      var len = last ? barLen * 3 : barLen * 1.03;
      if (st === 0) {
        o.sub.set(t, b - 12, sec.timp || sec.cello ? 0.07 : 0.04);
        if (sec.pad) pad(o, t, v.concat(b + 12), len, sec.pad, "warm");
        if (sec.cello) strings(o, t, [b], len, sec.cello, { a: 1.2, r: last ? 4 : 1.4, bright: 0.55 });
        if (sec.str) strings(o, t, v.map(function (m) { return m + 12; }), len, sec.str, { a: 1.5, r: last ? 5 : 1.6 });
        if (sec.horn) brass(o, t, [b, v[1]], len, sec.horn, { a: 1.4 });
        if (sec.high && bar % 4 === 0) strings(o, t, [v[2] + 24], barLen * 4, 0.022, { a: 3, r: 3, bright: 1.1 });
        if (sec.timp && (bar % 2 === 0 || sec.timp === 2)) tom(o, t, F(o, b < 43 ? b : b - 12) * 2, sec.timp === 2 ? 0.6 : 0.45);
        if (sec.choir && o.P.choir) pad(o, t, v.concat(b + 12), len, 0.025);
        if (bar === 64) crash(o, t, 0.5);
        if (last) { piano(o, t, 40, 0.7, 8); piano(o, t, 52, 0.5, 8); piano(o, t, 59, 0.4, 8); }
      }
      if (sec.timp === 2 && bar % 4 === 3 && st >= 8) tom(o, t, F(o, 40) * 2, 0.2 + (st - 8) * 0.05);   // a timpani roll into the next phrase
      if (last) return;
      var acc = (bar % 2 ? GM.pb : GM.pa)[st];
      if (sec.piano && acc != null) piano(o, t, acc < 0 ? b + 12 : v[acc] + 12, sec.piano * (st === 0 ? 1 : 0.75), 2.8);
      melodyAt(GM.mel, bar % 8, st).forEach(function (n) {
        if (sec.pmel) piano(o, t, n[2] + (sec.poct || 0), sec.pmel, n[3] * six * 1.4);
        if (sec.smel) strings(o, t, [n[2] + (sec.smoct || 0)], n[3] * six, sec.smel, { a: 0.4, r: 1, bright: 1.1 });
        if (sec.bmel) brass(o, t, [n[2] - 12], n[3] * six, sec.bmel, { a: 0.25 });
      });
    }
  };
  SONG_GEMS.outroBars = 2;
  SONG_GEMS.outro = function (o, t, st, k) {   // one last lantern: high piano over a held E minor
    var six = o.six;
    if (st === 0 && k === 0) { o.sub.set(t, 28, 0.04); strings(o, t, [55, 59, 64], six * 26, 0.03, { a: 1.5, r: 3 }); }
    if (k === 0 && (st === 0 || st === 6 || st === 10)) piano(o, t, [71, 76, 79][st === 0 ? 0 : st === 6 ? 1 : 2], 0.35, 4);
    if (k === 1 && st === 0) piano(o, t, 83, 0.25, 5);
  };

  // 9 · Schema Stack · electric guitars (150 bpm, three minutes): chugging riffs, a singing lead, a solo
  var SS = {
    // [step, root, length, palm-muted?]
    riffA: [[0, 40, 1, 1], [1, 40, 1, 1], [2, 40, 1, 1], [3, 43, 2, 0], [5, 40, 1, 1], [6, 40, 1, 1], [7, 45, 2, 0], [9, 40, 1, 1], [10, 40, 1, 1], [11, 47, 2, 0], [13, 45, 1, 0], [14, 43, 2, 0]],
    riffB: [[0, 40, 1, 1], [1, 40, 1, 1], [2, 40, 1, 1], [3, 43, 2, 0], [5, 40, 1, 1], [6, 40, 1, 1], [7, 45, 2, 0], [9, 40, 1, 1], [10, 48, 3, 0], [13, 50, 3, 0]],
    chorus: [48, 43, 50, 40],   // C G D E, a bar each
    verse: [[0, 64, 2], [2, 67, 2], [4, 69, 3], [7, 71, 1], [8, 74, 4], [12, 71, 2], [14, 69, 2], [16, 67, 6], [22, 69, 2], [24, 71, 8],
      [32, 76, 3], [35, 74, 1], [36, 71, 2], [38, 74, 2], [40, 76, 4], [44, 79, 2], [46, 76, 2], [48, 74, 4], [52, 71, 4], [56, 69, 2], [58, 67, 2], [60, 69, 4]],
    hook: [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 74, 4], [16, 74, 6], [22, 72, 2], [24, 71, 8], [32, 69, 4], [36, 74, 4], [40, 78, 6], [46, 76, 2], [48, 79, 8], [56, 78, 4], [60, 76, 4]],
    // the bridge: Am C Em B, two bars each, two guitars in harmony
    br: [[45, [[0, 76, 12], [12, 74, 4], [16, 72, 16]], [[0, 72, 12], [12, 71, 4], [16, 69, 16]]],
      [48, [[0, 72, 8], [8, 74, 8], [16, 76, 16]], [[0, 67, 8], [8, 71, 8], [16, 72, 16]]],
      [40, [[0, 79, 12], [12, 78, 4], [16, 76, 16]], [[0, 76, 12], [12, 74, 4], [16, 71, 16]]],
      [47, [[0, 75, 16], [16, 78, 16]], [[0, 71, 16], [16, 75, 16]]]],
    solo: [[64, 67, 71, 76, 79, 76, 71, 67], [69, 72, 76, 81, 79, 76, 72, 69], [71, 74, 78, 83, 81, 78, 74, 71], [76, 74, 71, 67, 69, 71, 74, 76]],
    sec: function (bar) {
      if (bar < 4) return { id: "intro", riff: 1, clean: 1, fill: bar === 3 };
      if (bar < 12) return { id: "riff", riff: 1, drums: 1, bass: 1, crash: bar === 4 };
      if (bar < 28) return { id: "verse", riff: 1, drums: 1, bass: 1, lead: "verse", lv: 0.05, fill: bar === 27 };
      if (bar < 36) return { id: "pre-chorus", chords: [48, 50], drums: 1, bass: 1, roll: bar >= 34 };
      if (bar < 52) return { id: "chorus", chorus: 1, drums: 2, bass: 1, lead: "hook", lv: 0.06, crash: bar % 4 === 0, fill: bar === 51 };
      if (bar < 60) return { id: "bridge", bridge: 1, half: 1 };
      if (bar < 76) return { id: "solo", riff: 1, drums: 2, bass: 1, solo: 1, crash: bar === 60 || bar === 68, fill: bar === 75 };
      if (bar < 84) return { id: "breakdown", riff: 1, half: 1, heavy: 1, bass: 1, toms: 1 };
      if (bar < 100) return { id: "chorus", chorus: 1, drums: 2, bass: 1, lead: "hook", lv: 0.065, harm: 1, crash: bar % 4 === 0, fill: bar === 99 };
      return { id: "finale", riff: 1, drums: 2, bass: 1, end: bar === 107, crash: bar === 100 };
    }
  };
  var SONG_STACK = {
    mood: "Schema Stack · electric guitar riffs", bpm: 150, bars: 108,
    init: function (o, t) { o.sub = makeSub(o, t); o.g1 = makeGuitar(o, t, -0.2); o.g2 = makeGuitar(o, t, 0.35); },
    play: function (o, t, st, bar) {
      var sec = SS.sec(bar), six = o.six;
      if (st === 0) o.sub.set(t, 28, sec.clean ? 0.04 : 0.12);
      if (sec.end) {   // the last bar: three hits and a ringing E
        if (st === 0 || st === 3 || st === 6) {
          var ln = st === 6 ? six * 30 : six * 2;
          power(o, t, 40, ln, 1.1, { pan: -0.45 }); power(o, t, 40, ln, 1.1, { pan: 0.45 }); kick(o, t, 1); crash(o, t, 0.9); bassNote(o, t, 28, 1, ln * 0.9);
        }
        if (st === 6) o.g1.play(t, 76, six * 9, 0.06, 74);
        return;
      }
      if (sec.riff) (bar % 2 ? SS.riffB : SS.riffA).forEach(function (n) {
        if (n[0] !== st) return;
        power(o, t, n[1], n[2] * six * 0.92, (sec.clean ? 0.6 : 1) * (sec.heavy ? 1.2 : 1), { mute: !!n[3], pan: n[3] ? 0 : (st % 2 ? 0.35 : -0.35), tone: sec.clean ? 0.5 : 1 });
        if (sec.bass) bassNote(o, t, n[1] - 12, n[3] ? 0.75 : 1, n[2] * six * 0.9);
      });
      var cr = sec.chorus ? SS.chorus[bar % 4] : sec.chords ? sec.chords[bar % 2] : 0;
      if (cr && st % 2 === 0) {   // driving eighths, double-tracked left and right
        power(o, t, cr, six * 1.9, st % 4 === 0 ? 1 : 0.75, { pan: -0.45 });
        if (sec.chorus) power(o, t, cr, six * 1.9, st % 4 === 0 ? 0.9 : 0.65, { pan: 0.45 });
        if (sec.bass) bassNote(o, t, cr - 12, st % 4 === 0 ? 1 : 0.8, six * 1.8);
      }
      if (sec.bridge) {
        var bi = SS.br[Math.floor((bar - 52) / 2) % 4], bst = ((bar - 52) % 2) * 16 + st;
        if (bst === 0) { power(o, t, bi[0], six * 30, 0.6, { pan: -0.5 }); power(o, t, bi[0], six * 30, 0.6, { pan: 0.5 }); }
        bi[1].forEach(function (n) { if (n[0] === bst) o.g1.play(t, n[1], n[2] * six, 0.055); });
        bi[2].forEach(function (n) { if (n[0] === bst) o.g2.play(t, n[1], n[2] * six, 0.045); });
        if (st % 4 === 0) bassNote(o, t, bi[0] - 12, 0.8, six * 3.6);
      }
      if (sec.lead) {
        var pos = (bar % 4) * 16 + st;
        SS[sec.lead].forEach(function (n) {
          if (n[0] !== pos) return;
          o.g1.play(t, n[1], n[2] * six, sec.lv, n[2] >= 4 && st % 4 === 0 ? n[1] - 2 : null);   // long notes start with a bend
          if (sec.harm) o.g2.play(t, dia(n[1], -2), n[2] * six, sec.lv * 0.75);
        });
      }
      if (sec.solo) {
        if (bar < 72) { var nn = SS.solo[bar % 4][st % 8]; o.g1.play(t, nn, six * 0.95, 0.05, st === 0 ? nn - 2 : null); }
        else { var hp = (bar % 4) * 16 + st; SS.hook.forEach(function (n) { if (n[0] === hp) o.g1.play(t, n[1], n[2] * six, 0.06, n[1] - 2); }); }
      }
      if (sec.half) {
        if (st === 0 || (sec.heavy && st === 3) || st === 10) kick(o, t, 1);
        if (st === 8) snare(o, t, 1.1);
        if (st % 4 === 0) (sec.heavy ? ride : hat)(o, t, 0.8);
      } else if (sec.drums && !(sec.fill && st >= 8)) {
        if (st === 0 || st === 8 || (st === 6 && bar % 2) || (sec.drums === 2 && st === 10)) kick(o, t, 1);
        if (st === 4 || st === 12) snare(o, t, 1.05);
        if (st % 2 === 0) (sec.drums === 2 ? ride : hat)(o, t, st % 4 === 0 ? 0.9 : 0.6);
      }
      if (sec.crash && st === 0) crash(o, t, 0.8);
      if (sec.fill && st >= 8) tom(o, t, [220, 200, 170, 150, 130, 110, 95, 80][st - 8], 1);
      if (sec.roll && st % (bar === 34 ? 2 : 1) === 0) snare(o, t, 0.3 + 0.5 * ((bar - 34) * 16 + st) / 32);
      if (sec.toms && bar % 2 === 1 && st >= 12) tom(o, t, [140, 120, 100, 85][st - 12], 1);
    }
  };
  SONG_STACK.outroBars = 4;
  SONG_STACK.outro = function (o, t, st, k, N) {   // a held E that rings, a run down the neck, the lead feeding back
    var six = o.six;
    if (st === 0) o.sub.set(t, 28, 0.14 * (1 - k / N) + 0.02);
    if (st === 0 && k === 0) { power(o, t, 40, six * 30, 1, { pan: -0.45 }); power(o, t, 40, six * 30, 1, { pan: 0.45 }); crash(o, t, 1); kick(o, t, 1.1); bassNote(o, t, 28, 1, six * 28); }
    if (k === 1) { o.g1.play(t, [88, 86, 83, 79, 76, 74, 71, 67, 64, 67, 71, 74, 76, 79, 83, 86][st], six * 0.95, 0.045); if (st >= 8) tom(o, t, [220, 200, 170, 150, 130, 110, 95, 80][st - 8], 0.8); }
    if (k === 2 && st === 0) { o.g1.play(t, 88, six * 26, 0.04, 86); kick(o, t, 0.9); crash(o, t, 0.6); }
    if (k === 2 && st % 4 === 0) power(o, t, 40, six * 0.9, 0.5 - st * 0.02, { mute: 1 });
  };

  // 10 · Pit Wall · a grand-prix fanfare (brass, driving strings) that loses its mind in the middle (124 bpm)
  var PW = {
    roots: [40, 36, 43, 38], madRoots: [40, 41, 40, 38],   // Em C G D · Em F Em D (Phrygian, for the fever dream)
    tri: { 40: [52, 55, 59], 36: [48, 52, 55], 43: [47, 50, 55], 38: [50, 54, 57], 41: [53, 57, 60] },
    ost: [0, 12, 7, 12, 0, 12, 7, 12, 0, 12, 7, 12, 5, 12, 7, 12],
    fan: [[0, 64, 2], [2, 71, 6], [8, 69, 2], [10, 71, 2], [12, 76, 12], [24, 74, 4], [28, 71, 4],
      [32, 72, 6], [38, 71, 2], [40, 67, 8], [48, 64, 4], [52, 67, 4], [56, 72, 8],
      [64, 71, 6], [70, 74, 2], [72, 79, 12], [84, 78, 4], [88, 74, 8],
      [96, 78, 6], [102, 76, 2], [104, 74, 4], [108, 69, 4], [112, 74, 6], [118, 76, 10]],
    mad: [[0, 76, 6], [6, 77, 2], [8, 76, 4], [12, 71, 4], [16, 74, 12], [28, 72, 4], [32, 71, 8], [40, 67, 4], [44, 70, 4], [48, 71, 16]],
    tribe: { 0: 1, 3: 0.6, 6: 0.8, 8: 0.5, 10: 0.9, 12: 0.6, 14: 0.7 },
    sec: function (bar) {
      if (bar < 8) return { id: "the grid", idle: 1, tick: 1, lights: bar >= 2 && bar <= 6 };
      if (bar < 16) return { id: "lights out", ost: 0.8, drums: 1, pulse: 1, low: 1, fly: bar === 8, crash: bar === 8 };
      if (bar < 32) return { id: "the theme", ost: 1, drums: 2, pulse: 1, fan: 0.075, low: 1, strPad: 1, crash: bar % 8 === 0 };
      if (bar < 40) return { id: "overtake", ost: 1, drums: 2, stabs: 1, roll: bar >= 38, riser: bar === 36, strPad: 1, fly: bar === 32 };
      if (bar < 48) return { id: "off the map", mad: 1, ost: 0.5 * (1 - (bar - 40) / 8), choir: 0.6, wob: 0.6, tribe: 0.5, mlead: bar >= 44 ? 0.06 : 0 };
      if (bar < 72) return { id: "fever dream", mad: 1, choir: 1, wob: 1, tribe: 1, trap: 1, mlead: 0.075, crash: bar === 48 || bar === 64 };
      if (bar < 80) return { id: "the fever breaks", mad: 1, choir: 0.8, wob: 1, tribe: 1, roll: bar >= 78, riser: bar === 76, fanLead: 0.065 };
      if (bar < 104) return { id: "final laps", ost: 1, drums: 2, fan: 0.085, wob: 0.8, choir: 0.6, strPad: 1, tribe: 0.6, crash: bar % 8 === 0, pulse: 1, fly: bar === 96 };
      if (bar < 112) return { id: "last lap", ost: 1, drums: 2, stabs: 1, pulse: 1, roll: bar >= 110, riser: bar === 108, strPad: 1, fan: 0.07, low: 1 };
      return { id: "chequered flag", flag: 1 };
    }
  };
  var SONG_PIT = {
    mood: "Pit Wall · grand-prix fanfare into a fever dream", bpm: 124, bars: 120,
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.lead = makeLead(o, t, o.P.lead, 0); },
    play: function (o, t, st, bar) {
      var sec = PW.sec(bar), six = o.six, root = (sec.mad ? PW.madRoots : PW.roots)[Math.floor(bar / 2) % 4], tri = PW.tri[root];
      if (sec.flag) {   // the chequered flag: Em, C, D, then the whole orchestra on an open E
        var fb = bar - 112, fr = [40, 40, 36, 36, 38, 38, 40, 40][fb], fch = fb >= 6 ? [40, 47, 52, 59, 64] : PW.tri[fr];
        if (st === 0 && fb % 2 === 0) {
          brass(o, t, fch, six * (fb >= 6 ? 30 : 28), 0.09, { a: 0.05 }); strings(o, t, fch.map(function (m) { return m + 12; }), six * (fb >= 6 ? 30 : 28), 0.05, { a: 0.1, r: 2 });
          boom(o, t, 0.9); crash(o, t, 0.9); kick(o, t, 1); o.sub.set(t, fr - 12, 0.2);
        }
        if (fb % 2 === 1 && st >= 8) tom(o, t, 150, 0.3 + (st - 8) * 0.07);   // timpani roll
        if (fb < 6 && st % 2 === 0) spic(o, t, fr + 12 + PW.ost[st], 0.7);
        return;
      }
      if (st === 0) {
        o.sub.set(t, root - 12, sec.wob ? 0.26 : sec.drums ? 0.2 : sec.idle ? 0.06 : 0.12);
        if (sec.strPad && bar % 2 === 0) strings(o, t, tri.map(function (m) { return m + 12; }), six * 32, 0.035, { a: 0.8, r: 1.2 });
        if (sec.choir && bar % 2 === 0) voices(o, t, tri.map(function (m) { return m + 12; }), six * 32, 0.03 * sec.choir);
        if (sec.wob) o.reese.rate(t, bar % 4 === 3 ? 3 / (six * 4) : 1 / (six * 2));   // wobbles in eighths, triplets at each turn
        if (sec.fly) flyby(o, t, six * 16, 1);
        if (sec.riser) riser(o, t, six * 64, 0.12);
        if (sec.crash) { crash(o, t, 0.8); boom(o, t, 0.7); }
        if (sec.lights) beep(o, t, 69, six * 3, 1);   // one more red light
        if (sec.low && bar % 2 === 0) brass(o, t, [root], six * 6, 0.06, { a: 0.03 });
      }
      if (sec.idle) rev(o, t, bar === 7 ? 28 + st * 0.75 : 28 + (st % 4 === 0 ? 2 : 0), bar === 7 ? 0.6 + st * 0.03 : 0.5);
      if (sec.tick && st % 4 === 0) hat(o, t, st === 0 ? 0.7 : 0.4);
      if (sec.ost && (bar !== 39 || st < 8)) spic(o, t, root + 12 + PW.ost[st], sec.ost * (st % 4 === 0 ? 1 : 0.7));
      if (sec.pulse && st % 2 === 0) arpNote(o, t, tri[(st / 2) % 3] + 12, st % 4 === 0 ? 0.8 : 0.5);
      if (sec.drums) {
        if (st === 0 || st === 8 || (sec.drums === 2 && (st === 11 || (bar % 2 && st === 14)))) kick(o, t, 1);
        if (st === 4 || st === 12) { snare(o, t, 1); if (sec.drums === 2) tom(o, t, 70, 0.6); }   // a taiko under the backbeat
        if (st % 2 === 0) hat(o, t, st % 4 === 2 ? 0.8 : 0.4);
      }
      if (sec.stabs && bar % 2 === 0 && (st === 0 || st === 3 || st === 6 || st === 10)) brass(o, t, tri, six * 1.2, 0.06, { a: 0.01 });
      if (sec.roll && st % (bar % 2 ? 1 : 2) === 0) snare(o, t, 0.3 + 0.5 * ((bar % 2) * 16 + st) / 32);
      if (sec.tribe && PW.tribe[st] != null) tom(o, t, (st < 8 ? 118 : 92) * (st % 3 === 0 ? 1 : 1.25), PW.tribe[st] * sec.tribe);
      if (sec.trap) {
        if (st === 0 || st === 10) kick(o, t, 1);
        if (st === 8) { snare(o, t, 1); clap(o, t, 0.8); }
        hat(o, t, st % 2 ? 0.35 : 0.6);
        if (st >= 13 && bar % 2) hat(o, t + six / 2, 0.4);   // hi-hat rolls
      }
      if (sec.wob && (st === 0 || st === 8)) o.reese.play(t, root, six * 7.6, 0.2 * sec.wob);
      if (sec.wob && st === 14) o.reese.play(t, root + 12, six * 1.8, 0.18 * sec.wob);
      if (sec.fan) {
        var fp = (bar % 8) * 16 + st;
        PW.fan.forEach(function (n) {
          if (n[0] !== fp) return;
          brass(o, t, [n[1] - 12, n[1]], n[2] * six, sec.fan, { a: 0.03 });
          if (bar >= 80) strings(o, t, [n[1] + 12], n[2] * six, 0.035, { a: 0.05, r: 0.4, bright: 1.3 });
        });
      }
      if (sec.mlead) {
        var mp = (bar % 4) * 16 + st;
        PW.mad.forEach(function (n) { if (n[0] === mp) o.lead.play(t, n[1], n[2] * six, sec.mlead); });
        if (st === 8 && bar % 4 === 3) screech(o, t, 83, six * 8, 0.035);
      }
      if (sec.fanLead) { var fl = (bar % 2) * 16 + st; PW.fan.forEach(function (n) { if (n[0] === fl) o.lead.play(t, n[1], n[2] * six, sec.fanLead); }); }
    }
  };
  SONG_PIT.outroBars = 4;
  SONG_PIT.outro = function (o, t, st, k, N) {   // the cars come home: one last flyby, the horns hold E, the engine cools
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.2 * fade + 0.02);
      if (k === 0) { flyby(o, t, six * 24, 1); strings(o, t, [52, 59, 64], six * 40, 0.04, { a: 1, r: 3 }); brass(o, t, [40, 47, 52], six * 30, 0.05, { a: 0.8 }); }
      if (k === 2) beep(o, t, 76, six * 6, 0.6);
    }
    if (k < 2 && st % 2 === 0) spic(o, t, 52 + PW.ost[st], 0.7 * fade);
    if (k < 2 && (st === 0 || st === 8)) tom(o, t, 70, 0.6 * fade);
    if (k >= 2 && st % 4 === 0) rev(o, t, 28, 0.4 * fade);
  };

  var BONUS = [
    { si: 6, game: "sidekiq", name: "Sidekiq Rush", song: SONG_QUEUE, titles: { phthalo: "Dead Letter Queue", knight: "Bunker 0x1F", golden: "Gilded Backpressure" } },
    { si: 7, game: "gems", name: "Gem Match", song: SONG_GEMS, titles: { phthalo: "Bedrock & Moss", knight: "Embers Under Stone", golden: "Lanterns Below" } },
    { si: 8, game: "schema", name: "Schema Stack", song: SONG_STACK, titles: { phthalo: "Pending Migration", knight: "Rollback Riot", golden: "Clean Lines" } },
    { si: 9, game: "pitwall", name: "Pit Wall", song: SONG_PIT, titles: { phthalo: "Lights Out", knight: "Red Flag Fever", golden: "Chequered Mirage" } }
  ];
  BONUS.forEach(function (b) { b.song.game = b.game; Object.keys(THEMES).forEach(function (k) { THEMES[k].titles[b.si] = b.titles[k]; }); });
  var TRACKS = SONGS.concat([SONG_CUT], BONUS.map(function (b) { return b.song; }));

  /* ---------- the suite's lock: which songs you've heard, which suites you've opened (per theme) ---------- */
  var SKEY = "samuka-suite";
  function sload() { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } }
  function ssave(d) { try { localStorage.setItem(SKEY, JSON.stringify(d)); } catch (e) {} }
  function sEmit(d) { try { window.dispatchEvent(new CustomEvent("samuka:suite", { detail: d })); } catch (e) {} }
  function suiteOpen(th) {
    var d = sload(); if (d.open && d.open[th]) return true;
    var A = window.SamukaAch; return !!(A && A.has && A.has("suite_" + th));   // unlocked on another device
  }
  function heardMask(th) { var d = sload(); return (d.heard && d.heard[th]) || 0; }
  function heardCount(th) { var h = heardMask(th), n = 0; for (var i = 0; i < 5; i++) if (h & (1 << i)) n++; return n; }
  function markHeard(th, si) {
    var d = sload(); d.heard = d.heard || {};
    var h = d.heard[th] || 0; if (h & (1 << si)) return;
    d.heard[th] = h | (1 << si); ssave(d);
    var n = heardCount(th);
    sEmit({ type: "heard", theme: th, count: n });
    if (n === 5 && !suiteOpen(th)) sEmit({ type: "ready", theme: th });
  }
  function unlockSuite(th) {
    if (!THEMES[th]) return false;
    var d = sload(); d.open = d.open || {}; var was = !!d.open[th];
    d.open[th] = 1; ssave(d);
    if (!was) sEmit({ type: "unlocked", theme: th, title: THEMES[th].titles[5] });
    if (cur) nowPlaying();
    return !was;
  }
  // bonus tracks: one per arcade game, opened (in every theme at once) by finishing a run of that game
  function bonusOpen(game) { var d = sload(); return !!(d.bonus && d.bonus[game]); }
  function bonusOf(game) { return BONUS.filter(function (b) { return b.game === game; })[0]; }
  function unlockBonus(game) {
    var b = bonusOf(game); if (!b) return false;
    var d = sload(); d.bonus = d.bonus || {}; if (d.bonus[game]) return false;
    d.bonus[game] = 1; ssave(d);
    var title = b.titles[themeId()] || b.titles.phthalo;
    sEmit({ type: "bonus", game: game, si: b.si, title: title });
    toastBonus(b, title);
    if (cur) nowPlaying();
    return true;
  }
  function toastBonus(b, title) {
    var tries = 0;
    (function show() {   // wait for any achievement toast to clear first (same corner)
      if (!document.body) return;
      if (document.querySelector(".ach-toast") && ++tries < 8) { setTimeout(show, 900); return; }
      var el = document.createElement("div");
      el.className = "ach-toast"; el.setAttribute("role", "status");
      el.innerHTML = '<span class="ach-toast__icon" aria-hidden="true">♪</span><span><small></small><b></b></span>';
      el.querySelector("small").textContent = "bonus track unlocked · " + b.name;
      el.querySelector("b").textContent = title + " · in the ♪ player";
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add("is-in"); });
      setTimeout(function () { el.classList.remove("is-in"); }, 4200);
      setTimeout(function () { el.remove(); }, 4700);
    })();
  }
  window.addEventListener("samuka:game", function (e) { var d = e.detail || {}; if (d.name === "over") unlockBonus(d.game); });
  function siOpen(th, si) { return si < 5 || (si === 5 ? suiteOpen(th) : !!(TRACKS[si] && bonusOpen(TRACKS[si].game))); }
  // the main rotation: the five songs, then every unlocked bonus track, then round again to Ring Zero.
  // The director's cut stays out of it: it plays only when picked, then hands over to Ring Zero.
  function nextIdx(th, si) {
    if (si < 4) return si + 1;
    if (si === 4 || si >= 6) for (var i = Math.max(6, si + 1); i < TRACKS.length; i++) if (siOpen(th, i)) return i;
    return 0;
  }
  function prevIdx(th, si) {
    if (si === 0 || si >= 6) for (var i = si === 0 ? TRACKS.length - 1 : si - 1; i >= 6; i--) if (siOpen(th, i)) return i;
    return si === 0 || si >= 5 ? 4 : si - 1;
  }
  function lastOpen(th) { for (var i = TRACKS.length - 1; i > 4; i--) if (siOpen(th, i)) return i + 1; return 5; }

  /* ---------- engine ---------- */
  // si 0–4 are the songs, si 5 the director's cut; sp = { s: step } starts somewhere other than the top
  function create(theme, si, fade, loop, sp) {
    var P = THEMES[theme], song = TRACKS[si], bpm = song.bpm * P.bpm, six = 60 / bpm / 4, t = ctx.currentTime;
    var o = { P: P, song: song, theme: theme, si: si, s: (sp && sp.s) || 0, six: six, dur: six, next: t + 0.08, nodes: [], loop: !!loop, ref: song.ref || 440, bpm: Math.round(bpm), cut: 800 };
    o.bus = gain(0.0001); o.bus.gain.linearRampToValueAtTime(1, t + fade); o.bus.connect(master);
    var verb = ctx.createConvolver(); verb.buffer = verbBuf;
    o.verb = gain(1); var vOut = gain(P.verb); o.verb.connect(verb); verb.connect(vOut); vOut.connect(o.bus);
    o.delay = gain(1); var dl = ctx.createDelay(2), fb = gain(0.32), dtone = filt("lowpass", 1800, 0.5);
    dl.delayTime.value = six * 3; o.dl = dl; o.delay.connect(dl); dl.connect(dtone); dtone.connect(fb); fb.connect(dl); dtone.connect(o.bus); dtone.connect(o.verb);
    o.drums = gain(1); var dsh = shaper(P.drive), dpost = gain(0.8); o.drums.connect(dsh); dsh.connect(dpost); dpost.connect(o.bus);
    o.duck = gain(1); o.duck.connect(o.bus);
    o.vib = osc("sine", 5.2, t, t + 36000); o.vibG = gain(8); o.vib.connect(o.vibG); o.nodes.push(o.vib);
    o.bassLp = filt("lowpass", 400, 5); var bsh = shaper(P.bassDrive), bout = gain(0.9); o.bassLp.connect(bsh); bsh.connect(bout); bout.connect(o.duck);
    song.init(o, t);
    o.play = function (tt, s) {
      var st = s % 16, bar = Math.floor(s / 16);
      if (bar >= song.bars) return outroStep(o, tt, st, bar - song.bars);
      if (song.tempo) {   // a tempo map: the step length (and tuning) follow it, the echoes keep time
        var pos = bar + st / 16;
        o.six = o.dur = 60 / (song.tempo(pos) * o.P.bpm) / 4;
        if (song.refAt) o.ref = song.refAt(pos);
        if (st === 0) o.dl.delayTime.setTargetAtTime(Math.min(1.9, o.six * 3), tt, 0.3);
      }
      song.play(o, tt, st, bar);
    };
    return o;
  }
  function kill(o) {
    if (!o) return;
    o.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
    try { o.bus.disconnect(); } catch (e) {}
  }
  function retire(o, fade) {
    if (!o) return;
    var t = ctx.currentTime, g = o.bus.gain;
    o.done = true;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(function () { kill(o); }, fade * 1000 + 400);
  }
  // a fade that starts later (when an outro's last scheduled note has played), letting its tails ring out
  function retireAt(o, at, fade) {
    var g = o.bus.gain;
    o.done = true;
    g.cancelScheduledValues(at); g.setValueAtTime(1, at); g.linearRampToValueAtTime(0.0001, at + fade);
    setTimeout(function () { kill(o); }, Math.max(0, at - ctx.currentTime + fade) * 1000 + 400);
  }
  // an outro finished: the next track starts exactly on the following downbeat
  function handoff(o, si, loop, sp) {
    cur = create(o.theme, si, 0.05, loop, sp);
    cur.next = Math.max(cur.next, o.next);
    retireAt(o, o.next, 3);
    nowPlaying();
  }
  function switchTo(theme, si, fade, loop, sp) {
    if (cur) retire(cur, fade);
    cur = create(theme, si, fade, loop, sp);
    nowPlaying();
  }
  function tick() {
    if (!ctx || !cur) return;
    var now = ctx.currentTime, horizon = now + (document.hidden ? 3 : LOOK);   // hidden tabs get timers less often
    if (cur.next < now - 0.25) cur.next = now + 0.02;
    while (cur && cur.next < horizon) {
      if (cur.s >= (cur.song.bars + cur.song.outroBars) * 16) {
        var o = cur; handoff(o, o.tgt ? o.tgt.si : o.loop ? o.si : nextIdx(o.theme, o.si), o.loop); continue;
      }
      if (cur.si < 5 && cur.s === 64) markHeard(cur.theme, cur.si);   // four bars in counts as "heard"
      cur.play(cur.next, cur.s); cur.s++; cur.next += cur.dur;
    }
  }
  function run() { if (on && !timer) timer = setInterval(tick, TICK); tick(); }
  function halt() { if (timer) clearInterval(timer); timer = null; }
  function ramp(to, dur) { var t = ctx.currentTime, g = master.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + dur); }

  /* ---------- time: where we are in seconds, and seeking by seconds ---------- */
  var stepCache = {};
  function stepTimes(theme, si) {   // start time of every step of a tempo-mapped track (the outro at its last tempo)
    var key = theme + ":" + si; if (stepCache[key]) return stepCache[key];
    var P = THEMES[theme], song = TRACKS[si], n = (song.bars + song.outroBars) * 16, a = new Float64Array(n + 1), t = 0;
    for (var s = 0; s < n; s++) { a[s] = t; t += 60 / (song.tempo(Math.min(s / 16, song.bars - 1 / 16)) * P.bpm) / 4; }
    a[n] = t; return (stepCache[key] = a);
  }
  function trackSecs(theme, si) {
    var song = TRACKS[si]; if (song.tempo) { var a = stepTimes(theme, si); return a[a.length - 1]; }
    return (song.bars + song.outroBars) * 240 / (song.bpm * THEMES[theme].bpm);
  }
  function times() {
    var song = cur.song, n = (song.bars + song.outroBars) * 16, s = Math.min(cur.s, n);
    if (song.tempo) { var a = stepTimes(cur.theme, cur.si); return { pos: a[s], dur: a[n] }; }
    var dur = trackSecs(cur.theme, cur.si); return { pos: s / n * dur, dur: dur };
  }
  function seekTime(sec) {
    if (!cur) return;
    var song = cur.song, n = (song.bars + song.outroBars) * 16, s;
    sec = Math.max(0, +sec || 0);
    if (song.tempo) {
      var a = stepTimes(cur.theme, cur.si), lo = 0, hi = n - 1;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (a[mid] <= sec) lo = mid; else hi = mid - 1; }
      s = lo;
    } else s = Math.min(n - 1, Math.floor(sec / trackSecs(cur.theme, cur.si) * n));
    unTarget(cur); cur.s = s; emit();
  }

  function info() {
    if (!cur) return null;
    var tm = times();
    var base = { name: cur.P.titles[cur.si], theme: cur.theme, themeName: cur.P.name, no: cur.si + 1, si: cur.si, of: Math.max(lastOpen(cur.theme), cur.si + 1), bonus: cur.si >= 6, bpm: Math.round(15 / cur.six), loop: cur.loop, paused: paused, pos: tm.pos, dur: tm.dur };
    var outro = cur.s >= cur.song.bars * 16 && cur.tgt ? " · outro → " + cur.P.titles[cur.tgt.si] : "";
    base.bar = Math.min(cur.song.bars - 1, Math.floor(cur.s / 16)); base.bars = cur.song.bars; base.outro = !!outro;
    base.style = (cur.song.chapter ? "the director's cut · " + cur.song.chapter(base.bar) : cur.song.mood) + outro;
    return base;
  }
  function emit() { try { window.dispatchEvent(new CustomEvent("samuka:lofi", { detail: { on: on, paused: paused, track: on && cur ? info().name : null, info: on && cur ? info() : null } })); } catch (e) {} }
  function nowPlaying() {
    var i = info(); if (!i) return;
    if (btn) btn.title = "♪ " + i.name + " · " + i.themeName + " · " + i.bpm + " bpm (synthesized live)";
    if (nextBtn) nextBtn.title = "Next: " + cur.P.titles[nextIdx(cur.theme, cur.si)];
    var ms = navigator.mediaSession;
    try { if (ms && window.MediaMetadata) ms.metadata = new MediaMetadata({ title: i.name, artist: "Samuka's Arcade", album: i.themeName + " soundtrack · synthesized live" }); } catch (e) {}
    emit();
  }
  function render() {
    if (!btn) return;
    var live = on && !paused;
    btn.classList.toggle("is-on", live);
    btn.setAttribute("aria-pressed", live ? "true" : "false");
    btn.innerHTML = live ? '<span class="lofi-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : "♪";
    if (!on) btn.title = "♪ soundtrack player (synthesized live)";
    if (nextBtn) nextBtn.hidden = !on;
  }

  /* ---------- public API ---------- */
  // one tab plays at a time: starting music here stops it in the site's other tabs (e.g. the soundtrack room)
  var tabId = Math.random().toString(36).slice(2), bc = null;
  try { bc = new BroadcastChannel("samuka-music"); bc.onmessage = function (e) { if (on && e.data && e.data.from !== tabId) stop(); }; } catch (e) { bc = null; }
  var paused = false, vol = (function () { try { var v = parseFloat(localStorage.getItem("samuka-volume")); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch (e) { return 1; } })();
  function level() { return MASTER * vol * vol; }   // squared: the slider feels even to the ear
  function start(theme, si, loop) {
    if (!AC || !ensureCtx()) { if (btn) btn.hidden = true; return; }
    if (bc) try { bc.postMessage({ from: tabId }); } catch (e) {}
    quiet(ctx.resume());
    if (paused) { paused = false; token++; ramp(level(), 0.2); }
    if (!on) { on = true; token++; ramp(level(), 1.2); }
    if (theme != null) switchTo(theme, si || 0, cur ? 1.5 : 0.05, loop);
    else if (!cur) switchTo(themeId(), 0, 0.05, false);
    run(); mediaSession(); render(); emit();
  }
  // pause keeps everything exactly where it is (the audio clock stops), resume carries on mid-bar
  function pause() {
    if (!on || paused || !ctx) return;
    paused = true;
    var my = ++token;
    ramp(0.0001, 0.12);
    setTimeout(function () { if (my !== token || !paused) return; halt(); quiet(ctx.suspend()); }, 160);
    setMs("paused"); render(); emit();
  }
  function resume() {
    if (!on || !paused) return start();
    paused = false; token++;
    var p = ctx.resume();
    function go() { ramp(level(), 0.15); run(); }
    if (p && p.then) p.then(go, go); else go();
    setMs("playing"); render(); emit();
  }
  function setVolume(v) {
    vol = Math.max(0, Math.min(1, +v || 0));
    try { localStorage.setItem("samuka-volume", String(vol)); } catch (e) {}
    if (on && !paused && ctx) ramp(level(), 0.08);
    emit();
  }
  // ⏮ restarts the track if it's a few seconds in, otherwise goes to the previous one
  function prev() {
    if (!on) return start();
    if (paused) resume();
    if (times().pos > 3) { seekTime(0); return; }
    var si = prevIdx(cur.theme, cur.si); if (pinned) pinned.si = si;
    switchTo(cur.theme, si, 1.2, cur.loop);
  }
  function stop() {
    if (!on) return;
    on = false; pinned = null; paused = false;
    var my = ++token;
    ramp(0, 0.8);
    render(); emit();
    setTimeout(function () {
      if (my !== token || on) return;
      halt(); kill(cur); cur = null;
      quiet(ctx.suspend());
    }, 900);
  }
  function next() {
    if (!on) return start();
    if (paused) resume();
    var si = nextIdx(cur.theme, cur.si); if (pinned) pinned.si = si;
    switchTo(cur.theme, si, 1.2, pinned ? cur.loop : false);
  }
  // the listening page: a pinned track (theme changes elsewhere don't switch it); loops unless loop === false
  function preview(theme, si, loop) { pinned = { theme: THEMES[theme] ? theme : "phthalo", si: si }; start(pinned.theme, si, loop !== false); }
  // render a whole track (its outro included, plus a tail) faster than real time into an AudioBuffer:
  // the same engine, pointed at an OfflineAudioContext and fed in 4-second chunks so the graph stays small
  var rendering = false;
  function renderTrack(theme, si, rate) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !THEMES[theme] || !TRACKS[si]) return Promise.reject(new Error("can't render that"));
    if (rendering) return Promise.reject(new Error("already rendering"));
    if (on) stop();
    rendering = true;
    rate = rate || 44100;
    var song = TRACKS[si], n = (song.bars + song.outroBars) * 16, secs = trackSecs(theme, si) + 5;
    var live = { ctx: ctx, master: master, analyser: analyser, noiseBuf: noiseBuf, verbBuf: verbBuf };
    var off = new OAC(2, Math.ceil(secs * rate), rate), CH = 4, o;
    function swapIn() { ctx = off; master = rs.master; analyser = rs.analyser; noiseBuf = rs.noiseBuf; verbBuf = rs.verbBuf; }
    function swapOut() { ctx = live.ctx; master = live.master; analyser = live.analyser; noiseBuf = live.noiseBuf; verbBuf = live.verbBuf; }
    ctx = off; graph(); master.gain.value = MASTER;
    var rs = { master: master, analyser: analyser, noiseBuf: noiseBuf, verbBuf: verbBuf };
    o = create(theme, si, 0.02, false); o.next = 0.05;
    function feed(until) { swapIn(); while (o.s < n && o.next < until) { o.play(o.next, o.s); o.s++; o.next += o.dur; } swapOut(); }
    feed(CH * 2);
    for (var t = CH; t < secs; t += CH) (function (at) { off.suspend(at).then(function () { feed(at + CH * 2); off.resume(); }); })(t);
    swapOut();
    return off.startRendering().then(function (buf) { rendering = false; return buf; }, function (e) { rendering = false; throw e; });
  }
  function bpmRange(P) {
    var b = CUT.tempo.map(function (x) { return Math.round(x[1] * P.bpm); });   // the cut spans every song's tempo
    return Math.min.apply(null, b) + "–" + Math.max.apply(null, b);
  }

  window.SamukaLofi = {
    toggle: function () { if (on) stop(); else start(); },
    start: function () { start(); }, stop: stop, isOn: function () { return on; }, next: next, prev: prev, preview: preview,
    pause: pause, resume: resume, isPaused: function () { return on && paused; },
    seekTime: seekTime, skip: function (d) { if (cur) seekTime(times().pos + d); },
    setLoop: function (v) { if (cur) { cur.loop = !!v; if (!v && cur.tgt && cur.tgt.si === cur.si) cur.tgt.si = nextIdx(cur.theme, cur.si); emit(); } },
    volume: function (v) { if (v != null) setVolume(v); return vol; },
    render: renderTrack,   // (theme, si, sampleRate?) → Promise<AudioBuffer>, for saving tracks as files
    // play a track in the normal rotation (it carries on to the next one when it ends)
    play: function (theme, si) { pinned = null; start(THEMES[theme] ? theme : themeId(), si | 0, false); },
    seek: function (bar) { if (!cur) return; unTarget(cur); cur.s = Math.max(0, Math.min(cur.song.bars - 1, bar | 0)) * 16; },
    track: function () { return on ? info() : null; },
    analyser: function () { return on ? analyser : null; },
    theme: themeId,
    suite: {
      open: suiteOpen, unlock: unlockSuite, heard: heardCount, heardMask: heardMask,
      title: function (th) { return THEMES[th] ? THEMES[th].titles[5] : null; },
      themes: function () { return Object.keys(THEMES).map(function (k) { return { theme: k, name: THEMES[k].name, titles: THEMES[k].titles.slice(0, 5), suite: THEMES[k].titles[5], tr: THEMES[k].tr }; }); },
      // where each chapter of the director's cut starts, in seconds (for markers on a seek bar)
      marks: function (th) { var a = stepTimes(THEMES[th] ? th : "phthalo", 5); return CUT.chapters.map(function (c) { return { at: a[c[0] * 16], name: c[1] }; }); }
    },
    // bonus tracks 7–10: one per arcade game, unlocked in every theme by finishing a run of it
    bonus: {
      open: bonusOpen, unlock: unlockBonus,
      list: function () { return BONUS.map(function (b) { return { si: b.si, game: b.game, name: b.name, titles: b.titles, open: bonusOpen(b.game) }; }); }
    },
    order: { next: nextIdx, prev: prevIdx },   // what ⏭ / ⏮ and the outros pick (exposed for the tests)
    catalog: function () {
      return Object.keys(THEMES).map(function (k) {
        var P = THEMES[k];
        var songs = SONGS.map(function (s, i) { return { no: i + 1, title: P.titles[i], mood: s.mood, bpm: Math.round(s.bpm * P.bpm), bars: s.bars, outro: s.outroBars, secs: Math.round((s.bars + s.outroBars) * 4 * 60 / (s.bpm * P.bpm)) }; });
        songs.push({ no: 6, title: P.titles[5], mood: CUT_MOOD, bpm: bpmRange(P), bars: SONG_CUT.bars, outro: SONG_CUT.outroBars, secs: Math.round(trackSecs(k, 5)), suite: true, locked: !suiteOpen(k), heard: heardCount(k) });
        BONUS.forEach(function (b) {
          var s = b.song;
          songs.push({ no: b.si + 1, title: P.titles[b.si], mood: s.mood, bpm: Math.round(s.bpm * P.bpm), bars: s.bars, outro: s.outroBars, secs: Math.round(trackSecs(k, b.si)), bonus: true, game: b.game, gameName: b.name, locked: !bonusOpen(b.game) });
        });
        return { theme: k, name: P.name, songs: songs };
      });
    }
  };

  // theme change: same song, new palette (unless a track is pinned on the listening page)
  window.addEventListener("samuka:theme", function () {
    if (!on || !ctx || !cur || pinned) return;
    var th = themeId(); if (th === cur.theme) return;
    if (cur.si === 5 && !suiteOpen(th)) switchTo(th, 0, 2, false);   // that theme's cut is still locked
    else switchTo(th, cur.si, 2, false, { s: cur.s < cur.song.bars * 16 ? cur.s : 0 });   // same place, new palette
  });
  document.addEventListener("visibilitychange", function () {
    if (!on || !ctx || paused) return;
    tick();
    if (!document.hidden && ctx.state !== "running") { var p = ctx.resume(); if (p && p.then) p.then(run, run); else run(); }
  });
  function setMs(state) { try { if (navigator.mediaSession) navigator.mediaSession.playbackState = state; } catch (e) {} }
  function mediaSession() {
    var ms = navigator.mediaSession; if (!ms) return;
    var h = {
      pause: pause, play: resume, stop: stop, nexttrack: next, previoustrack: prev,
      seekbackward: function (d) { if (cur) seekTime(times().pos - ((d && d.seekOffset) || 10)); },
      seekforward: function (d) { if (cur) seekTime(times().pos + ((d && d.seekOffset) || 10)); },
      seekto: function (d) { if (d && d.seekTime != null) seekTime(d.seekTime); }
    };
    Object.keys(h).forEach(function (k) { try { ms.setActionHandler(k, h[k]); } catch (e) {} });
    setMs(paused ? "paused" : "playing");
  }
  function mount() {
    var bar = document.querySelector(".tabs__actions");
    if (!bar || !AC || bar.querySelector(".lofi-btn")) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "icon-btn lofi-btn"; btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play the site soundtrack"); btn.textContent = "♪";
    // ♪ opens the player dock (assets/js/musicdock.js); the first click also starts the music
    btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-label", "Soundtrack player");
    btn.addEventListener("click", function () {
      var D = window.SamukaDock;
      if (!D) { if (paused) resume(); else if (on) stop(); else start(); return; }
      if (!on && !D.isOpen()) start();
      D.toggle(btn);
    });
    render();
    var ref = bar.querySelector("[data-toggle-theme]");
    if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref); else bar.appendChild(btn);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
