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
 * Track 6 (secret, per theme) is the suite: all five songs stitched into one journey. It joins the rotation
 *   once unlocked in the Patch Bay (assets/js/patchbay.js), which wakes after you've heard all five songs.
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
    try {
      ctx = new AC();
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
      return true;
    } catch (e) { ctx = null; return false; }
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
      // the suite's finale: the horns remember the Ring Zero hook at half speed (E minor and G major share every note)
      var quote = o.mv && o.mv.finale && bar >= 40 && !last;
      if (quote && st % 2 === 0) {
        var pos = ((bar - 40) * 16 + st) / 2;
        RZ.lead.forEach(function (n) { if (n[0] === pos && n[0] < 64) brass(o, t, [n[1] - 12], n[2] * six * 2, 0.07, { a: 0.25 }); });
      }
      if (sec.mel != null && !last && !quote) melodyAt(EC.mel, bar % 8, st).forEach(function (n) { strings(o, t, [n[2] + sec.mel], n[3] * six, sec.mv, { a: 0.6, r: 1.4, bright: 1.05 }); });
    }
  };

  var SONGS = [SONG_THEME, SONG_HORROR, SONG_LOWEST, SONG_STANDOFF, SONG_EPILOGUE];

  /* ======================= outros =======================
   * After its last bar every song plays a short outro (song.outroBars) that winds it down, resolves home to
   * E minor (G major for the epilogue) and, bar by bar, eases its tempo and tuning (440 ↔ 432) into whatever
   * plays next: the next song, itself when looping, or the suite's start. The final outro bar teases the next
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
    }
  }
  function outroStep(o, t, st, k) {
    var song = o.song, N = song.outroBars;
    if (!o.tgt) {   // decided once, at the outro's first step
      var ti = o.mv ? 0 : o.loop ? o.si : nextIdx(o.theme, o.si), ts = SONGS[ti];
      o.tgt = { si: ti, six: 60 / (ts.bpm * o.P.bpm) / 4, ref: ts.ref || 440, six0: o.six, ref0: o.ref };
    }
    var g = o.tgt, f = (k * 16 + st + 1) / (N * 16), e = f * f * (3 - 2 * f);
    o.six = o.dur = g.six0 + (g.six - g.six0) * e;   // tempo glides into the next song's
    o.ref = g.ref0 + (g.ref - g.ref0) * e;             // and so does the tuning (432 ↔ 440)
    song.outro(o, t, st, k, N);
    if (k === N - 2 && st === 0 && (g.si === 0 || g.si === 1 || g.si === 3)) riser(o, t, o.six * 32, 0.1);   // lift into something fast
    if (k === N - 1) foreshadow(o, t, st, g.si, (st + 1) / 16);
  }
  function unTarget(o) { if (o && o.tgt) { o.six = o.dur = o.tgt.six0; o.ref = o.tgt.ref0; o.tgt = null; } }

  /* ======================= track 6 · the suite (secret) =======================
   * All five songs as one ~9½ minute journey: overture → chase → the standoff at full speed → the fall → home,
   * where the horns play the Ring Zero hook. Each movement keeps its own tempo; risers and an impact glue them. */
  var SUITE = [
    { si: 0, segs: [[0, 32]], name: "I · overture" },                         // ends on its own break riser
    { si: 1, segs: [[0, 40], [48, 56]], out: "riser", name: "II · the chase" },
    { si: 3, segs: [[8, 88]], name: "III · the standoff" },
    { si: 2, segs: [[8, 40]], in: "impact", name: "IV · the fall" },
    { si: 4, segs: [[0, 48 + SONG_EPILOGUE.outroBars]], finale: 1, name: "V · home" }   // incl. its outro, back into the theme
  ];
  var SUITE_MOOD = "the suite · all five songs, one journey";
  function segBars(m) { return m.segs.reduce(function (a, s) { return a + s[1] - s[0]; }, 0); }
  var SUITE_BARS = SUITE.reduce(function (a, m) { return a + segBars(m); }, 0);
  function suiteSecs(P) { return Math.round(SUITE.reduce(function (a, m) { return a + segBars(m) * 240 / (SONGS[m.si].bpm * P.bpm); }, 0)); }
  function impact(o, t) {   // standoff → the fall: one huge hit, then the floor drops away
    kick(o, t, 1.2); tom(o, t, 62, 1); stab(o, t, [52, 55, 59, 64], 1.3);
    strings(o, t, [28, 40, 47], o.six * 24, 0.07, { a: 0.01, r: 4, bright: 0.7 });
  }
  function glue(o, t, st, bar) {
    if (st !== 0) return;
    var mv = o.mv, segs = mv.segs, lastSeg = o.suite.seg === segs.length - 1;
    if (mv.out === "riser" && lastSeg && bar === segs[segs.length - 1][1] - 2) riser(o, t, o.six * 32, 0.13);
    if (mv.in === "impact" && o.suite.seg === 0 && bar === segs[0][0] && !o.hit) { o.hit = 1; impact(o, t); }
  }

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
  function nextIdx(th, si) { return si < 4 ? si + 1 : si === 4 && suiteOpen(th) ? 5 : 0; }

  /* ---------- engine ---------- */
  // si 0–4 are the songs; si 5 is the suite, where sp = { mi: movement, seg: segment, s: step } says where to start
  function create(theme, si, fade, loop, sp) {
    var mv = si === 5 ? SUITE[(sp && sp.mi) || 0] : null;
    var P = THEMES[theme], song = SONGS[mv ? mv.si : si], bpm = song.bpm * P.bpm, six = 60 / bpm / 4, t = ctx.currentTime;
    var o = { P: P, song: song, theme: theme, si: si, s: 0, six: six, dur: six, next: t + 0.08, nodes: [], loop: !!loop, ref: song.ref || 440, bpm: Math.round(bpm), cut: 800 };
    if (mv) { o.mv = mv; o.suite = { mi: (sp && sp.mi) || 0, seg: (sp && sp.seg) || 0 }; o.s = sp && sp.s != null ? sp.s : mv.segs[o.suite.seg][0] * 16; }
    o.bus = gain(0.0001); o.bus.gain.linearRampToValueAtTime(1, t + fade); o.bus.connect(master);
    var verb = ctx.createConvolver(); verb.buffer = verbBuf;
    o.verb = gain(1); var vOut = gain(P.verb); o.verb.connect(verb); verb.connect(vOut); vOut.connect(o.bus);
    o.delay = gain(1); var dl = ctx.createDelay(2), fb = gain(0.32), dtone = filt("lowpass", 1800, 0.5);
    dl.delayTime.value = six * 3; o.delay.connect(dl); dl.connect(dtone); dtone.connect(fb); fb.connect(dl); dtone.connect(o.bus); dtone.connect(o.verb);
    o.drums = gain(1); var dsh = shaper(P.drive), dpost = gain(0.8); o.drums.connect(dsh); dsh.connect(dpost); dpost.connect(o.bus);
    o.duck = gain(1); o.duck.connect(o.bus);
    o.vib = osc("sine", 5.2, t, t + 36000); o.vibG = gain(8); o.vib.connect(o.vibG); o.nodes.push(o.vib);
    o.bassLp = filt("lowpass", 400, 5); var bsh = shaper(P.bassDrive), bout = gain(0.9); o.bassLp.connect(bsh); bsh.connect(bout); bout.connect(o.duck);
    song.init(o, t);
    o.play = function (tt, s) {
      var st = s % 16, bar = Math.floor(s / 16);
      if (bar >= song.bars) return outroStep(o, tt, st, bar - song.bars);
      if (o.mv) glue(o, tt, st, bar);
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
  // suite bookkeeping at a segment's end: jump to the next segment, the next movement, or out of the suite
  function suiteEdge() {
    var o = cur, sp = o.suite, segs = o.mv.segs;
    if (o.s < segs[sp.seg][1] * 16) return false;
    if (sp.seg + 1 < segs.length) { sp.seg++; o.s = segs[sp.seg][0] * 16; return false; }
    var mi = sp.mi + 1;
    if (mi < SUITE.length) switchTo(o.theme, 5, SUITE[mi].in === "impact" ? 0.25 : 1.5, o.loop, { mi: mi, seg: 0 });
    else { handoff(o, o.loop ? 5 : 0, o.loop, o.loop ? { mi: 0, seg: 0 } : null); return true; }   // the epilogue's outro already leads into the theme
    cur.next = Math.max(cur.next, o.next);
    return true;
  }
  function tick() {
    if (!ctx || !cur) return;
    var now = ctx.currentTime, horizon = now + (document.hidden ? 3 : LOOK);   // hidden tabs get timers less often
    if (cur.next < now - 0.25) cur.next = now + 0.02;
    while (cur && cur.next < horizon) {
      if (cur.suite) { if (suiteEdge()) continue; }
      else if (cur.s >= (cur.song.bars + cur.song.outroBars) * 16) {
        var o = cur; handoff(o, o.tgt ? o.tgt.si : o.loop ? o.si : nextIdx(o.theme, o.si), o.loop); continue;
      }
      if (!cur.suite && cur.s === 64) markHeard(cur.theme, cur.si);   // four bars in counts as "heard"
      cur.play(cur.next, cur.s); cur.s++; cur.next += cur.dur;
    }
  }
  function run() { if (on && !timer) timer = setInterval(tick, TICK); tick(); }
  function halt() { if (timer) clearInterval(timer); timer = null; }
  function ramp(to, dur) { var t = ctx.currentTime, g = master.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + dur); }

  /* ---------- time: where we are in seconds, and seeking by seconds ---------- */
  function barSecs(P, song) { return 240 / (song.bpm * P.bpm); }
  function suiteMap(P) {   // every suite segment with its start time and bar length
    var t = 0, out = [];
    SUITE.forEach(function (m, mi) {
      var bs = barSecs(P, SONGS[m.si]);
      m.segs.forEach(function (seg, sg) { out.push({ mi: mi, sg: sg, from: seg[0], to: seg[1], t0: t, bs: bs, name: m.name }); t += (seg[1] - seg[0]) * bs; });
    });
    out.total = t; return out;
  }
  function times() {
    if (!cur.suite) { var bs = barSecs(cur.P, cur.song), dur = (cur.song.bars + cur.song.outroBars) * bs; return { pos: Math.min(dur, cur.s / 16 * bs), dur: dur }; }
    var map = suiteMap(cur.P), sp = cur.suite, m = map.filter(function (x) { return x.mi === sp.mi && x.sg === sp.seg; })[0];
    return { pos: Math.min(map.total, m.t0 + Math.max(0, cur.s / 16 - m.from) * m.bs), dur: map.total };
  }
  function seekTime(sec) {
    if (!cur) return;
    sec = Math.max(0, +sec || 0);
    if (!cur.suite) {
      var bs = barSecs(cur.P, cur.song), max = (cur.song.bars + cur.song.outroBars) * 16 - 1;
      unTarget(cur); cur.s = Math.min(max, Math.floor(sec / bs * 16)); emit(); return;
    }
    var map = suiteMap(cur.P); sec = Math.min(sec, map.total - 0.05);
    for (var i = 0; i < map.length; i++) {
      var m = map[i];
      if (sec < m.t0 + (m.to - m.from) * m.bs || i === map.length - 1) {
        var s = Math.floor(m.from * 16 + (sec - m.t0) / m.bs * 16);
        if (m.mi === cur.suite.mi) { unTarget(cur); cur.suite.seg = m.sg; cur.s = s; }
        else switchTo(cur.theme, 5, 0.4, cur.loop, { mi: m.mi, seg: m.sg, s: s });
        emit(); return;
      }
    }
  }

  function info() {
    if (!cur) return null;
    var tm = times();
    var base = { name: cur.P.titles[cur.si], theme: cur.theme, themeName: cur.P.name, no: cur.si + 1, si: cur.si, of: suiteOpen(cur.theme) ? 6 : 5, bpm: Math.round(15 / cur.six), loop: cur.loop, paused: paused, pos: tm.pos, dur: tm.dur };
    var outro = cur.s >= cur.song.bars * 16 && cur.tgt ? " · outro → " + cur.P.titles[cur.mv ? 0 : cur.tgt.si] : "";
    if (!cur.suite) { base.bar = Math.min(cur.song.bars - 1, Math.floor(cur.s / 16)); base.bars = cur.song.bars; base.style = cur.song.mood + outro; base.outro = !!outro; return base; }
    var sp = cur.suite, done = 0, i;
    for (i = 0; i < sp.mi; i++) done += segBars(SUITE[i]);
    for (i = 0; i < sp.seg; i++) done += cur.mv.segs[i][1] - cur.mv.segs[i][0];
    done += Math.floor(cur.s / 16) - cur.mv.segs[sp.seg][0];
    base.bar = Math.max(0, Math.min(SUITE_BARS - 1, done)); base.bars = SUITE_BARS; base.style = SUITE_MOOD + " · " + cur.mv.name; base.movement = sp.mi + 1;
    return base;
  }
  function suiteSeek(b) {
    b = Math.max(0, Math.min(SUITE_BARS - 1, b | 0));
    for (var mi = 0; mi < SUITE.length; mi++) for (var sg = 0; sg < SUITE[mi].segs.length; sg++) {
      var seg = SUITE[mi].segs[sg], len = seg[1] - seg[0];
      if (b < len) {
        if (mi === cur.suite.mi) { unTarget(cur); cur.suite.seg = sg; cur.s = (seg[0] + b) * 16; }
        else switchTo(cur.theme, 5, 0.6, cur.loop, { mi: mi, seg: sg, s: (seg[0] + b) * 16 });
        return;
      }
      b -= len;
    }
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
    if (!on) btn.title = "♪ site soundtrack (synthesized live)";
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
  function prevIdx(th, si) { return si === 5 ? 4 : si > 0 ? si - 1 : suiteOpen(th) ? 5 : 4; }
  // ⏮ restarts the track if it's a few seconds in, otherwise goes to the previous one
  function prev() {
    if (!on) return start();
    if (paused) resume();
    if (times().pos > 3) { if (cur.suite) seekTime(0); else { unTarget(cur); cur.s = 0; emit(); } return; }
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
  function bpmRange(P) {
    var b = SONGS.map(function (s) { return Math.round(s.bpm * P.bpm); });
    return Math.min.apply(null, b) + "–" + Math.max.apply(null, b);
  }

  window.SamukaLofi = {
    toggle: function () { if (on) stop(); else start(); },
    start: function () { start(); }, stop: stop, isOn: function () { return on; }, next: next, prev: prev, preview: preview,
    pause: pause, resume: resume, isPaused: function () { return on && paused; },
    seekTime: seekTime, skip: function (d) { if (cur) seekTime(times().pos + d); },
    setLoop: function (v) { if (cur) { cur.loop = !!v; if (!v && cur.tgt && cur.tgt.si === cur.si && !cur.mv) cur.tgt.si = nextIdx(cur.theme, cur.si); emit(); } },
    volume: function (v) { if (v != null) setVolume(v); return vol; },
    // play a track in the normal rotation (it carries on to the next one when it ends)
    play: function (theme, si) { pinned = null; start(THEMES[theme] ? theme : themeId(), si | 0, false); },
    seek: function (bar) { if (!cur) return; if (cur.suite) suiteSeek(bar); else { unTarget(cur); cur.s = Math.max(0, Math.min(cur.song.bars - 1, bar | 0)) * 16; } },
    track: function () { return on ? info() : null; },
    analyser: function () { return on ? analyser : null; },
    theme: themeId,
    suite: {
      open: suiteOpen, unlock: unlockSuite, heard: heardCount, heardMask: heardMask,
      title: function (th) { return THEMES[th] ? THEMES[th].titles[5] : null; },
      themes: function () { return Object.keys(THEMES).map(function (k) { return { theme: k, name: THEMES[k].name, titles: THEMES[k].titles.slice(0, 5), suite: THEMES[k].titles[5], tr: THEMES[k].tr }; }); },
      movements: SUITE.map(function (m) { return { si: m.si, name: m.name }; }),
      // where each movement starts, in seconds (for markers on a seek bar)
      marks: function (th) { var P = THEMES[th] || THEMES.phthalo, seen = {}; return suiteMap(P).filter(function (x) { if (seen[x.mi]) return false; seen[x.mi] = 1; return true; }).map(function (x) { return { at: x.t0, name: x.name }; }); }
    },
    catalog: function () {
      return Object.keys(THEMES).map(function (k) {
        var P = THEMES[k];
        var songs = SONGS.map(function (s, i) { return { no: i + 1, title: P.titles[i], mood: s.mood, bpm: Math.round(s.bpm * P.bpm), bars: s.bars, outro: s.outroBars, secs: Math.round((s.bars + s.outroBars) * 4 * 60 / (s.bpm * P.bpm)) }; });
        songs.push({ no: 6, title: P.titles[5], mood: SUITE_MOOD, bpm: bpmRange(P), bars: SUITE_BARS, secs: suiteSecs(P), suite: true, locked: !suiteOpen(k), heard: heardCount(k) });
        return { theme: k, name: P.name, songs: songs };
      });
    }
  };

  // theme change: same song, new palette (unless a track is pinned on the listening page)
  window.addEventListener("samuka:theme", function () {
    if (!on || !ctx || !cur || pinned) return;
    var th = themeId(); if (th === cur.theme) return;
    if (!cur.suite) switchTo(th, cur.si, 2, false);
    else if (suiteOpen(th)) switchTo(th, 5, 2, false, { mi: cur.suite.mi, seg: cur.suite.seg, s: cur.s });
    else switchTo(th, cur.mv.si, 2, false);   // that theme's suite is still locked: drop into the same song there
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
    btn.addEventListener("click", function () { if (paused) resume(); else if (on) stop(); else start(); });
    nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.className = "icon-btn lofi-btn lofi-next"; nextBtn.setAttribute("aria-label", "Next track"); nextBtn.textContent = "⏭"; nextBtn.hidden = true;
    nextBtn.addEventListener("click", next);
    render();
    var ref = bar.querySelector("[data-toggle-theme]");
    if (ref && ref.parentNode) { ref.parentNode.insertBefore(btn, ref); ref.parentNode.insertBefore(nextBtn, ref); }
    else { bar.appendChild(btn); bar.appendChild(nextBtn); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
