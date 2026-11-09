/* Site soundtrack · 5 original songs × 3 theme palettes = 15 tracks, synthesized live with Web Audio.
 *
 * Songs (the same blueprint for every theme):
 *   1 the theme            a fuzz-bass riff, gated saw stabs, a pulse that never stops (110 bpm)
 *   2 the horror scene     industrial and close: heartbeat, clusters, a broken music box (120 bpm)
 *   3 the character study  emotional trance: a piano melody that grows into the drop (132 bpm)
 *   4 the battle of wits   drum & bass, two hackers splitting the theme left vs right (172 bpm)
 *   5 the epilogue         somber, A=432, strings, a last look back at the theme (60 bpm)
 *   Written after Justice ("Pusher", with Gesaffelstein) and Mac Quayle's Mr. Robot score, as one story
 *   in five chapters; the original theme's hook runs through all of them. See "the five songs" below.
 * Palettes: Phthalo (E minor, cold analog) · Dark Knight (D minor, heavier, choir, low brass) ·
 *           Golden (G minor, glassy bells, shimmer). The secret CRT skin uses Phthalo.
 * Track 6 (secret, per theme) is the director's cut: one long original piece built from the same motifs, unlocked
 *   in the Patch Bay (assets/js/patchbay.js), which wakes after you've heard all five songs. It is built from the
 *   original versions of the five songs, whose material (RZ, KP, LM, RC, EC) is kept for it.
 * Tracks 7–10 are bonus tracks, one per arcade game, unlocked in every theme by finishing a run of that game:
 *   7 Sidekiq Rush  underground techno, rolling bass and three drops (132 bpm, ~3½ min)
 *   8 Gem Match     emotional trance: supersaws, a piano breakdown, long bass drops, a soft kick (138 bpm, 4 min)
 *   9 Schema Stack  a slow climb: fingerpicked guitar and flute, then the band, two guitar solos (76 → 96 bpm, 3 min)
 *  10 Pit Wall      electro techno: five red lights before every drop, lights out, a V8 and screeching tyres throughout (148 bpm, 4 min)
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
  var ctx = null, master = null, analyser = null, noiseBuf = null, verbBuf = null, verbBuf2 = null;
  var on = false, timer = null, cur = null, token = 0, btn = null, nextBtn = null, pinned = null;

  var THEMES = {
    phthalo: { name: "Phthalo", tr: 0, bpm: 1, style: "mrrobot", drive: 2.2, bassDrive: 1.6, kickLow: 44, width: 0.85, presence: 1.5, strBright: 2400, pianoLp: 3200, arp: "saw", lead: "saw", lead2: "pulse", choir: 0, shimmer: 0, verb: 0.55, brass: 1,
      titles: ["Ring Zero", "Something in the Wires", "Alone at 3 AM", "Two Cursors, One Shell", "Green Dawn", "Root Access"] },
    knight: { name: "Dark Knight", tr: -2, bpm: 0.92, style: "industrial", drive: 3.4, bassDrive: 2.6, kickLow: 38, width: 0.75, presence: 0.8, strBright: 1700, pianoLp: 1900, arp: "grit", lead: "grit", lead2: "saw", choir: 1, shimmer: 0, verb: 0.75, brass: 1.3,
      titles: ["Crimson Protocol", "Footsteps Behind You", "What Is Left of Me", "Blade Against Blade", "After the Rain", "The Long Night"] },
    golden: { name: "Golden", tr: 3, bpm: 1.1, style: "kpop", drive: 1.6, bassDrive: 1.3, kickLow: 48, width: 0.95, presence: 3.0, strBright: 3300, pianoLp: 5200, arp: "bell", lead: "glass", lead2: "pulse", choir: 0, shimmer: 1, verb: 0.8, brass: 0.8,
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
    // a safety limiter after the compressor: the compressor's 4 ms attack lets transients through and
    // its make-up gain lifts them, which is how a peak used to reach full scale and clip
    var lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8; lim.connect(analyser);
    var sr = ctx.sampleRate, i, len = sr * 2, d;
    noiseBuf = ctx.createBuffer(1, len, sr); d = noiseBuf.getChannelData(0);
    for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var vlen = Math.floor(sr * 3.2);   // a dark hall: stereo noise, exponential tail, top end rolled off
    verbBuf = ctx.createBuffer(2, vlen, sr);
    for (var ch = 0; ch < 2; ch++) {
      d = verbBuf.getChannelData(ch); var lp = 0;
      for (i = 0; i < vlen; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.33; d[i] = lp * Math.pow(1 - i / vlen, 3); }
    }
    var vlen2 = Math.floor(sr * 2);   // the five songs' room: shorter (and cheaper to convolve), a little brighter
    verbBuf2 = ctx.createBuffer(2, vlen2, sr);
    for (ch = 0; ch < 2; ch++) {
      d = verbBuf2.getChannelData(ch); var lp2 = 0;
      for (i = 0; i < vlen2; i++) { lp2 += ((Math.random() * 2 - 1) - lp2) * 0.45; d[i] = lp2 * Math.pow(1 - i / vlen2, 3.2); }
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
  // a 4 ms glide down rather than a jump: an instant gain step under held notes is a click, on every kick
  function duckAt(o, t, depth) { var d = o.duck.gain; d.cancelScheduledValues(t); d.setTargetAtTime(depth, t, 0.004); d.setTargetAtTime(1, t + 0.03, 0.09); }
  function kick(o, t, v) {
    var s = osc("sine", 160, t, t + 0.6), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(o.P.kickLow, t + 0.09);
    env(g, t, 0.002, 0.5, v); s.connect(g); g.connect(o.drums);
    var c = noise(t, 0.02), cf = filt("highpass", 2500), cg = gain(0); env(cg, t, 0.001, 0.018, 0.25 * v); c.connect(cf); cf.connect(cg); cg.connect(o.drums);
    duckAt(o, t, o.duckDepth != null ? o.duckDepth : 0.32);
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

  /* ======================= the five songs' engine =======================
   * The five songs are written for the audio thread's budget. Measured in a live AudioContext, the old
   * horror chase missed its render deadline 161 times in 12 seconds: that is the crackling and tearing.
   * Most of the cost was two habits, benchmarked offline: a vibrato LFO wired into every oscillator's
   * detune (3.7x a plain oscillator) and a filter sweep on almost every note (4.5x a fixed filter).
   * So here the movement lives on a handful of buses per track, each with one filter; width comes from
   * a stereo ensemble chorus and from fixed seats that every hit reuses instead of making its own
   * panner; and nothing is waveshaped at a level that can pass full scale (a WaveShaper hard-clips
   * anything outside its curve). Older tracks keep the original voices. */
  var SEAT = 0;
  // a persistent panner per (bus, position), shared by every hit that sits there
  function seat(o, dest, pan) {
    var id = dest.__seat || (dest.__seat = ++SEAT), key = id + ":" + Math.round(pan * 100), c = o.seats || (o.seats = {});
    if (!c[key]) { var p = panner(pan * (o.P.width || 0.85)); p.connect(dest); c[key] = p; }
    return c[key];
  }
  // a v2 bus, or - when an older track's outro foreshadows one of the five - a plain filter into its duck bus
  function inlet(o, key, hz, q) {
    if (o[key]) return o[key];
    var fk = "_" + key;
    if (!o[fk]) { o[fk] = filt("lowpass", hz, q || 0.7); o[fk].connect(o.duck); }
    return o[fk];
  }
  function busesV2(o, t) {
    var P = o.P, w = P.width || 0.85;
    function sendTo(node, verb, dly) {
      if (verb) { var v = gain(verb); node.connect(v); v.connect(o.verb); }
      if (dly) { var d = gain(dly); node.connect(d); d.connect(o.delay); }
    }
    // pads and strings: one swept lowpass, a tremolo stage, then an ensemble chorus - two short delays
    // whose times an LFO pulls in opposite directions, one per side. It is the string machine's trick,
    // and it makes every note wide and alive without a single per-oscillator modulator.
    o.padIn = gain(1); o.padF = filt("lowpass", 1400, 0.5); o.padTrem = gain(1);
    var ensIn = gain(1), ensOut = gain(1), dry = gain(0.7), dL = ctx.createDelay(0.05), dR = ctx.createDelay(0.05);
    var lfo = osc("sine", 0.63, t, t + 36000), mL = gain(0.0032), mR = gain(-0.0032), wL = gain(0.55), wR = gain(0.55), pL = panner(-w), pR = panner(w);
    dL.delayTime.value = 0.011; dR.delayTime.value = 0.013;
    lfo.connect(mL); lfo.connect(mR); mL.connect(dL.delayTime); mR.connect(dR.delayTime);
    o.padIn.connect(o.padF); o.padF.connect(o.padTrem); o.padTrem.connect(ensIn);
    ensIn.connect(dry); dry.connect(ensOut);
    ensIn.connect(dL); dL.connect(wL); wL.connect(pL); pL.connect(ensOut);
    ensIn.connect(dR); dR.connect(wR); wR.connect(pR); pR.connect(ensOut);
    o.padOut = gain(1); ensOut.connect(o.padOut); o.padOut.connect(o.duck); sendTo(o.padOut, P.style === "industrial" ? 0.7 : 0.5);
    // the tremolo sits at zero depth until a song asks for it
    o.tremLfo = osc("sine", 9, t, t + 36000); o.tremDepth = gain(0); o.tremLfo.connect(o.tremDepth); o.tremDepth.connect(o.padTrem.gain);
    o.nodes.push(lfo, o.tremLfo);
    // the pulse: one resonant lowpass swept by the arrangement, thrown into the echoes
    o.arpIn = gain(1); o.arpF = filt("lowpass", 900, P.style === "industrial" ? 6 : 3.2); o.arpOut = gain(1);
    o.arpIn.connect(o.arpF); o.arpF.connect(o.arpOut); o.arpOut.connect(o.duck); sendTo(o.arpOut, 0.16, 0.42);
    // fuzz bass: Justice's sound is a saturated, mid-heavy bass, so the fuzz lives on this bus.
    // Notes arrive here below 0.9 peak, so the shaper never runs off the end of its curve.
    o.fuzzIn = gain(1); o.fuzzF = filt("lowpass", 900, 2.2);
    var fz = shaper(P.bassDrive * 2.2), fzPost = gain(0.42), fzHp = filt("highpass", 38, 0.7);
    o.fuzzOut = gain(1);
    o.fuzzIn.connect(o.fuzzF); o.fuzzF.connect(fz); fz.connect(fzPost); fzPost.connect(fzHp); fzHp.connect(o.fuzzOut); o.fuzzOut.connect(o.duck);
    // stabs: saw chords through a little saturation
    o.stabIn = gain(1); var sHp = filt("highpass", 220, 0.7), sSh = shaper(1.6), sPost = gain(0.75);
    o.stabOut = gain(1); o.stabIn.connect(sHp); sHp.connect(sSh); sSh.connect(sPost); sPost.connect(o.stabOut); o.stabOut.connect(o.duck); sendTo(o.stabOut, 0.32, 0.12);
    // keys: one fixed lowpass for the piano and the music box
    o.keysIn = gain(1); var kLp = filt("lowpass", P.pianoLp * 1.3, 0.5);
    o.keysOut = gain(1); o.keysIn.connect(kLp); kLp.connect(o.keysOut); o.keysOut.connect(o.duck); sendTo(o.keysOut, 0.55, 0.1);
    o.bright = P.style === "kpop" ? 1.35 : P.style === "industrial" ? 0.72 : 1;
  }
  // bus faders for a section, gliding (tc seconds) rather than jumping. With song.arpDirect the pulse's fader
  // also cancels that section's level, so the pulse stays where the opening put it while the band comes in.
  function mixTo(o, t, mix, tc) {
    mix = mix || {};
    var lift = o.song.arpDirect ? ((o.song["lift_" + o.theme] || {})[o.song.sec(Math.floor(o.s / 16)).id] || 0) : 0;
    ["pad", "arp", "fuzz", "stab", "keys"].forEach(function (k) {
      var v = mix[k] != null ? mix[k] : 1;
      if (k === "arp" && lift) v *= Math.pow(10, -lift / 20);
      if (o[k + "Out"]) o[k + "Out"].gain.setTargetAtTime(v, t, tc);
    });
  }
  // a bus filter, scaled by the palette's brightness (K-pop opens up, industrial closes down)
  function sweep(o, name, hz, t, tc) { if (o[name]) o[name].frequency.setTargetAtTime(hz * (o.bright || 1), t, tc); }
  function tremTo(o, t, depth, rate) {
    if (!o.tremDepth) return;
    o.tremDepth.gain.setTargetAtTime(depth || 0, t, 0.3);
    if (rate) o.tremLfo.frequency.setTargetAtTime(rate, t, 0.3);
  }

  // string machine: two fixed-pitch saws per note, each note in its own seat; the bus does the rest
  function sm(o, t, notes, len, vol, opt) {
    opt = opt || {};
    var a = opt.a != null ? opt.a : Math.min(1.2, len * 0.3), r = opt.r != null ? opt.r : 1.2;
    var dest = inlet(o, "padIn", 1400), n = notes.length, each = vol / Math.sqrt(n), stop = t + Math.max(a, len) + r + 0.05, spread = opt.w != null ? opt.w : 0.6;
    notes.forEach(function (m, i) {
      var g = gain(0); swell(g, t, a, len, r, each);
      osc(opt.wave || "sawtooth", F(o, m), t, stop, -7).connect(g); osc(opt.wave || "sawtooth", F(o, m), t, stop, 7).connect(g);
      g.connect(seat(o, dest, n === 1 ? 0 : (i / (n - 1) * 2 - 1) * spread));
    });
  }
  // the Mac Quayle pulse: one oscillator, a short envelope, a seat; the bus filter shapes it
  function parp(o, t, m, v, len, pan) {
    var dest = inlet(o, "arpIn", 900, 3), g = gain(0), l = len || o.six * 0.8;
    env(g, t, 0.003, l, 0.075 * v);
    osc(o.P.arp === "bell" ? "triangle" : o.P.arp === "grit" ? "square" : "sawtooth", F(o, m), t, t + l + 0.06).connect(g);
    g.connect(seat(o, dest, pan || 0));
  }
  // fuzz bass: two saws and a square an octave down; hold = a sustained note instead of a pluck
  function fz(o, t, m, v, len, hold) {
    var dest = inlet(o, "fuzzIn", 700, 2), g = gain(0), stop = t + len + 0.1;
    if (hold) swell(g, t, 0.012, len, 0.08, 0.12 * v); else env(g, t, 0.003, len, 0.13 * v);
    osc("sawtooth", F(o, m), t, stop, -6).connect(g); osc("sawtooth", F(o, m), t, stop, 6).connect(g);
    var so = gain(0.35); osc("square", F(o, m - 12), t, stop).connect(so); so.connect(g);   // a hint of the octave below, not a wall of it
    g.connect(dest);
  }
  // a Justice stab: a saw chord with its octave, short, saturated, thrown to one side
  function stb(o, t, notes, v, len, pan) {
    var dest = inlet(o, "stabIn", 2600), g = gain(0), l = len || 0.09, stop = t + l + 0.3;
    env(g, t, 0.002, l + 0.12, 0.055 * v * (o.P.style === "industrial" ? 0.55 : 1));
    notes.forEach(function (m) { osc("sawtooth", F(o, m), t, stop, -9).connect(g); osc("sawtooth", F(o, m + 12), t, stop, 9).connect(g); });
    g.connect(seat(o, dest, pan || 0));
  }
  // piano: a struck triangle with its octave partial; the keyboard is spread across five seats
  function keys(o, t, m, v, len) {
    var dest = inlet(o, "keysIn", 3200), g = gain(0), h = gain(0.28), stop = t + len + 0.1, f = F(o, m);
    env(g, t, 0.003, len, 0.12 * v);
    osc("triangle", f, t, stop).connect(g); osc("sine", f * 2, t, stop, 3).connect(h); h.connect(g);
    g.connect(seat(o, dest, Math.round(Math.max(-1, Math.min(1, (m - 62) / 24)) * 2) / 4));
  }
  // a music box, slightly out of true
  function box(o, t, m, v, len, cents) {
    var dest = inlet(o, "keysIn", 3200), g = gain(0), b = gain(0.32), stop = t + len + 0.1, f = F(o, m);
    env(g, t, 0.002, len, 0.08 * v);
    osc("sine", f, t, stop, cents || 0).connect(g); osc("sine", f * 4.02, t, stop, cents || 0).connect(b); b.connect(g);
    g.connect(seat(o, dest, ((m % 5) - 2) / 4));
  }
  // a keystroke or a data glitch: a few milliseconds of band-passed noise
  function blip(o, t, v, pan, hz) {
    var n = noise(t, 0.03), f = filt("bandpass", hz || 3800, 2.5), g = gain(0);
    env(g, t, 0.0008, 0.018, 0.2 * v); n.connect(f); f.connect(g); g.connect(seat(o, o.drums, pan || 0));
  }
  function hh(o, t, v, open, pan) {
    var n = noise(t, open ? 0.25 : 0.06), hp = filt("highpass", 7400, 0.8), g = gain(0);
    env(g, t, 0.001, open ? 0.2 : 0.035, 0.15 * v); n.connect(hp); hp.connect(g); g.connect(seat(o, o.drums, pan || 0));
  }
  // a scream in the strings: one saw sliding up a tritone's worth, no vibrato
  function scr(o, t, m, len, v, pan) {
    var s = osc("sawtooth", F(o, m), t, t + len + 0.35), bp = filt("bandpass", 2600, 4), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(F(o, m + 6), t + len);
    swell(g, t, len * 0.3, len * 0.7, 0.3, v); s.connect(bp); bp.connect(g); g.connect(seat(o, o.duck, pan || 0)); send(o, g, 1.1);
  }
  // breath in an empty room: band-passed noise, swelling and falling
  function wind(o, t, len, v) {
    var n = noiseL(t, len + 0.6), bp = filt("bandpass", 520, 0.9), g = gain(0);
    swell(g, t, len * 0.45, len * 0.55, len * 0.4, 0.05 * v); n.connect(bp); bp.connect(g); g.connect(o.duck); send(o, g, 0.8);
  }
  // brass: one filter per chord, opening with the breath (rare enough to afford the sweep)
  function br2(o, t, notes, len, vol) {
    var a = Math.min(0.8, len * 0.4), lp = filt("lowpass", 250, 1.1), g = gain(0), stop = t + len + 0.9;
    lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(1500 * o.P.brass, t + a); lp.frequency.linearRampToValueAtTime(900 * o.P.brass, t + len);
    swell(g, t, a, len, 0.8, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) { osc("sawtooth", F(o, m), t, stop, -6).connect(lp); osc("sawtooth", F(o, m), t, stop, 6).connect(lp); });
    lp.connect(g); g.connect(seat(o, o.duck, 0)); send(o, g, 0.5);
  }
  // the lead for the five songs: brighter than makeLead, with a little grit on every kind
  function makeLead2(o, t, kind, panV) {
    var spec = { saw: [["sawtooth", 1, -7], ["square", 0.5, 6]], grit: [["sawtooth", 1, -9], ["sawtooth", 1, 9]], glass: [["triangle", 1, 0], ["sine", 2, 0]], pulse: [["square", 1, 0], ["square", 1.0, 8]] }[kind];
    var mix = gain(0.38), sh = shaper(kind === "grit" ? 2.4 : 1.4), lp = filt("lowpass", 2600, kind === "pulse" ? 5 : 2.5), g = gain(0.0001), p = panner(panV || 0), oscs = [];
    spec.forEach(function (sp) { var s = osc(sp[0], 440, t, t + 36000, sp[2]); s.connect(mix); o.vibG.connect(s.detune); o.nodes.push(s); oscs.push([s, sp[1]]); });
    mix.connect(sh); sh.connect(lp); lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.24, 0.16);
    return {
      play: function (tt, m, len, vol) {
        var f = F(o, m);
        oscs.forEach(function (x) { x[0].frequency.setTargetAtTime(f * x[1], tt, 0.018); });
        var b = o.bright || 1, v = vol * (o.P.style === "industrial" ? 0.75 : 1);
        var gg = g.gain; gg.cancelScheduledValues(tt); gg.setTargetAtTime(v, tt, 0.012); gg.setTargetAtTime(0.0001, tt + len * 0.85, 0.06);
        lp.frequency.cancelScheduledValues(tt); lp.frequency.setTargetAtTime((kind === "glass" ? 5200 : 4200) * b, tt, 0.015); lp.frequency.setTargetAtTime((kind === "glass" ? 3000 : 2200) * b, tt + 0.08, 0.3);
      }
    };
  }
  // each section of a song gets one level (song.lift, in dB); the curve ramps over the last beat before a change
  function dynFromSections(song, theme) {
    var lift = song["lift_" + theme] || {}, ramp = song.ramp || 0.25, pts = [], prev = null;
    for (var b = 0; b < song.bars; b++) {
      var v = lift[song.sec(b).id] || 0;
      if (prev === null) pts.push([0, v]);
      else if (v !== prev) { pts.push([b - ramp, prev]); pts.push([b, v]); }
      prev = v;
    }
    pts.push([song.bars, prev]);
    return pts;
  }
  function dynAt(pts, bar) {
    if (bar <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (bar <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * ((bar - a[0]) / Math.max(0.0001, b[0] - a[0])); }
    return pts[pts.length - 1][1];
  }
  function scheduleDyn(o, t) {
    var song = o.song;
    if (!o.dyn || !song.sec) return;
    var cache = song.dynBy || (song.dynBy = {}), pts = cache[o.theme] || (cache[o.theme] = dynFromSections(song, o.theme)), g = o.dyn.gain, barLen = o.six * 16, base = Math.pow(10, (o.trim || 0) / 20), bar0 = o.s / 16;
    var lvl = function (d) { return base * Math.pow(10, d / 20); };
    g.cancelScheduledValues(t); g.setValueAtTime(lvl(dynAt(pts, bar0)), t);
    pts.forEach(function (p) { if (p[0] > bar0) g.linearRampToValueAtTime(lvl(p[1]), t + (p[0] - bar0) * barLen); });
  }

  /* ---------- the drums, one kit per palette ----------
   * Phthalo plays Mac Quayle's kit, measured from the drum stem of "3.0_1-one2blame.orc": every hit short
   * (10-20 ms to -20 dB), dry, close to the centre; a kick around 65 Hz used sparingly; percussion on the
   * offbeat 8ths in two colours (a rim near 1 kHz, a clap near 2.5 kHz); and 16th hats - the loudest
   * thing in the kit - that skip exactly the steps the percussion takes.
   * Golden plays K-pop: half-time trap in the verses, four on the floor in the choruses, clap and snap
   * on the backbeat, 32nd hat rolls into every fourth bar, an 808 tail under the kick.
   * Dark Knight plays underground industrial techno: a driven kick on every beat from the first bar,
   * a rumble in the gaps, metal on the offbeats. */
  function kickT(o, t, v) {   // short and punchy, a click on top
    var s = osc("sine", 150, t, t + 0.25), g = gain(0), c = noise(t, 0.012), cf = filt("bandpass", 2400, 1.2), cg = gain(0);
    s.frequency.exponentialRampToValueAtTime(Math.max(55, o.P.kickLow * 1.45), t + 0.045);
    env(g, t, 0.0015, 0.16, 0.85 * v); s.connect(g); g.connect(o.drums);
    env(cg, t, 0.0008, 0.008, 0.3 * v); c.connect(cf); cf.connect(cg); cg.connect(o.drums);
    duckAt(o, t, o.duckDepth != null ? Math.min(0.85, o.duckDepth + 0.2) : 0.55);
  }
  function percT(o, t, kind, v, pan) {   // a rim (1 kHz, 9 ms) or a clap (2.5 kHz, 12 ms)
    var rim = kind === "rim", n = noise(t, 0.03), f = filt("bandpass", rim ? 1050 : 2500, rim ? 2.8 : 1.4), g = gain(0);
    var p = seat(o, o.drums, pan != null ? pan : rim ? -0.1 : 0.1);
    env(g, t, 0.0008, rim ? 0.018 : 0.026, (rim ? 0.34 : 0.32) * v); n.connect(f); f.connect(g); g.connect(p);
    if (rim) { var s = osc("sine", 830, t, t + 0.04), sg = gain(0); env(sg, t, 0.0008, 0.014, 0.1 * v); s.connect(sg); sg.connect(p); }
  }
  function hatT(o, t, v, pan) {   // a closed hat, 17 ms
    var n = noise(t, 0.04), hp = filt("highpass", 6800, 0.9), g = gain(0);
    env(g, t, 0.0008, 0.024, 0.2 * v); n.connect(hp); hp.connect(g); g.connect(seat(o, o.drums, pan || 0));
  }
  function snap(o, t, v) {   // a finger snap: a few ms of bright noise and a little room
    var n = noise(t, 0.03), f = filt("bandpass", 3600, 1.6), g = gain(0);
    env(g, t, 0.0006, 0.022, 0.28 * v); n.connect(f); f.connect(g); g.connect(seat(o, o.drums, 0.15)); send(o, g, 0.35);
  }
  function kick808(o, t, v) {   // the usual punch with a long, round tail under it
    kick(o, t, v);
    var s = osc("sine", o.P.kickLow * 1.3, t, t + 0.75), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(o.P.kickLow, t + 0.3);
    env(g, t, 0.01, 0.55, 0.2 * v); s.connect(g); g.connect(o.bus);
  }
  function rumble(o, t, v) {   // the techno rumble: a low, distorted thump in the gap after the kick
    var s = osc("sine", 54, t, t + 0.32), lp = filt("lowpass", 170, 0.8), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    env(g, t, 0.012, 0.2, 0.26 * v); s.connect(lp); lp.connect(g); g.connect(o.drums); send(o, g, 0.3);
  }
  // lv: 0 none, 1 light, 2 groove, 3 full. opt: four (a kick every beat), back (a backbeat), fill (the last beat
  // of a section), v (overall velocity, so a kit can grow in across a section instead of arriving at full weight)
  function kit(o, t, st, bar, lv, opt) {
    opt = opt || {};
    if (!lv) return;
    var style = o.P.style, fill = opt.fill && st >= 12, six = o.six, V = opt.v != null ? opt.v : 1;
    if (fill) { fillIn(o, t, st, 0.9 * V); return; }
    if (style === "kpop") {
      var four = lv >= 3 || opt.four;
      if (four ? st % 4 === 0 : (st === 0 || st === 10 || (st === 7 && bar % 2))) kick808(o, t, V * (lv >= 2 ? 1 : 0.7));
      var back = four ? (st === 4 || st === 12) : st === 8;
      if (back && lv >= 2) { clap(o, t, V * 0.75); snap(o, t, V * 0.75); }
      if (lv === 1 && st === 12) snap(o, t, V * 0.6);
      if (bar % 4 === 3 && st >= 12 && lv >= 2) {   // the trap roll into every fourth bar, in 32nds
        hh(o, t, V * (0.3 + (st - 12) * 0.12), false, -0.15); hh(o, t + six / 2, V * (0.35 + (st - 12) * 0.12), false, 0.15);
      } else if (lv >= 3 || st % 2 === 0) hh(o, t, V * (st % 4 === 2 ? 0.8 : 0.45), four && st % 4 === 2, st % 2 ? 0.2 : -0.2);
    } else if (style === "industrial") {
      if (st % 4 === 0) { if (lv >= 2) bigKick(o, t, V * 0.9); else softKick(o, t, V * 0.9); }   // light: a kick through the wall
      if (st % 4 === 2) rumble(o, t, V * (lv >= 3 ? 1 : lv === 2 ? 0.8 : 0.55));
      if (lv >= 2) hh(o, t, V * (st % 4 === 2 ? 0.65 : 0.3), lv >= 3 && st % 4 === 2, st % 2 ? 0.25 : -0.25);
      if (lv >= 2 && (st === 7 || st === 15 || (st === 11 && bar % 2))) clank(o, t, V * 0.4);
      if (lv >= 3 && opt.back && (st === 4 || st === 12)) clap(o, t, V * 0.7);
    } else {   // Mr. Robot
      if (st % 4 !== 2) hatT(o, t, V * (st % 4 === 0 ? 0.75 : st % 2 ? 0.5 : 0.6) * (lv === 1 ? 0.7 : 1), ((st * 3) % 5 - 2) * 0.04);
      if (st % 4 === 2 && (lv >= 2 || st === 6 || st === 14)) percT(o, t, st === 6 || st === 14 ? "clap" : "rim", V * (lv >= 2 ? 0.9 : 0.6));
      if (lv >= 2 && (st === 9 || (st === 1 && bar % 2))) percT(o, t, "rim", V * 0.45);
      if (opt.four ? st % 4 === 0 : (st === 0 || (st === 10 && bar % 2) || (st === 14 && bar % 4 === 3 && lv >= 3))) kickT(o, t, V * (lv >= 3 ? 1 : 0.8));
      if (lv >= 3 && opt.back && (st === 4 || st === 12)) percT(o, t, "clap", V * 0.75, 0);
    }
  }
  function fillIn(o, t, st, v) {   // the last four 16ths before a new section
    if (o.P.style === "mrrobot") percT(o, t, st % 2 ? "rim" : "clap", v * (0.6 + (st - 12) * 0.12), (st - 13.5) * 0.15);
    else tom(o, t, [190, 155, 125, 98][st - 12], v);
  }
  function rollHit(o, t, v) { if (o.P.style === "mrrobot") percT(o, t, "clap", v, 0); else snare(o, t, v); }
  // K-pop's chopped-vocal hook, played by a stab an octave up on the syncopations
  function chop(o, t, st, notes) {
    if (o.P.style !== "kpop" || [3, 6, 11, 14].indexOf(st) < 0) return;
    stb(o, t, notes.map(function (m) { return m + 12; }), 0.5, o.six * 0.6, st % 2 ? 0.5 : -0.5);
  }
  // high sines swelling in and out, far away: atmosphere, not a part
  function glass(o, t, notes, len, vol) {
    var dest = inlet(o, "keysIn", 3200), g = gain(0), stop = t + len + 1.8;
    swell(g, t, len * 0.5, len * 0.5, 1.6, vol);
    notes.forEach(function (m, i) { osc("sine", F(o, m), t, stop, i % 2 ? 4 : -4).connect(g); });
    g.connect(seat(o, dest, 0.3));
  }

  /* ---------- the original five songs' material ----------
   * No longer played as songs: the director's cut (track 6) is built from it. */
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

  /* ======================= the five songs · one story in five chapters =======================
   * Written after Justice ("Pusher", with Gesaffelstein) and Mac Quayle's Mr. Robot score: a saturated
   * fuzz bass, gated saw stabs and wide, upfront leads from the first; sequenced analog pulses, string
   * machines, held tension and long quiet from the second. The hook from the original theme (RZ.lead:
   * B A G F# G E) is the thread through all five: the theme states it, the horror hears it on a broken
   * music box, the character study grows it into a melody, the duel splits it between two people, and
   * the epilogue breathes it once more. Every song is in E minor (the epilogue ends in G) and hands over
   * to the next through its outro.
   * The palettes play them in three styles: Phthalo as written, with Mac Quayle's drums; Golden as K-pop,
   * fastest of the three; Dark Knight as underground industrial techno, slowest and grittiest (see kit()).
   * song.tone moves a song's low end and presence towards the battle of wits, whose mix sits its weight
   * at 60-250 Hz rather than in the sub, with more bite at 2.5-5 kHz. */

  /* ---------- 1 · the theme ---------- */
  var T1 = {
    ch: [{ r: 40, tri: [52, 55, 59] }, { r: 36, tri: [48, 52, 55] }, { r: 33, tri: [45, 48, 52] }, { r: 35, tri: [47, 51, 54] }],
    // the riff: semitones over the root, null = rest. It breathes, the way Justice riffs do
    riff: [0, null, 0, 12, null, 0, null, 10, 0, null, 12, 0, null, 7, 10, null],
    riffB: [0, 12, 0, 12, null, 0, 10, 12, 0, null, 12, 0, 7, 10, 12, 10],
    acc: [1, 0, 0.7, 0.95, 0, 0.8, 0, 0.65, 1, 0, 0.9, 0.7, 0, 0.8, 0.75, 0],
    arp: [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 0, 3, 2, 1, 2],
    stabA: [3, 6, 11, 14], stabB: [0, 3, 6, 8, 11, 14],
    sec: function (bar) {
      if (bar < 8) return { id: "boot", arp: 1, arpCut: 480 + bar * 150, pulse: bar >= 4, mix: { arp: 1.3 } };
      if (bar < 16) return { id: "pulse", arp: 1, arpCut: 1600, bass: 1, fuzz: 520 + (bar - 8) * 70, drums: 1, kv: Math.min(1, 0.45 + (bar - 8) * 0.18), fill: bar === 15, drop: bar === 15, mix: { arp: 1.3, fuzz: Math.min(0.8, 0.3 + (bar - 8) * 0.17) } };
      if (bar < 32) return { id: "theme", arp: 1, arpCut: 2100, bass: 1, fuzz: 1400, drums: 2, stab: 1, lead: bar >= 24, crash: bar === 16 || bar === 24, fill: bar === 23 || bar === 31, mix: { arp: 1.3 } };
      if (bar < 40) return { id: "break", arp: 0.6, arpCut: 900, pad: 1, lead: 1, sub: 1, riser: bar === 36, roll: bar >= 38, drop: bar === 39, mix: { arp: 1.3 } };
      if (bar < 56) return { id: "drive", arp: 1, arpCut: 2700, bass: 2, fuzz: 2100, drums: 3, stab: 2, lead: 1, pad: bar >= 48, crash: bar === 40 || bar === 48, fill: bar === 47 || bar === 55, mix: { arp: 1.3 } };
      return { id: "decay", arp: 1, arpCut: 2100 - (bar - 56) * 200, bass: 1, fuzz: 1300 - (bar - 56) * 100, drums: bar < 60 ? 1 : 0, pad: 1, mix: { arp: 1.3 } };
    }
  };
  var SONG_RING = {
    mood: "the theme · a fuzz-bass stomp over a pulse that never stops", bpm: 110, bars: 64, v2: true, duckDepth: 0.42, sec: T1.sec,
    trim: { "phthalo": 8.2, "knight": -1.3, "golden": 2.7 },
    lift_golden: { "boot": 0.0, "pulse": -5.3, "theme": -1.5, "break": -1.1, "drive": 0.0, "decay": -1.7 },
    lift_knight: { "boot": 0.0, "pulse": 0.5, "theme": -1.8, "break": 4.3, "drive": 0.0, "decay": 3.4 },
    lift_phthalo: { "boot": 0.0, "pulse": -6.0, "theme": -0.6, "break": -4.5, "drive": 0.0, "decay": -3.8 },
    arpDirect: true, tone: { sub: -2.5, punch: 2, pres: 2 },
    init: function (o, t) { o.sub = makeSub(o, t); o.lead = makeLead2(o, t, o.P.lead, -0.35); },
    play: function (o, t, st, bar) {
      var sec = T1.sec(bar), c = T1.ch[Math.floor(bar / 2) % 4], six = o.six, fill = sec.fill && st >= 12;
      if (st === 0) {
        mixTo(o, t, sec.mix, six * 8);
        sweep(o, "arpF", sec.arpCut, t, 0.6);
        if (sec.fuzz) sweep(o, "fuzzF", sec.fuzz, t, 0.4);
        o.sub.set(t, c.r - 12, sec.bass || sec.sub ? 0.13 : sec.pulse ? 0.03 + (bar - 4) * 0.008 : 0.0001);
        sweep(o, "padF", sec.id === "break" ? 1500 : 2300, t, 1);
        if (sec.pad && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, 0.05, { a: six * 6, r: 1.6 });
        if (sec.riser) riser(o, t, six * 64, 0.08);
        if (sec.crash) crash(o, t, 1);
      }
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.5);
      if (sec.arp) parp(o, t, [c.tri[0] + 12, c.tri[1] + 12, c.tri[2] + 12, c.tri[0] + 24][T1.arp[st]], (st % 4 === 0 ? 1 : 0.72) * sec.arp, six * 0.8, st % 2 ? 0.45 : -0.45);
      if (sec.bass) {
        var rf = sec.bass === 2 ? T1.riffB : T1.riff, n = rf[st];
        if (n !== null) fz(o, t, c.r + n, sec.bass === 2 ? (st % 4 === 0 ? 1 : 0.8) : (T1.acc[st] || 0.7), six * (rf[(st + 1) % 16] === null ? 1.6 : 0.85));
      }
      kit(o, t, st, bar, sec.drums, { four: true, back: sec.drums >= 2, fill: sec.fill, v: sec.kv });
      if (sec.roll && (st % 2 === 0 || bar === 39)) rollHit(o, t, 0.3 + (bar - 38) * 0.25 + st * 0.02);
      if (sec.stab && !fill && (sec.stab === 2 ? T1.stabB : T1.stabA).indexOf(st) >= 0) stb(o, t, c.tri, st % 4 === 0 ? 1 : 0.8, six * 0.9, st % 2 ? 0.55 : -0.55);
      if (sec.stab) chop(o, t, st, c.tri);
      if (bar === 39 && st >= 12) { stb(o, t, c.tri, 0.5, six * 0.3, st % 2 ? 0.7 : -0.7); stb(o, t + six * 0.5, c.tri, 0.4, six * 0.3, st % 2 ? -0.7 : 0.7); }
      if (sec.lead) { var pos = (bar % 8) * 16 + st; RZ.lead.forEach(function (n) { if (n[0] === pos) o.lead.play(t, n[1], n[2] * six, sec.id === "break" ? 0.07 : 0.085); }); }
    }
  };

  /* ---------- 2 · the horror scene ---------- */
  var H2 = {
    cl: [[64, 65, 71], [63, 64, 70], [65, 66, 72], [64, 65, 70]],   // E-F-B clusters, slipping a semitone
    walk: [40, 40, 41, 40, 40, 40, 41, 43],                        // the bass creeps up on you
    hunt: [0, null, null, 0, null, null, 1, null, 0, null, 0, null, null, 1, null, null],
    found: [null, null, 0, 12, null, null, 0, null, null, null, 0, 12, null, null, 0, 1],
    // the hook, on a music box that has been in the dark too long
    box: [[0, 0, 71, 6], [0, 6, 69, 2], [0, 8, 67, 8], [1, 0, 66, 4], [1, 4, 67, 4], [1, 8, 64, 8]],
    // a piano somewhere else in the house: the semitone the whole song is built on, far away
    far: [[2, 8, 77], [3, 0, 76], [6, 4, 77], [7, 12, 76]],
    sec: function (bar) {
      if (bar < 8) return { id: "dark room", heart: 1, cluster: bar % 4 === 0, trem: 0.2, sub: 0.09, drone: 1, far: 1 };
      if (bar < 16) return { id: "something moves", heart: 2, cluster: bar % 2 === 0, trem: 0.3, bass: "walk", fuzz: 380, sub: 0.11, drone: 1, glass: bar % 4 === 2, riser: bar === 12 };
      if (bar < 32) return { id: "it hunts", cluster: bar % 2 === 0, trem: 0.42, bass: "hunt", fuzz: 650, drums: 2, screech: bar % 4 === 2, stab: bar % 2 === 1, sub: 0.13, fill: bar === 31, drone: 0.6 };
      if (bar < 40) return { id: "hide", heart: 3, box: 1, glass: bar % 4 === 0, drone: 1, far: 1, sub: 0.07, trem: 0, riser: bar === 36, drop: bar === 39 };
      if (bar < 56) return { id: "found", cluster: bar % 2 === 0, trem: 0.45, bass: "found", fuzz: 950, drums: 3, screech: bar % 4 === 0, stab: bar % 2 === 0, sub: 0.14, crash: bar === 40 || bar === 48 };
      return { id: "black", heart: 4, sub: 0.04, trem: 0, last: bar === 56, drone: 0.7 };
    }
  };
  var SONG_DARK = {
    mood: "the horror scene · something in the dark, industrial and close", bpm: 120, bars: 60, v2: true, duckDepth: 0.4, sec: H2.sec,
    trim: { "phthalo": 7.9, "knight": -0.6, "golden": 3.3 },
    lift_golden: { "dark room": -3.4, "something moves": -5.9, "it hunts": 0.4, "hide": -2.6, "found": 0.0, "black": -0.8 },
    lift_knight: { "dark room": 1.6, "something moves": -5.7, "it hunts": -1.9, "hide": 1.8, "found": 0.0, "black": 4.3 },
    lift_phthalo: { "dark room": -6.9, "something moves": -11.6, "it hunts": 0.5, "hide": -6.6, "found": 0.0, "black": -4.9 },
    tone: { sub: -3, punch: 2, pres: 2 },
    init: function (o, t) { o.sub = makeSub(o, t); },
    play: function (o, t, st, bar) {
      var sec = H2.sec(bar), cl = H2.cl[(bar >> 1) % 4], six = o.six;
      if (st === 0) {
        tremTo(o, t, sec.trem, 8 + (bar % 3));
        sweep(o, "padF", sec.id === "found" ? 2600 : 1600, t, 0.8);
        if (sec.fuzz) sweep(o, "fuzzF", sec.fuzz, t, 0.5);
        o.sub.set(t, 28, sec.sub);
        if (sec.cluster) sm(o, t, cl, six * 32, sec.id === "dark room" ? 0.035 : 0.045, { a: six * 8, r: 2 });
        // the atmosphere: a low drone that breathes, far-off glass, a piano in another room - all of it quiet
        if (sec.drone && bar % 4 === 0) sm(o, t, [40, 47], six * 64, 0.028 * sec.drone, { a: six * 20, r: 3, w: 0.8, wave: "triangle" });
        if (sec.glass) glass(o, t, bar % 8 < 4 ? [83, 88] : [84, 89], six * 48, 0.012);
        if (sec.screech) scr(o, t, 76 + (bar % 3), six * 10, 0.04, bar % 8 < 4 ? -0.7 : 0.7);
        if (sec.riser) riser(o, t, six * 64, 0.06);
        if (sec.crash) crash(o, t, 0.9);
        if (sec.last) { sm(o, t, [40, 41], six * 56, 0.05, { a: 0.05, r: 3, w: 0.3 }); keys(o, t, 28, 0.9, 6); }
      }
      if (sec.far) H2.far.forEach(function (n) { if (n[0] === bar % 8 && n[1] === st) keys(o, t, n[2], 0.22, 5); });
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.45);
      // the heartbeat: steady, racing, loud in hiding, running down at the end
      var hb = sec.heart;
      if (hb === 1 && (st === 0 || st === 8)) heart(o, t, 0.6);
      if (hb === 2 && st % 4 === 0) heart(o, t, 0.55);
      if (hb === 3 && (st === 0 || st === 8)) heart(o, t, 0.85);
      if (hb === 4 && ((bar === 56 && (st === 0 || st === 8)) || (bar === 57 && st === 2) || (bar === 58 && st === 8))) heart(o, t, 0.8 - (bar - 56) * 0.18);
      if (sec.bass === "walk" && st === 0) fz(o, t, H2.walk[bar % 8], 1, six * 15, true);
      if (sec.bass === "hunt" && H2.hunt[st] !== null) fz(o, t, 40 + H2.hunt[st], st % 8 === 0 ? 1 : 0.75, six * 1.5);
      if (sec.bass === "found" && H2.found[st] !== null) fz(o, t, 40 + H2.found[st], st % 4 === 2 ? 1 : 0.7, six * 0.9);
      kit(o, t, st, bar, sec.drums, { four: sec.id === "found", back: true, fill: sec.fill });
      if (sec.stab && (st === 0 || st === 7)) stb(o, t, cl, st ? 0.75 : 1, six * 1.2, st ? 0.6 : -0.6);
      if (sec.id === "found") chop(o, t, st, cl);
      if (sec.box) H2.box.forEach(function (n) { if (n[0] === (bar - 32) % 2 && n[1] === st) box(o, t, n[2], 0.9, n[3] * six * 1.6, 38); });
    }
  };

  /* ---------- 3 · the character study ---------- */
  var C3 = {
    ch: [{ r: 40, tri: [52, 55, 59] }, { r: 36, tri: [48, 52, 55] }, { r: 43, tri: [50, 55, 59] }, { r: 38, tri: [50, 54, 57] }],
    // the character's theme opens on the hook (B A G F# G E) and climbs, bar by bar, into G and D
    mel: [[0, 0, 71, 6], [0, 6, 69, 2], [0, 8, 67, 8], [1, 0, 66, 4], [1, 4, 67, 4], [1, 8, 64, 8],
          [2, 0, 72, 6], [2, 6, 71, 2], [2, 8, 67, 8], [3, 0, 64, 8], [3, 8, 67, 8],
          [4, 0, 74, 6], [4, 6, 72, 2], [4, 8, 71, 8], [5, 0, 67, 4], [5, 4, 71, 4], [5, 8, 74, 8],
          [6, 0, 78, 6], [6, 6, 76, 2], [6, 8, 74, 8], [7, 0, 74, 8], [7, 8, 69, 8]],
    // the left hand walks up through the D chord at the end of a phrase, so each section is stepped into
    walkup: [[8, 50], [10, 54], [12, 57], [14, 62]],
    arp: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2],
    roll: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
    sec: function (bar) {
      // the opening grows in: the strings fade up under the piano, then the pulse, then the bass, then the kick
      if (bar < 8) return { id: "3 AM", piano: 1, pad: bar >= 4 ? 0.035 : 0, walk: bar === 7, mix: { pad: bar >= 5 ? 0.25 + (bar - 5) * 0.25 : 0.0001, arp: 0.0001 } };
      if (bar < 16) return { id: "memory", piano: 1, pad: 0.035, arp: 0.45 + (bar - 8) * 0.05, arpCut: 520 + (bar - 8) * 30, sub: 0.06, walk: bar === 15, mix: { arp: 0.3 + (bar - 8) * 0.09 } };
      if (bar < 32) return { id: "the climb", piano: 0.85, pad: 0.04, arp: 0.85, arpCut: 760 + (bar - 16) * 150, drums: bar >= 20 ? (bar >= 24 ? 2 : 1) : 0, kv: Math.min(1, 0.3 + (bar - 20) * 0.09), bass: bar >= 22 ? 1 : 0, roll: bar >= 28, riser: bar === 28, sub: 0.09, drop: bar === 31, mix: { fuzz: Math.min(1, 0.4 + (bar - 22) * 0.1) } };
      if (bar < 48) return { id: "release", piano: 0.55, pad: 0.05, arp: 1, arpCut: 3400, drums: 3, bass: 1, lead: 1, sub: 0.12, crash: bar === 32 || bar === 40 };
      if (bar < 56) return { id: "the truth", slow: 1, pad: 0.04, arp: 0.5, arpCut: 900, sub: 0.05, riser: bar === 52, roll: bar >= 54, drop: bar === 55 };
      if (bar < 76) return { id: "becoming", piano: 0.55, pad: 0.055, arp: 1, arpCut: 3800, drums: 3, bass: 2, lead: 2, sub: 0.13, crash: bar === 56 || bar === 64 || bar === 72 };
      return { id: "after", piano: 1, pad: 0.035, arp: 0.6, arpCut: 1400 - (bar - 76) * 200, sub: 0.05 };
    }
  };
  var SONG_CHAR = {
    mood: "the character study · emotional trance, a piano that learns to fly", bpm: 132, bars: 80, v2: true, duckDepth: 0.3, sec: C3.sec,
    trim: { "phthalo": 6.3, "knight": -3.0, "golden": 1.5 },
    lift_golden: { "3 AM": 9.0, "memory": 4.5, "the climb": -0.6, "release": -0.5, "the truth": 5.2, "becoming": 0.0, "after": 5.2 },
    lift_knight: { "3 AM": 12.0, "memory": 9.7, "the climb": -0.7, "release": -0.7, "the truth": 9.0, "becoming": 0.0, "after": 10.0 },
    lift_phthalo: { "3 AM": 5.1, "memory": 0.3, "the climb": -0.4, "release": -0.1, "the truth": 1.4, "becoming": 0.0, "after": 1.6 },
    ramp: 2, tone: { sub: -2, punch: 1.5, pres: 1.5 },
    init: function (o, t) { o.sub = makeSub(o, t); o.la = makeLead2(o, t, o.P.lead, -0.5); o.lb = makeLead2(o, t, o.P.lead2, 0.5); },
    play: function (o, t, st, bar) {
      var sec = C3.sec(bar), c = C3.ch[Math.floor(bar / 2) % 4], six = o.six, mb = bar % 8;
      if (st === 0) {
        mixTo(o, t, sec.mix, six * 16);   // a bar-long glide: the opening's parts fade in rather than switch on
        if (sec.arp) sweep(o, "arpF", sec.arpCut, t, 1.2);
        sweep(o, "padF", sec.drums ? 2800 : 1700, t, 1.6);
        sweep(o, "fuzzF", sec.bass === 2 ? 1500 : 1100, t, 0.5);
        o.sub.set(t, c.r - 12, sec.sub || 0.0001);
        if (sec.pad && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[1] + 12]), six * 32, sec.pad, { a: sec.drums ? six * 2 : six * 10, r: 1.8 });
        if (sec.riser) riser(o, t, six * 64, 0.07);
        if (sec.crash) crash(o, t, 1);
        if (sec.piano) keys(o, t, c.r, 0.55 * sec.piano, 3.2);
      }
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.4);
      if (sec.piano && st === 8 && !sec.walk) keys(o, t, c.tri[1], 0.3 * sec.piano, 2.2);
      if (sec.walk) C3.walkup.forEach(function (n) { if (n[0] === st) keys(o, t, n[1], 0.32 + (st - 8) * 0.02, 1.6); });
      // the melody: on the piano, then on the leads an octave up; in "the truth" at half speed, alone
      C3.mel.forEach(function (n) {
        if (sec.piano && n[0] === mb && n[1] === st) keys(o, t, n[2], 0.75 * sec.piano, n[3] * six * 1.4);
        if (sec.lead && n[0] === mb && n[1] === st) { o.la.play(t, n[2] + 12, n[3] * six, 0.075); if (sec.lead === 2) o.lb.play(t, n[2], n[3] * six, 0.06); }
        if (sec.slow && n[0] === Math.floor((bar - 48) / 2) && n[1] * 2 === ((bar - 48) % 2) * 16 + st) keys(o, t, n[2] - 12, 0.85, n[3] * six * 2.4);
      });
      if (sec.arp) parp(o, t, [c.tri[0] + 12, c.tri[1] + 12, c.tri[2] + 12, c.tri[0] + 24][C3.arp[st]], (st % 4 === 0 ? 1 : 0.7) * sec.arp, six * 0.75, st % 2 ? 0.5 : -0.5);
      kit(o, t, st, bar, sec.drums, { four: true, back: sec.drums >= 2, v: sec.id === "the climb" ? sec.kv : 1 });
      if (sec.bass === 1 && st % 4 === 2) fz(o, t, c.r, 0.9, six * 1.6);
      if (sec.bass === 2 && C3.roll.indexOf(st) >= 0) fz(o, t, c.r + (st % 4 === 3 ? 12 : 0), st % 4 === 2 ? 0.9 : 0.65, six * 0.8);
      if (sec.lead) chop(o, t, st, c.tri);
      if (sec.roll) { var lb = bar === 31 || bar === 55 ? 1 : bar === 30 || bar === 54 ? 2 : 4; if (st % lb === 0) rollHit(o, t, 0.25 + (st / 16) * 0.5); }
    }
  };

  /* ---------- 4 · the battle of wits ---------- */
  var B4 = {
    ch: [{ r: 40, tri: [52, 55, 59] }, { r: 36, tri: [48, 52, 55] }, { r: 33, tri: [45, 48, 52] }, { r: 35, tri: [47, 51, 54] }],
    // the hook, split between two people: A asks (B A G), B answers (F# G E), then they push each other
    duel: [
      ["a", [[0, 71, 3], [3, 69, 3], [6, 67, 6]]],
      ["b", [[0, 66, 3], [3, 67, 3], [6, 64, 6]]],
      ["a", [[0, 74, 2], [2, 72, 2], [4, 71, 4], [8, 67, 4]]],
      ["b", [[0, 69, 2], [2, 71, 2], [4, 72, 4], [8, 76, 4]]],
      ["a", [[0, 76, 3], [3, 74, 3], [6, 71, 2], [8, 69, 2], [10, 67, 6]]],
      ["b", [[0, 78, 3], [3, 76, 3], [6, 75, 2], [8, 71, 6]]],
      ["a", [[0, 71, 2], [2, 74, 2], [4, 76, 2], [6, 79, 6]]],
      ["b", [[0, 78, 2], [2, 76, 2], [4, 75, 2], [6, 76, 10]]]
    ],
    typeA: [0, 3, 5, 6, 9, 12, 13], typeB: [1, 2, 7, 8, 10, 14, 15],
    sec: function (bar) {
      if (bar < 8) return { id: "login", type: 1, pad: 0.03, sub: 0.08 };
      if (bar < 16) return { id: "handshake", type: 1, pad: 0.03, hats: 1, drums: "soft", sub: 0.12, duel: 2, riser: bar === 12, drop: bar === 15 };
      if (bar < 48) return { id: "exploit", drums: "full", reese: 1, duel: 2, hats: 2, stab: bar % 8 === 0, sub: 0.18, crash: bar === 16 || bar === 32 };
      if (bar < 56) return { id: "stalemate", drums: "half", pad: 0.04, unison: 1, reese: 0.6, sub: 0.1, glitch: bar % 2 === 1, riser: bar === 52, drop: bar === 55 };
      if (bar < 88) return { id: "root", drums: "full", ride: 1, reese: 1, duel: 1, hats: 2, stab: bar % 4 === 0, sub: 0.2, crash: bar === 56 || bar === 72 };
      return { id: "logout", type: 1, pad: 0.03, drums: bar < 92 ? "half" : null, sub: 0.07, reese: bar < 92 ? 0.5 : 0 };
    }
  };
  var SONG_DUEL = {
    mood: "the battle of wits · drum & bass, two hackers trading the theme", bpm: 172, bars: 96, v2: true, duckDepth: 0.36, sec: B4.sec,
    trim: { "phthalo": -1.3, "knight": -2.4, "golden": -1.3 },
    lift_golden: { "login": 4.4, "handshake": 3.6, "exploit": 0.0, "stalemate": -2.7, "root": -0.1, "logout": 2.0 },
    lift_knight: { "login": 8.8, "handshake": 7.4, "exploit": 0.0, "stalemate": -3.1, "root": 0.0, "logout": 1.4 },
    lift_phthalo: { "login": 6.6, "handshake": 5.1, "exploit": 0.0, "stalemate": -2.7, "root": 0.0, "logout": 2.1 },
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.la = makeLead2(o, t, o.P.lead, -0.7); o.lb = makeLead2(o, t, o.P.lead2, 0.7); },
    play: function (o, t, st, bar) {
      var sec = B4.sec(bar), c = B4.ch[Math.floor(bar / 2) % 4], six = o.six;
      if (st === 0) {
        o.sub.set(t, c.r - 12, sec.sub);
        o.padF.frequency.setTargetAtTime(sec.id === "stalemate" ? 2200 : 1300, t, 1);
        if (sec.pad && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, sec.pad, { a: six * 8, r: 1.4 });
        if (sec.reese && bar % 2 === 0) { o.reese.rate(t, sec.id === "root" ? 0.55 : 0.35); o.reese.play(t, c.r, six * 30, 0.19 * sec.reese); }
        if (sec.riser) riser(o, t, six * 64, 0.07);
        if (sec.crash) crash(o, t, 0.9);
        if (sec.stab) stb(o, t, c.tri, 1, six * 2, bar % 8 < 4 ? -0.5 : 0.5);
      }
      if (sec.reese === 1 && bar % 4 === 3 && st === 12) o.reese.play(t, c.r + 12, six * 4, 0.17);
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.45);
      // the duel: a phrase every two bars, then every bar; in the stalemate they play together
      // (at half speed a phrase spans two bars, so its positions double along with its lengths)
      var local = (bar % 2) * 16 + st;
      if (sec.duel) {
        var slow = sec.duel === 2, ph = B4.duel[(slow ? Math.floor((bar - 8) / 2) : bar) % 8], who = ph[0] === "a" ? o.la : o.lb;
        ph[1].forEach(function (n) { if ((slow ? n[0] * 2 : n[0]) === (slow ? local : st)) who.play(t, n[1], n[2] * six * (slow ? 2 : 1), sec.id === "handshake" ? 0.05 : 0.08); });   // tentative at first
      }
      if (sec.unison) {
        var pair = (bar >> 1) % 4 * 2, pa = B4.duel[pair], pb = B4.duel[pair + 1];
        pa[1].forEach(function (n) { if (n[0] * 2 === local) o.la.play(t, n[1], n[2] * six * 2, 0.065); });
        pb[1].forEach(function (n) { if (n[0] * 2 === local) o.lb.play(t, n[1] - 12, n[2] * six * 2, 0.06); });
      }
      if (sec.type) { if ((bar % 2 === 0 || sec.id !== "login") && B4.typeA.indexOf(st) >= 0) blip(o, t, 0.5, -0.75, 3600); if ((bar % 2 === 1 || sec.id !== "login") && B4.typeB.indexOf(st) >= 0) blip(o, t, 0.45, 0.75, 4300); }
      if (sec.glitch && st >= 12) { stb(o, t, c.tri, 0.45, six * 0.25, st % 2 ? 0.7 : -0.7); stb(o, t + six * 0.5, c.tri, 0.35, six * 0.25, st % 2 ? -0.7 : 0.7); }
      var d = sec.drums;
      if (d === "full") {
        if (st === 0 || st === 10) kick(o, t, 1);
        if (st === 4 || st === 12) snare(o, t, 1);
        if (st === 7 || st === 15) snare(o, t, 0.28);
      } else if (d === "half") {
        if (st === 0) kick(o, t, 0.9);
        if (st === 8) snare(o, t, 0.85);
      } else if (d === "soft") {   // around the drum bus: its drive (3.4 in Dark Knight) squashes a soft kick back up to full
        if (st === 0 || st === 10) softKick(o, t, 0.8);
      }
      if (sec.hats === 1 && st % 4 === 2) hh(o, t, 0.45, false, 0.3);
      if (sec.hats === 2) hh(o, t, st % 2 ? 0.3 : st % 4 === 2 ? 0.85 : 0.55, false, st % 4 < 2 ? -0.35 : 0.35);
      if (sec.ride && st % 4 === 2) ride(o, t, 0.9);
      // the palettes' accents on top (Phthalo plays the duel exactly as it was written)
      if (o.P.style === "kpop" && d === "full") {
        if (bar % 4 === 3 && st >= 12) hh(o, t + six / 2, 0.35 + (st - 12) * 0.12, false, 0.15);
        if (st === 4 || st === 12) snap(o, t, 0.7);
        chop(o, t, st, c.tri);
      }
      if (o.P.style === "industrial" && (d === "full" || d === "half")) {
        if (st === 2 || st === 14) rumble(o, t, 0.8);
        if (st === 7 || st === 15) clank(o, t, 0.35);
      }
    }
  };

  /* ---------- 5 · the epilogue ----------
   * Closer to the original epilogue: its chords (EC.chords, G D/F# Em C Am G/B C D) and its melody (EC.mel)
   * are the heart of it, played on the new instruments. Around them, sadness with hope inside it: the
   * grief section sighs downward over Am, Em, C and C minor (the minor iv, the saddest chord in the song),
   * but every second bar the line turns back up; and the end is the hook resolved to G, not to E. */
  var E5 = {
    sorrow: [[40, 0, 40], [36, 1, 36], [33, 0, 45], [35, 1, 47]],                                           // Em C Am B  ([root, major?, bass])
    grief: [[45, 0, 45], [40, 0, 40], [48, 1, 36], [48, 0, 36], [43, 1, 43], [47, 0, 47], [45, 0, 45], [47, 1, 47]],   // Am Em C Cm G Bm Am B
    light: [[43, 1, 43], [48, 0, 36], [43, 1, 43], [50, 1, 38], [43, 1, 43], [43, 1, 43]],                    // G Cm G D G G
    hook: [[0, 0, 71, 8], [0, 8, 69, 8], [1, 0, 67, 12], [1, 12, 66, 4], [2, 0, 67, 8], [2, 8, 64, 8], [3, 0, 64, 16]],   // the hook, slowed to a breath
    // falling sighs, and in the second half of each pair the line climbs again - the hope inside the sadness
    sigh: [[0, 0, 72, 8], [0, 8, 71, 8], [1, 0, 67, 8], [1, 8, 71, 4], [1, 12, 74, 4], [2, 0, 76, 8], [2, 8, 74, 8], [3, 0, 75, 8], [3, 8, 74, 8],
           [4, 0, 74, 6], [4, 6, 76, 2], [4, 8, 79, 8], [5, 0, 78, 8], [5, 8, 74, 8], [6, 0, 72, 8], [6, 8, 76, 8], [7, 0, 78, 8], [7, 8, 75, 8]],
    // the last bars: the hook again, but it ends on G instead of E, and then a line that rises
    home: [[0, 0, 71, 8], [0, 8, 69, 8], [1, 0, 67, 16], [3, 0, 74, 4], [3, 4, 79, 4], [3, 8, 83, 8]],
    arp: [0, 1, 2, 3, 2, 1, 0, 2],   // Ring Zero's pulse at half speed, remembered
    sec: function (bar) {
      if (bar < 8) return { id: "ashes", ch: "sorrow", hook: 0.38, bin: 0.02, bed: 0.022, lh: 0.22, padCut: 900 };
      if (bar < 16) return { id: "what remains", ch: "ec", arpeggio: 0.3, cello: 0.045, str: 0.03, sub: 0.04, bin: 0.02, padCut: 1200 };
      if (bar < 24) return { id: "remember", ch: "ec", mel: 0, mv: 0.05, arpeggio: 0.25, cello: 0.05, str: 0.035, pulse: 0.45, pulseCut: 750, sub: 0.06, padCut: 1600 };
      if (bar < 32) return { id: "grief", ch: "grief", sigh: 1, arpeggio: 0.25, cello: 0.05, str: 0.04, pulse: 0.35, pulseCut: 650, sub: 0.06, padCut: 1400 };
      if (bar < 42) return { id: "the weight lifts", ch: "ec", mel: 12, mv: 0.045, arpeggio: 0.3, cello: 0.055, str: 0.05, brass: bar === 32 || bar === 36 || bar === 40, pulse: 0.6, pulseCut: 1500, sub: 0.08, padCut: 2400 };
      return { id: "last light", ch: "light", home: 1, str: 0.04, cello: 0.045, pulse: bar < 44 ? 0.3 : 0, pulseCut: 900, sub: 0.05, padCut: 1600, last: bar === 47 };
    }
  };
  var SONG_EPI = {
    mood: "the epilogue · sadness with hope in it, 432 Hz, strings and a last look back", bpm: 60, bars: 48, ref: 432, v2: true, duckDepth: 0.6, sec: E5.sec,
    trim: { "phthalo": 10.7, "knight": 11.4, "golden": 9.2 },
    lift_golden: { "ashes": 0.6, "what remains": -3.1, "remember": -4.1, "grief": -3.0, "the weight lifts": 0.0, "last light": -1.4 },
    lift_knight: { "ashes": -2.2, "what remains": -4.4, "remember": -5.5, "grief": -3.6, "the weight lifts": 0.0, "last light": -2.7 },
    lift_phthalo: { "ashes": -0.8, "what remains": -4.1, "remember": -4.8, "grief": -3.3, "the weight lifts": 0.0, "last light": -2.1 },
    ramp: 1, tone: { sub: -1.5, punch: 1, pres: 3 },
    init: function (o, t) { o.sub = makeSub(o, t); o.bin = makeBinaural(o, t, 108, 2.5, 0.02); },
    play: function (o, t, st, bar) {
      var sec = E5.sec(bar), six = o.six, cc;
      if (sec.ch === "ec") { var e = EC.chords[bar % 8]; cc = [e[0] - 12, e[1], e[2]]; }   // EC.chords sit an octave up: [chord root, major?, bass]
      else if (sec.ch === "grief") cc = E5.grief[(bar - 24) % 8];
      else if (sec.ch === "light") cc = E5.light[Math.min(5, bar - 42)];
      else cc = E5.sorrow[bar % 4];
      var r = cc[0], tri = triad(r + 12, cc[1]), bass = cc[2];
      if (st === 0) {
        o.bin.level(t, sec.bin || 0.0001);
        o.sub.set(t, bass - 12, sec.sub || 0.0001);
        sweep(o, "padF", sec.padCut, t, 2);
        if (sec.pulse) sweep(o, "arpF", sec.pulseCut, t, 1.5);
        if (sec.str) sm(o, t, tri.concat([r + 24]), six * 16 * (sec.last ? 4 : 1), sec.str, { a: 1.6, r: sec.last ? 6 : 2.2 });
        if (sec.bed && bar % 2 === 0) sm(o, t, tri, six * 32, sec.bed, { a: bar ? six * 8 : six * 3, r: 2.5, w: 0.4, wave: "triangle" });
        if (sec.cello) sm(o, t, [bass], six * 16 * (sec.last ? 4 : 1), sec.cello, { a: 1.2, r: sec.last ? 5 : 1.5, w: 0 });
        if (sec.brass) br2(o, t, [r, tri[1], r + 7], six * 32, 0.05);
        keys(o, t, bass + 12, sec.lh || 0.4, 3.6);
      }
      // the original epilogue's piano: root, fifth and third of each chord across the bar
      if (sec.arpeggio && (st === 6 || st === 10)) keys(o, t, st === 6 ? r + 19 : tri[1] + 12, sec.arpeggio, 3);
      if (sec.hook) E5.hook.forEach(function (n) { if (n[0] === bar % 4 && n[1] === st) keys(o, t, n[2], sec.hook, n[3] * six * 1.3); });
      if (sec.mel != null) melodyAt(EC.mel, bar % 8, st).forEach(function (n) { sm(o, t, [n[2] + sec.mel], n[3] * six, sec.mv, { a: 0.5, r: 1.4, w: 0.2 }); keys(o, t, n[2] + sec.mel + 12, 0.18, n[3] * six); });
      if (sec.sigh) E5.sigh.forEach(function (n) { if (n[0] === (bar - 24) % 8 && n[1] === st) { sm(o, t, [n[2] - 12], n[3] * six, 0.055, { a: 0.25, r: 1.4, w: 0 }); keys(o, t, n[2], 0.42, n[3] * six * 1.2); } });
      if (sec.home) E5.home.forEach(function (n) { if (n[0] === bar - 42 && n[1] === st) keys(o, t, n[2], 0.55, n[3] * six * 1.5); });
      if (sec.pulse && st % 2 === 0) parp(o, t, [tri[0], tri[1], tri[2], tri[0] + 12][E5.arp[st / 2]], sec.pulse, six * 1.6, st % 4 ? 0.5 : -0.5);
    }
  };

  var SONGS = [SONG_RING, SONG_DARK, SONG_CHAR, SONG_DUEL, SONG_EPI];

  /* ======================= outros =======================
   * After its last bar every song plays a short outro (song.outroBars) that winds it down, resolves home to
   * E minor (G major for the epilogue) and, bar by bar, eases its tempo and tuning (440 ↔ 432) into whatever
   * plays next: the next song, itself when looping, or the theme after the director's cut. The final outro bar teases the next
   * song's opening, so the hand-off lands on the downbeat instead of a crossfade. */
  SONG_RING.outroBars = 4;
  SONG_RING.outro = function (o, t, st, k, N) {   // drums peel away, the fuzz closes, the hook rings out over E
    var six = o.six, fade = 1 - k / N, n = T1.riff[st];
    if (st === 0) {
      o.fuzzF.frequency.setTargetAtTime(Math.max(300, 1200 - k * 260), t, 0.6);
      o.arpF.frequency.setTargetAtTime(Math.max(420, 1800 - k * 380), t, 0.6);
      o.sub.set(t, 28, 0.04 + 0.14 * fade);
      if (k === 0) { kick(o, t, 1); crash(o, t, 0.8); sm(o, t, [52, 55, 59, 64], six * 56, 0.05, { a: six * 2, r: 2.5 }); o.lead.play(t, 64, six * 24, 0.08); }
    }
    if (k < N - 1 && n !== null) fz(o, t, 40 + n, (T1.acc[st] || 0.7) * fade, six * 0.85);
    if (k < 2 && st % 4 === 0) kick(o, t, 1 - k * 0.35);
    if (k < 3 && st % 4 === 2) hh(o, t, 0.8 * fade, false, 0.3);
    if (k < 3) parp(o, t, [64, 67, 71, 76][T1.arp[st]], (st % 4 === 0 ? 1 : 0.7) * fade, six * 0.8, st % 2 ? 0.45 : -0.45);
    if (k === 1 && st >= 12) tom(o, t, [190, 155, 125, 98][st - 12], 0.8);
  };
  SONG_DARK.outroBars = 4;
  SONG_DARK.outro = function (o, t, st, k, N) {   // a scream far off, then a heartbeat that slows to almost nothing
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.14 * fade + 0.02);
      tremTo(o, t, 0.3 * fade);
      if (k === 0) { scr(o, t, 76, six * 14, 0.018, -0.6); sm(o, t, [40, 47, 52], six * 48, 0.04, { a: six * 4, r: 3, w: 0.3 }); }
      if (k === 1) keys(o, t, 40, 0.5, 5);
    }
    if (k === 0 && (st === 4 || st === 12)) heart(o, t, 0.55);
    if (k === 1 && st === 4) heart(o, t, 0.45);
    if (k === 2 && st === 0) heart(o, t, 0.35);
  };
  SONG_CHAR.outroBars = 2;
  SONG_CHAR.outro = function (o, t, st, k) {   // the piano lets go, the strings hold the last breath
    var six = o.six;
    if (st === 0 && k === 0) { o.sub.set(t, 28, 0.06); o.arpF.frequency.setTargetAtTime(520, t, 0.8); sm(o, t, [52, 55, 59, 64], six * 28, 0.05, { a: 1, r: 3 }); }
    if (k === 0 && st % 2 === 0) keys(o, t, [40, 47, 52, 55, 59, 64, 67, 71][st / 2], 0.75 - st * 0.025, 2.6);
    if (k === 0 && st % 2 === 1) parp(o, t, [64, 67, 71, 76][(st >> 1) % 4], 0.4, six * 0.8, st % 4 === 1 ? 0.45 : -0.45);
    if (k === 1 && st === 0) keys(o, t, 76, 0.5, 5);
  };
  SONG_DUEL.outroBars = 4;
  SONG_DUEL.outro = function (o, t, st, k, N) {   // after the logout: one soft chord and the two hackers' last words
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.05 * fade + 0.02);   // stays at the logout's level
      if (k === 0) stb(o, t, [52, 55, 59], 0.25, six * 2, 0);
      if (k === 1) { sm(o, t, [52, 55, 59, 64], six * 40, 0.035, { a: six * 4, r: 2 }); o.la.play(t, 76, six * 6, 0.07); }
      if (k === 2) { o.la.play(t, 67, six * 14, 0.05); o.lb.play(t, 64, six * 14, 0.045); }
    }
    if (k === 1 && st === 8) o.lb.play(t, 71, six * 8, 0.065);
    if (k < 2 && st % 4 === 2) hh(o, t, 0.22 * fade, false, st % 8 === 2 ? -0.4 : 0.4);
    if (k === 3 && st % 3 === 0) blip(o, t, 0.4 - st * 0.02, st % 2 ? 0.7 : -0.7, 3600);
  };
  SONG_EPI.outroBars = 2;
  SONG_EPI.outro = function (o, t, st, k) {   // a last glint of light over a held G chord
    if (st === 0 && k === 0) { o.bin.level(t, 0.0001); o.sub.set(t, 31, 0.05); sm(o, t, [55, 59, 62, 67], o.six * 30, 0.04, { a: 0.6, r: 3 }); }
    if (k === 0 && (st === 0 || st === 4 || st === 8)) keys(o, t, [79, 83, 86][st / 4], 0.3, 3.5);
  };
  // the director's cut ends the way the original epilogue did (its outro, kept as it was)
  function lastGlint(o, t, st, k) {
    if (st === 0 && k === 0) { o.bin.level(t, 0.0001); o.sub.set(t, 31, 0.05); }
    if (k === 0 && (st === 0 || st === 4 || st === 8)) piano(o, t, [79, 83, 86][st / 4], 0.28, 3.5);
  }
  // the next song's opening, faded in under the outro's last bar (f runs 0 → 1 across it)
  function foreshadow(o, t, st, si, f) {
    var six = o.six;
    if (si === 0) {   // Ring Zero's pulse, its filter still shut, and a stray glitch
      parp(o, t, [64, 67, 71, 76][T1.arp[st]], 0.35 + 0.5 * f, six * 0.8, st % 2 ? 0.45 : -0.45);
      if (st >= 8 && st % 4 === 2) blip(o, t, 0.4, st % 8 === 2 ? -0.5 : 0.5, 3000);
    } else if (si === 1) {   // a heartbeat and a dissonant shiver
      if (st === 0 || st === 8) heart(o, t, 0.5 + 0.3 * f);
      if (st === 0) sm(o, t, [64, 65, 71], six * 16, 0.03, { a: six * 10, r: 0.6 });
    } else if (si === 2) {   // the character's first notes, alone on the piano
      if (st === 0) keys(o, t, 71, 0.5, 3); else if (st === 6) keys(o, t, 69, 0.4, 2); else if (st === 8) keys(o, t, 67, 0.45, 3);
    } else if (si === 3) {   // two people typing, a cold pad
      if (B4.typeA.indexOf(st) >= 0) blip(o, t, 0.2 + 0.35 * f, -0.75, 3600);
      if (st >= 8 && B4.typeB.indexOf(st) >= 0) blip(o, t, 0.2 + 0.3 * f, 0.75, 4300);
      if (st === 0) sm(o, t, [52, 55, 59, 64], six * 16, 0.03, { a: six * 6, r: 0.8 });
    } else if (si === 4) {   // the epilogue's low piano, a warm wash under it
      if (st === 0) { keys(o, t, 40, 0.4, 4); sm(o, t, [52, 59, 64], six * 18, 0.03, { a: six * 8, r: 1, wave: "triangle" }); }
      if (st === 8) keys(o, t, 47, 0.3, 3);
    } else if (si === 6) {   // a kick through the wall of the next room, an offbeat hat
      if (st % 4 === 0) kick(o, t, 0.35 + 0.5 * f);
      if (st >= 8 && st % 4 === 2) hat(o, t, 0.5, true);
    } else if (si === 7) {   // a trance kick fading in under a bright arpeggio
      if (st % 4 === 0) kick(o, t, 0.3 + 0.5 * f);
      if (st >= 4) arpNote(o, t, [64, 67, 71, 76][GT.arp[st]], 0.4 + 0.3 * f);
    } else if (si === 8) {   // one guitar, fingerpicking the opening chord
      if (st % 2 === 0) { var pi = ST.pick[st / 2]; pluck(o, t, pi === "b" ? 52 : [59, 64, 67][pi], 0.5 + 0.3 * f, 2.2); }
    } else if (si === 9) {   // engines on the grid, the first red light
      if (st === 0) vroom(o, t, six * 6, 55, 190, 0.6 + 0.4 * f);
      if (st === 8) lightOn(o, t, 0.9);
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
    if (k === N - 2 && st === 0 && [0, 1, 3, 6, 7, 9].indexOf(g.si) >= 0) riser(o, t, o.six * 32, 0.1);   // lift into something fast
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
    outro: lastGlint
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
  function softKick(o, t, v) {   // a small, round kick: no click, no drive, only a gentle duck
    var s = osc("sine", 130, t, t + 0.3), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(o.P.kickLow * 1.15, t + 0.07);
    env(g, t, 0.002, 0.22, 0.5 * v); s.connect(g); g.connect(o.bus);
    duckAt(o, t, 0.72);
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
    var mute = !!opt.mute, tone = (opt.tone || 1) * (opt.dark ? 0.6 : 1), dark = opt.dark ? 0.62 : 1, notes = mute ? [root, root + 7] : [root, root + 7, root + 12], dt = (opt.pan || 0) > 0 ? 9 : 5;
    var sum = gain(0.3), hp = filt("highpass", 85), sh = shaper(Math.min(28, 9 * o.P.drive * tone)), cab = filt("lowpass", (mute ? 1300 : 3400) * (opt.tone < 1 ? 0.6 : 1) * dark, 0.8), pk = filt("peaking", 820, 0.9);
    var g = gain(0), p = panner(opt.pan || 0), stop = t + len + 0.35;
    pk.gain.value = 5;
    notes.forEach(function (m) { [-dt, dt].forEach(function (d) { osc("sawtooth", F(o, m), t, stop, d).connect(sum); }); });
    sum.connect(hp); hp.connect(sh); sh.connect(cab); cab.connect(pk); pk.connect(g);
    if (opt.dark) v *= 0.85;
    if (mute) env(g, t, 0.002, Math.min(len, 0.14), 0.1 * v); else swell(g, t, opt.dark ? 0.012 : 0.004, len * 0.9, opt.dark ? 0.35 : 0.2, 0.075 * v);
    g.connect(p); p.connect(o.duck); send(o, p, mute ? 0.06 : 0.22);
  }
  function makeGuitar(o, t, panV, dark) {   // lead guitar: overdriven saw + square through a cabinet, bends and vibrato; dark = warmer, softer
    var a = osc("sawtooth", 220, t, t + 36000, -5), b = osc("square", 220, t, t + 36000, 5), mix = gain(0.5), hp = filt("highpass", 160), sh = shaper(dark ? 9 : 18);
    var cab = filt("lowpass", dark ? 2400 : 3800, 0.9), pk = filt("peaking", dark ? 1000 : 1400, 0.8), g = gain(0.0001), p = panner(panV || 0);
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
  function beep(o, t, m, len, v) { var s = osc("sine", F(o, m), t, t + len + 0.1), g = gain(0); swell(g, t, 0.005, len, 0.05, 0.07 * v); s.connect(g); g.connect(o.bus); send(o, g, 0.3); }
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

  function supersaw(o, t, notes, len, vol, opt) {   // the trance lead: six detuned saws per note, bright, into the echo
    opt = opt || {};
    var r = opt.r != null ? opt.r : 0.25, lp = filt("lowpass", opt.cut || 5200, 0.6), hp = filt("highpass", 180), g = gain(0), stop = t + len + r + 0.05;
    swell(g, t, opt.a || 0.01, len, r, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) { [-24, -12, -5, 5, 12, 24].forEach(function (d) { osc("sawtooth", F(o, m), t, stop, d).connect(lp); }); });
    lp.connect(hp); hp.connect(g); g.connect(o.duck); send(o, g, 0.45, opt.delay != null ? opt.delay : 0.25);
  }
  var GATE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0];
  function gatePad(o, t, notes, vol, six) {   // one bar of a trance-gated chord
    var lp = filt("lowpass", 3000, 0.7), g = gain(0.0001), stop = t + six * 16 + 0.1, v = vol / Math.sqrt(notes.length);
    for (var i = 0; i < 16; i++) { var tt = t + i * six; if (GATE[i]) { g.gain.setTargetAtTime(v, tt, 0.004); g.gain.setTargetAtTime(0.0001, tt + six * 0.6, 0.012); } }
    notes.forEach(function (m) { [-10, 0, 10].forEach(function (d) { osc("sawtooth", F(o, m), t, stop, d).connect(lp); }); });
    lp.connect(g); g.connect(o.duck); send(o, g, 0.3, 0.2);
  }
  function pluck(o, t, m, v, len) {   // a fingerpicked clean guitar string
    var f = F(o, m), g = gain(0), lp = filt("lowpass", 3200, 1);
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    [["sawtooth", 1, 0.35, 0], ["triangle", 1, 1, 4], ["sine", 2, 0.25, -3]].forEach(function (p) { var s = osc(p[0], f * p[1], t, t + len + 0.1, p[3]), sg = gain(p[2]); s.connect(sg); sg.connect(lp); });
    env(g, t, 0.002, len, 0.11 * v); lp.connect(g); g.connect(o.duck); send(o, g, 0.4, 0.12);
  }
  function mapBpm(T, pos) {   // a tempo map: straight lines between [bar, bpm] points
    var i = T.length - 1; while (i > 0 && T[i][0] > pos) i--;
    var a = T[i], b = T[i + 1];
    return !b || b[0] <= a[0] ? a[1] : a[1] + (b[1] - a[1]) * (pos - a[0]) / (b[0] - a[0]);
  }
  // a V8: a sawtooth at the firing rate, a sub an octave down, and the uneven "burble" of a cross-plane crank
  function v8Chain(o, t, stop, f, panV) {
    var a = osc("sawtooth", f, t, stop), b = osc("square", f / 2, t, stop, 7), am = osc("sine", f / 2, t, stop);
    var body = gain(0.6), amg = gain(0.45), sh = shaper(4), lp = filt("lowpass", 300 + f * 7, 1.4), g = gain(0.0001), p = panner(panV || 0);
    am.connect(amg); amg.connect(body.gain); a.connect(body); b.connect(body); body.connect(sh); sh.connect(lp); lp.connect(g); g.connect(p); p.connect(o.bus); send(o, p, 0.2);
    return { oscs: [a, b, am], lp: lp, g: g };
  }
  function makeV8(o, t) {   // one engine that runs for the whole track: idle, blips, launch, gear changes, the limiter
    var c = v8Chain(o, t, t + 36000, 52, -0.15);
    c.oscs.forEach(function (s) { o.nodes.push(s); });
    function to(tt, f, tc) {
      c.oscs[0].frequency.setTargetAtTime(f, tt, tc); c.oscs[1].frequency.setTargetAtTime(f / 2, tt, tc); c.oscs[2].frequency.setTargetAtTime(f / 2, tt, tc);
      c.lp.frequency.setTargetAtTime(Math.min(4200, 300 + f * 7), tt, tc);
    }
    return {
      rpm: to,
      level: function (tt, v, tc) { c.g.gain.setTargetAtTime(Math.max(0.0001, v), tt, tc || 0.05); },
      blip: function (tt, base, peak) { to(tt, peak, 0.04); to(tt + 0.2, base, 0.14); },   // vroom
      shift: function (tt, gears, gearLen, lo, hi) {   // flat out through the gears
        for (var i = 0; i < gears; i++) { var g0 = tt + i * gearLen; to(g0, hi * (1 + i * 0.06), gearLen * 0.4); to(g0 + gearLen * 0.97, lo * (1 + i * 0.12), 0.012); }
        to(tt + gears * gearLen, lo * 1.2, 0.6);
      },
      downshift: function (tt, n, step, base) { for (var i = 0; i < n; i++) { to(tt + i * step, base * (1.9 - i * 0.15), 0.015); to(tt + (i + 0.45) * step, base, 0.04); } },   // brap, brap, brap
      limiter: function (tt, f, n, step) { for (var i = 0; i < n; i++) { to(tt + i * step, f, 0.004); to(tt + (i + 0.5) * step, f * 0.82, 0.004); } }
    };
  }
  function vroom(o, t, len, lo, hi, v) {   // a one-off throttle blip, for tracks that don't carry an engine
    var c = v8Chain(o, t, t + len + 0.1, lo, 0.2);
    c.oscs.forEach(function (s, i) { var k = i ? 0.5 : 1; s.frequency.setTargetAtTime(hi * k, t, len * 0.12); s.frequency.setTargetAtTime(lo * k, t + len * 0.35, len * 0.2); });
    swell(c.g, t, 0.03, len * 0.6, len * 0.35, 0.07 * v);
  }
  function tyres(o, t, len, v, panV) {   // tyres screeching through a corner: a wobbling squeal over filtered noise
    var g = gain(0), p = panner(panV || 0), n = noiseL(t, len + 0.1), bp = filt("bandpass", 2000, 8), bp2 = filt("bandpass", 3200, 7), ng = gain(4);
    bp.frequency.setValueAtTime(2200, t); bp.frequency.linearRampToValueAtTime(1600, t + len);
    var s = osc("triangle", 1650, t, t + len + 0.1), sg = gain(0.25), wob = osc("sine", 9, t, t + len + 0.1), wg = gain(70);
    wob.connect(wg); wg.connect(s.frequency); s.frequency.linearRampToValueAtTime(1250, t + len);
    n.connect(bp); n.connect(bp2); bp.connect(ng); bp2.connect(ng); ng.connect(g); s.connect(sg); sg.connect(g);
    swell(g, t, 0.05, len * 0.7, len * 0.3, 0.05 * v);
    g.connect(p); p.connect(o.bus); send(o, p, 0.35);
  }
  function lightOn(o, t, v) {   // a red light clunks on
    beep(o, t, 81, 0.3, 0.9 * v);
    var n = noise(t, 0.04), bp = filt("bandpass", 1800, 3), g = gain(0); env(g, t, 0.001, 0.03, 0.22 * v); n.connect(bp); bp.connect(g); g.connect(o.bus);
  }
  function lightsOut(o, t, v) {   // ...and all five go out
    var s = osc("sine", 520, t, t + 0.7), g = gain(0); s.frequency.exponentialRampToValueAtTime(70, t + 0.55); env(g, t, 0.002, 0.55, 0.13 * v); s.connect(g); g.connect(o.bus); send(o, g, 0.5);
    var n = noise(t, 0.06), hp = filt("highpass", 2500), ng = gain(0); env(ng, t, 0.001, 0.05, 0.28 * v); n.connect(hp); hp.connect(ng); ng.connect(o.bus);
  }
  function rollAt(o, t, st, bar, from, len) {   // a snare roll that thickens across `len` bars
    var p = ((bar - from) * 16 + st) / (len * 16), ev = p < 0.5 ? 4 : p < 0.75 ? 2 : 1;
    if (st % ev === 0) snare(o, t, 0.2 + 0.7 * p);
  }

  // 8 · Gem Match · emotional trance (138 bpm, four minutes): supersaws, a piano breakdown, long bass drops
  var GT = {
    roots: [40, 36, 43, 38],   // Em C G D, two bars each
    tri: { 40: [52, 55, 59], 36: [48, 52, 55], 43: [50, 55, 59], 38: [50, 54, 57] },
    mel: [[0, 71, 3], [3, 74, 3], [6, 76, 2], [8, 79, 4], [12, 78, 2], [14, 76, 2], [16, 74, 6], [22, 71, 2], [24, 74, 4], [28, 76, 4],
      [32, 72, 3], [35, 76, 3], [38, 79, 2], [40, 84, 4], [44, 83, 2], [46, 79, 2], [48, 76, 8], [56, 74, 4], [60, 72, 4],
      [64, 71, 3], [67, 74, 3], [70, 79, 2], [72, 83, 4], [76, 81, 2], [78, 79, 2], [80, 78, 6], [86, 79, 2], [88, 81, 4], [92, 83, 4],
      [96, 81, 3], [99, 78, 3], [102, 74, 2], [104, 78, 4], [108, 81, 4], [112, 79, 6], [118, 78, 2], [120, 76, 8]],
    arp: [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1, 3, 2, 1, 2],
    sec: function (bar) {
      if (bar < 16) return { id: "first light", kick: 1, bass: 0.6, hats: bar >= 8 ? 2 : 1, arp: bar >= 4 ? 0.5 : 0, cut: 300 + bar * 40 };
      if (bar < 32) return { id: "the climb", kick: bar < 31, bass: bar < 31 ? 0.8 : 0, hats: 2, clap: bar >= 20 && bar < 28, arp: 0.8, gate: bar >= 24 ? 0.6 : 0, cut: 900 + (bar - 16) * 40, roll: bar >= 28 && bar < 31 ? 28 : 0, rl: 3, riser: bar === 28 ? 4 : 0, gap: bar === 31 };
      if (bar < 56) return { id: "drop", drop: 32, kick: 1, reese: 1, bass: 1, hats: 3, clap: 1, arp: 1, gate: 1, lead: 1, cut: 1600 };
      if (bar < 72) return { id: "breakdown", piano: 1, pad: 1, str: bar >= 60, lead: bar >= 64 ? 0.5 : 0, arp: bar >= 64 ? 0.6 : 0, roll: bar >= 64 && bar < 71 ? 64 : 0, rl: 7, riser: bar === 64 ? 8 : 0, gap: bar === 71, cut: 400 + Math.max(0, bar - 64) * 150 };
      if (bar < 104) return { id: "drop", drop: 72, kick: 1, reese: 1, bass: 1, hats: 3, clap: 1, arp: 1, gate: 1, lead: 1, oct: 1, str: 1, ride: 1, cut: 1800 };
      if (bar < 112) return { id: "breathe", pad: 1, piano: 0.8, arp: 0.7, hats: 1, roll: bar >= 108 && bar < 111 ? 108 : 0, rl: 3, riser: bar === 108 ? 4 : 0, gap: bar === 111, cut: 700 };
      if (bar < 128) return { id: "drop", drop: 112, kick: 1, reese: 1, bass: 1, hats: 3, clap: 1, arp: 1, gate: 1, lead: 1, oct: 1, str: 1, ride: 1, cut: 1800 };
      return { id: "home", kick: 1, bass: 0.7, hats: 2, arp: 0.6, pad: 1, cut: 900 - (bar - 128) * 80 };
    }
  };
  var SONG_GEMS = {
    mood: "Gem Match · emotional trance, long bass drops", bpm: 138, bars: 134,
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); },
    play: function (o, t, st, bar) {
      var sec = GT.sec(bar), root = GT.roots[Math.floor(bar / 2) % 4], tri = GT.tri[root], up = tri.map(function (m) { return m + 12; }), six = o.six;
      o.cut = sec.cut || 600;
      if (st === 0) {
        o.bassLp.frequency.setTargetAtTime(o.cut * 1.6, t, 0.5);
        o.sub.set(t, root - 12, sec.gap ? 0.0001 : sec.reese ? 0.185 : sec.bass ? 0.12 : 0.045);
        if (sec.riser) riser(o, t, six * 16 * sec.riser, 0.13);
        if (sec.gap) { subDrop(o, t, six * 16, 0.44); pad(o, t, up, six * 16, 0.03, "warm"); }   // the floor falls away for a whole bar
        if (sec.drop === bar) { crash(o, t, 0.7); subDrop(o, t, six * 16, 0.33); o.reese.rate(t, 1 / (six * 2)); o.reese.play(t, root + 12, six * 30, 0.17); o.reese.bend(t, root, six * 6); }
        else if (sec.drop != null && bar % 8 === 0) crash(o, t, 0.49);
        if (sec.reese && bar - sec.drop >= 2 && bar % 2 === 0) { o.reese.rate(t, 0.4); o.reese.play(t, root, six * 30, 0.08); }   // and the bass keeps holding underneath
        if (sec.pad && bar % 2 === 0) pad(o, t, tri.concat(tri[0] + 12), six * 32, 0.035, "warm");
        if (sec.str && bar % 2 === 0) strings(o, t, up, six * 32, 0.035, { a: 0.6, r: 1 });
        if (sec.gate) gatePad(o, t, up, 0.03 * sec.gate, six);
        if (sec.piano && bar % 2 === 0) { piano(o, t, root, 0.6 * sec.piano, 6); piano(o, t, tri[1], 0.4 * sec.piano, 6); }
      }
      if (sec.gap) return;
      if (sec.kick && st % 4 === 0) softKick(o, t, 1);
      if (sec.clap && (st === 4 || st === 12)) clap(o, t, 0.59);
      if (sec.hats === 1 && st % 4 === 2) hat(o, t, 0.7);
      if (sec.hats >= 2) { if (st % 4 === 2) hat(o, t, 0.9, true); else if (st % 2 === 1) hat(o, t, sec.hats === 3 ? 0.5 : 0.3); }
      if (sec.ride && st % 4 === 0) ride(o, t, 0.5);
      if (sec.roll) rollAt(o, t, st, bar, sec.roll, sec.rl);
      if (sec.bass && st % 4 !== 0) bassNote(o, t, root + (st % 4 === 2 ? 12 : 0), sec.bass * (st % 4 === 2 ? 0.6 : 0.46), six * 0.8);
      if (sec.arp) arpNote(o, t, [up[0], up[1], up[2], up[0] + 12][GT.arp[st]], sec.arp * (st % 4 === 0 ? 1 : 0.7));
      if (sec.lead || sec.piano) {
        var pos = (bar % 8) * 16 + st;
        GT.mel.forEach(function (n) {
          if (n[0] !== pos) return;
          if (sec.lead) supersaw(o, t, sec.oct ? [n[1], n[1] - 12] : [n[1]], n[2] * six * 0.95, 0.035 * sec.lead, { cut: sec.lead < 1 ? 2200 : 5200 });
          if (sec.piano) piano(o, t, n[1], 0.75 * sec.piano, n[2] * six * 1.6);
        });
      }
    }
  };
  SONG_GEMS.outroBars = 4;
  SONG_GEMS.outro = function (o, t, st, k, N) {   // the anthem's last chord swells and lets go, the kick walks away
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.16 * fade + 0.02);
      if (k === 0) { crash(o, t, 0.63); supersaw(o, t, [64, 71, 76], six * 36, 0.03, { a: 0.02, r: 3, cut: 3500 }); o.reese.rate(t, 0.3); o.reese.play(t, 40, six * 20, 0.13); }
      if (k === 1) pad(o, t, [52, 55, 59, 64], six * 40, 0.03, "warm");
      if (k === 2) piano(o, t, 76, 0.5, 4);
    }
    if (k < 2 && st % 4 === 0) softKick(o, t, 1 - k * 0.35);
    if (k < 3 && st % 4 === 2) hat(o, t, 0.6 * fade, true);
    if (k < 3) arpNote(o, t, [64, 67, 71, 76][GT.arp[st]], (st % 4 === 0 ? 0.9 : 0.6) * fade);
  };

  // 9 · Schema Stack · a slow climb (76 → 96 bpm, three minutes): fingerpicked guitar and flute over a descending
  // line, the band coming in, then two guitar solos and a hard-rock finish that ends as quietly as it began
  var ST = {
    tempo: [[0, 76], [16, 76], [28, 96], [999, 96]],
    // the line cliché, a bar each: [bass, three notes above] · Em, Em/D#, Em/D, A/C#, Cmaj7, G/B, Am, B
    cliche: [[52, [59, 64, 67]], [51, [59, 64, 67]], [50, [59, 64, 67]], [49, [57, 64, 67]], [48, [55, 59, 64]], [47, [55, 62, 67]], [45, [57, 60, 64]], [47, [54, 57, 63]]],
    pick: ["b", 0, 1, 2, "b", 2, 1, 0],   // the fingerpicking pattern, in eighths
    flute: [[0, 0, 71, 6], [0, 6, 74, 2], [0, 8, 76, 8], [1, 0, 74, 4], [1, 4, 71, 4], [1, 8, 67, 8], [2, 0, 69, 6], [2, 6, 71, 2], [2, 8, 74, 8],
      [3, 0, 73, 8], [3, 8, 69, 8], [4, 0, 71, 6], [4, 6, 72, 2], [4, 8, 76, 8], [5, 0, 74, 8], [5, 8, 71, 4], [5, 12, 67, 4],
      [6, 0, 69, 6], [6, 6, 72, 2], [6, 8, 76, 6], [6, 14, 74, 2], [7, 0, 75, 8], [7, 8, 71, 8]],
    rock: [40, 38, 36, 38], chords: [52, 50, 48, 50],   // Em D C D: bass roots, power-chord roots
    anthem: [[0, 76, 4], [4, 79, 2], [6, 76, 2], [8, 74, 4], [12, 71, 4], [16, 74, 4], [20, 78, 2], [22, 74, 2], [24, 69, 8],
      [32, 72, 4], [36, 76, 2], [38, 72, 2], [40, 67, 4], [44, 72, 4], [48, 74, 6], [54, 76, 2], [56, 78, 8]],
    // solo I, phrase by phrase (4 bars each): [step, note, length, bend from]
    solo: [
      [[0, 76, 6, 74], [6, 79, 2], [8, 81, 4, 79], [12, 79, 2], [14, 76, 2], [16, 74, 8, 72], [24, 71, 4], [28, 74, 4], [32, 72, 6], [38, 71, 2], [40, 67, 4], [44, 69, 4], [48, 71, 4, 69], [52, 74, 4], [56, 76, 8, 74]],
      [[0, 83, 8, 81], [8, 81, 2], [10, 79, 2], [12, 76, 4], [16, 78, 6, 76], [22, 81, 2], [24, 78, 4], [28, 74, 4], [32, 79, 4], [36, 76, 2], [38, 72, 2], [40, 76, 4], [44, 79, 4], [48, 81, 2], [50, 83, 2], [52, 86, 4, 84], [56, 88, 8, 86]],
      [[32, 79, 12, 77], [44, 76, 4], [48, 78, 8, 76], [56, 74, 4], [60, 71, 4]]   // after two bars of runs
    ],
    runs: { 40: [76, 79, 81, 83, 81, 79, 76, 79, 81, 83, 86, 83, 81, 79, 76, 74], 38: [74, 78, 81, 78, 74, 78, 81, 86, 81, 78, 74, 78, 81, 83, 81, 78], 36: [72, 76, 79, 76, 72, 76, 79, 84, 79, 76, 72, 76, 79, 81, 79, 76] },
    sec: function (bar) {
      if (bar < 8) return { id: "fingerpicked", pick: 0.8 };
      if (bar < 16) return { id: "the flute", pick: 0.75, flute: 1, cello: 0.5 };
      if (bar < 20) return { id: "rising", pick: 0.7, flute: 1, cello: 0.7, clean: 1, pad: 1 };
      if (bar < 28) return { id: "rising", pick: 0.6, lead: 1, cello: 0.8, clean: 1, drums: 1, pad: 1, fill: bar === 27 };
      if (bar < 36) return { id: "hard rock", rock: 1, drums: 2, anthem: 1, crash: bar === 28 || bar === 32, fill: bar === 35 };
      if (bar < 52) return { id: "solo", rock: 1, drums: 2, solo: 1, crash: bar % 4 === 0, fill: bar === 51 };
      if (bar < 60) return { id: "shred", rock: 1, drums: 2, shred: 1, twin: bar >= 56, crash: bar % 4 === 0, fill: bar === 59 };
      return { id: "finale", rock: 1, drums: 2, anthem: 1, harm: 1, crash: bar === 60, end: bar === 63 };
    }
  };
  var SONG_STACK = {
    mood: "Schema Stack · a slow climb to two guitar solos", bpm: 76, range: [76, 96], bars: 64,
    tempo: function (pos) { return mapBpm(ST.tempo, pos); },
    init: function (o, t) { o.sub = makeSub(o, t); o.g1 = makeGuitar(o, t, -0.2, true); o.g2 = makeGuitar(o, t, 0.35, true); o.fl = makeLead(o, t, "glass", 0.3); },
    play: function (o, t, st, bar) {
      var sec = ST.sec(bar), six = o.six, cl = ST.cliche[bar % 8], ri = bar % 4, rr = ST.rock[ri];
      o.cut = 420;   // a round, dark bass
      if (st === 0) o.sub.set(t, sec.rock ? rr - 12 : cl[0] - 24, sec.rock ? 0.08 : 0.04);
      if (sec.end) {   // three last hits, a held E, the lead wailing over it
        if (st === 0 || st === 3 || st === 6) {
          var ln = st === 6 ? six * 26 : six * 2;
          power(o, t, 40, ln, 1.1, { pan: -0.45, dark: 1 }); power(o, t, 40, ln, 1.1, { pan: 0.45, dark: 1 }); kick(o, t, 1); crash(o, t, 0.9); bassNote(o, t, 40, 0.7, ln * 0.9);
        }
        if (st === 6) o.g1.play(t, 76, six * 9, 0.06, 74);
        return;
      }
      if (sec.pick && st % 2 === 0) { var pi = ST.pick[st / 2]; pluck(o, t, pi === "b" ? cl[0] : cl[1][pi], sec.pick * (pi === "b" ? 1 : 0.75), 2.2); }
      if (st === 0) {
        if (sec.pad) pad(o, t, cl[1], six * 16, 0.02, "warm");
        if (sec.cello) strings(o, t, [cl[0] - 12], six * 16, 0.045 * sec.cello, { a: 0.3, r: 0.8, bright: 0.5 });
        if (sec.clean) power(o, t, cl[0], six * 7, 0.5, { tone: 0.5, pan: -0.3, dark: 1 });
      }
      if (sec.clean && st === 8) power(o, t, cl[0], six * 7, 0.4, { tone: 0.5, pan: 0.3, dark: 1 });
      if (sec.flute) melodyAt(ST.flute, bar % 8, st).forEach(function (n) { o.fl.play(t, n[2] + 12, n[3] * six, 0.08); });
      if (sec.lead) melodyAt(ST.flute, bar % 8, st).forEach(function (n) { o.g1.play(t, n[2], n[3] * six, 0.045, n[3] >= 8 ? n[2] - 2 : null); });
      if (sec.rock && st % 2 === 0) {   // driving eighths, double-tracked
        power(o, t, ST.chords[ri], six * 1.9, st % 4 === 0 ? 1 : 0.7, { pan: -0.45, dark: 1 });
        power(o, t, ST.chords[ri], six * 1.9, st % 4 === 0 ? 0.9 : 0.6, { pan: 0.45, dark: 1 });
        bassNote(o, t, rr, st % 4 === 0 ? 0.65 : 0.5, six * 1.8);
      }
      var sp = ri * 16 + st;
      if (sec.anthem) ST.anthem.forEach(function (n) {
        if (n[0] !== sp) return;
        o.g1.play(t, n[1], n[2] * six, 0.06, n[2] >= 4 && st % 4 === 0 ? n[1] - 2 : null);
        if (sec.harm) o.g2.play(t, dia(n[1], -2), n[2] * six, 0.045);
      });
      if (sec.solo) {
        var ph = Math.floor((bar - 36) / 4);
        if (ph === 2 && ri < 2) o.g1.play(t, ST.runs[rr][st], six * 0.95, 0.05);
        else if (ph === 3) ST.anthem.forEach(function (n) { if (n[0] === sp) { o.g1.play(t, n[1], n[2] * six, 0.06, n[1] - 2); o.g2.play(t, dia(n[1], -2), n[2] * six, 0.05); } });
        else ST.solo[ph].forEach(function (n) { if (n[0] === sp) o.g1.play(t, n[1], n[2] * six, 0.06, n[3]); });
      }
      if (sec.shred) { var nn = ST.runs[rr][st]; o.g1.play(t, nn, six * 0.95, 0.05, st === 0 ? nn - 2 : null); if (sec.twin) o.g2.play(t, dia(nn, -2), six * 0.95, 0.04); }
      if (sec.drums === 1) {
        if (st === 0 || st === 8) kick(o, t, 0.7);
        if ((st === 4 || st === 12) && !(sec.fill && st >= 8)) snare(o, t, 0.55);
        if (st % 4 === 2) hat(o, t, 0.5);
      } else if (sec.drums === 2 && !(sec.fill && st >= 8)) {
        if (st === 0 || st === 8 || (st === 10 && bar % 2)) kick(o, t, 1);
        if (st === 4 || st === 12) snare(o, t, 1.05);
        if (st % 2 === 0) (sec.solo || sec.shred ? ride : hat)(o, t, st % 4 === 0 ? 0.9 : 0.6);
      }
      if (sec.crash && st === 0) crash(o, t, 0.8);
      if (sec.fill && st >= 8) tom(o, t, [220, 200, 170, 150, 130, 110, 95, 80][st - 8], sec.drums === 1 ? 0.7 : 1);
    }
  };
  SONG_STACK.outroBars = 4;
  SONG_STACK.outro = function (o, t, st, k, N) {   // the chord rings out, and the song ends as it began: one guitar, picking quietly
    var six = o.six, fade = 1 - k / N;
    if (st === 0) o.sub.set(t, 28, 0.08 * fade + 0.02);
    if (k === 0 && st === 0) o.g1.play(t, 79, six * 12, 0.04, 76);
    if (k >= 1 && st % 2 === 0) { var pi = ST.pick[st / 2]; pluck(o, t, pi === "b" ? 52 : [59, 64, 67][pi], 0.6 * fade + 0.15, 2.4); }
    if (k === 2 && st === 0) o.fl.play(t, 88, six * 14, 0.07);
  };

  // 10 · Pit Wall · electro techno (148 bpm, four minutes): five red lights before every drop, lights out,
  // and a V8 that idles, blips, launches, changes gear and bounces off the limiter all the way through
  var PW = {
    roots: [40, 36, 43, 38],   // Em C G D, two bars each
    tri: { 40: [52, 55, 59], 36: [48, 52, 55], 43: [47, 50, 55], 38: [50, 54, 57] },
    fan: [[0, 64, 2], [2, 71, 6], [8, 69, 2], [10, 71, 2], [12, 76, 12], [24, 74, 4], [28, 71, 4],
      [32, 72, 6], [38, 71, 2], [40, 67, 8], [48, 64, 4], [52, 67, 4], [56, 72, 8],
      [64, 71, 6], [70, 74, 2], [72, 79, 12], [84, 78, 4], [88, 74, 8],
      [96, 78, 6], [102, 76, 2], [104, 74, 4], [108, 69, 4], [112, 74, 6], [118, 76, 10]],
    perc: { 3: 0.5, 7: 0.4, 11: 0.6, 14: 0.45 },
    sec: function (bar) {
      if (bar < 8) return { id: "the grid", idle: 1, lights: bar >= 3 ? bar - 2 : 0, pad: bar >= 4 };
      if (bar < 24) return { id: "lights out", out: bar === 8, kick: 1, bass: 0.8, hats: bar >= 12 ? 2 : 1, clap: bar >= 16, perc: bar >= 16 ? 0.6 : 0, arp: 0.5, cut: 500 + (bar - 8) * 50, fly: bar === 16 || bar === 20, corner: bar >= 12 };
      if (bar < 32) return { id: "formation lap", kick: bar < 31, bass: bar < 31 ? 1 : 0, hats: 2, clap: 1, perc: 0.8, arp: 0.5, acid: 0.4, cut: 1300, corner: bar < 27, roll: bar >= 27 ? 27 : 0, rl: 5, riser: bar === 27 ? 5 : 0, lights: bar >= 27 ? bar - 26 : 0, rev: bar >= 27 };
      if (bar < 64) return { id: "race", out: bar === 32, drop: 32, big: 1, reese: 1, bass: 1, hats: 3, clap: 1, perc: 1, arp: 0.5, gate: 0.7, stab: 1, acid: 0.4, cut: 1700, fly: bar % 4 === 2, corner: 1 };
      if (bar < 80) return { id: "pit lane", idle: bar < 75, pad: 1, str: 1, pit: bar < 74, arp: bar >= 72 ? 0.5 : 0, hats: bar >= 68 ? 1 : 0, roll: bar >= 74 ? 74 : 0, rl: 6, riser: bar === 74 ? 6 : 0, lights: bar >= 75 ? bar - 74 : 0, rev: bar >= 75, cut: 500 };
      if (bar < 120) return { id: "full throttle", out: bar === 80, drop: 80, big: 1, reese: 1, bass: 1, hats: 3, clap: 1, perc: 1, brk: 1, arp: 0.5, gate: 0.7, stab: 1, acid: 0.5, ride: 1, cut: 1900, fly: bar % 4 === 2, shift: bar === 96, corner: bar !== 96 && bar !== 97 };
      if (bar < 128) return { id: "last lap", kick: bar < 127, bass: bar < 127 ? 1 : 0, hats: 2, perc: 1, arp: 0.5, toms: bar < 123, corner: bar < 123, fly: bar === 120, roll: bar >= 123 ? 123 : 0, rl: 5, riser: bar === 123 ? 5 : 0, lights: bar >= 123 ? bar - 122 : 0, rev: bar >= 123, cut: 1100 };
      if (bar < 136) return { id: "chequered flag", out: bar === 128, drop: 128, big: 1, reese: 1, bass: 1, hats: 3, clap: 1, perc: 1, brk: 1, arp: 0.5, gate: 0.7, lead: 0.8, ride: 1, cut: 1900, fly: bar === 132, corner: 1 };
      return { id: "cool-down lap", kick: 1, bass: 0.7, hats: 2, arp: 0.6, pad: 1, idle: 1, cut: 900 - (bar - 136) * 60 };
    }
  };
  var SONG_PIT = {
    mood: "Pit Wall · electro techno, lights out, V8s and screeching tyres", bpm: 148, bars: 144,
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.acid = makeAcid(o, t); o.v8 = makeV8(o, t); },
    play: function (o, t, st, bar) {
      var sec = PW.sec(bar), root = PW.roots[Math.floor(bar / 2) % 4], tri = PW.tri[root], up = tri.map(function (m) { return m + 12; }), six = o.six, v8 = o.v8;
      o.cut = sec.cut || 600;
      if (st === 0) {
        o.bassLp.frequency.setTargetAtTime(o.cut * 1.6, t, 0.5);
        o.sub.set(t, root - 12, sec.reese ? 0.155 : sec.bass ? 0.1 : 0.045);
        if (sec.idle) { v8.level(t, 0.06, 0.3); v8.rpm(t, 52, 0.25); }
        if (sec.lights) lightOn(o, t, 1);
        if (sec.rev) { v8.level(t, 0.07, 0.2); v8.rpm(t, 90 + sec.lights * 45, six * 4); }   // revving on the grid, higher with every light
        if (sec.rev && sec.lights === 5) v8.limiter(t + six * 8, 330, 8, six);   // ...and bouncing off the limiter
        if (sec.out) { lightsOut(o, t, 1); v8.level(t, 0.085, 0.02); v8.shift(t, 5, six * 6, 110, 320); v8.level(t + six * 30, 0.045, 1.5); }
        if (sec.drop === bar) { crash(o, t, 0.7); subDrop(o, t, six * 12, 0.25); o.reese.rate(t, 0.3); o.reese.play(t, root + 12, six * 30, 0.13); o.reese.bend(t, root, six * 4); }
        else if (sec.drop != null && bar % 8 === 0) crash(o, t, 0.49);
        if (sec.reese && bar - sec.drop >= 2 && bar % 2 === 0) { o.reese.rate(t, 0.25); o.reese.play(t, root, six * 30, 0.06); }
        if (sec.corner && !sec.out && bar % 2 === 0) v8.rpm(t, 150 + (bar % 8) * 20, six * 8);   // flat out down the straight
        if (sec.pit && bar % 2 === 0) { vroom(o, t + six * 4, six * 10, 60, 150, 0.7); }   // a car crawling down the pit lane
        if (sec.pit && bar % 4 === 3) tyres(o, t + six * 8, six * 6, 0.8, 0.4);   // ...and one wheelspinning out of its box
        if (sec.corner && !sec.out && bar % 8 === 1) v8.level(t, 0.045, 0.5);
        if (sec.shift) { v8.level(t, 0.08, 0.05); v8.shift(t, 4, six * 8, 120, 330); v8.level(t + six * 32, 0.045, 1.2); }
        if (sec.fly) flyby(o, t, six * 16, 1);
        if (sec.riser) riser(o, t, six * 16 * sec.riser, 0.13);
        if (sec.pad && bar % 2 === 0) pad(o, t, tri.concat(tri[0] + 12), six * 32, 0.03, "warm");
        if (sec.str && bar % 2 === 0) strings(o, t, up, six * 32, 0.035, { a: 0.6, r: 1 });
        if (sec.gate) gatePad(o, t, up, 0.03 * sec.gate, six);
      }
      if (sec.idle && bar % 2 === 1 && st === 8 && !sec.lights) v8.blip(t, 52, 175);   // vroom, vroom
      if (sec.idle && st === 12 && !sec.lights) v8.blip(t, 52, 140);
      if (sec.corner && bar % 2 === 1) {   // a corner every two bars
        if (st === 6) v8.rpm(t, 85, 0.05);              // off the throttle
        if (st === 7) v8.downshift(t, 3, six, 85);      // three downshifts
        if (st === 9 && bar % 4 === 3) tyres(o, t, six * 5, 1, bar % 8 === 3 ? -0.5 : 0.5);   // the tyres let go
        if (st === 10) v8.rpm(t, 260, six * 3);         // back on it
      }
      if (sec.fly && st === 8 && bar % 8 === 6) flyby(o, t, six * 12, 0.7);   // and a second car right behind
      if (sec.idle && sec.lights && st === 12) v8.blip(t, 52, 150 + sec.lights * 25);
      if (sec.kick && st % 4 === 0) softKick(o, t, 1);
      if (sec.big && st % 4 === 0) softKick(o, t, 1);
      if (sec.clap && (st === 4 || st === 12)) clap(o, t, 0.65);
      if (sec.perc && PW.perc[st]) tom(o, t, st < 8 ? 210 : 160, PW.perc[st] * sec.perc * 0.55);
      if (sec.hats === 1 && st % 4 === 2) hat(o, t, 0.7);
      if (sec.hats >= 2) { if (st % 4 === 2) hat(o, t, 0.9, true); else hat(o, t, sec.hats === 3 ? 0.32 : 0.22); }
      if (sec.ride && st % 4 === 0) ride(o, t, 0.5);
      if (sec.toms && bar % 2 === 1 && st >= 8) tom(o, t, [220, 200, 170, 150, 130, 110, 95, 80][st - 8], 0.9);
      if (sec.roll) rollAt(o, t, st, bar, sec.roll, sec.rl);
      if (sec.bass && st % 4 === 2) bassNote(o, t, root, sec.bass * 0.45, six * 1.6);   // a plain offbeat bass, nothing busy
      if (sec.stab && (st === 3 || st === 10 || (st === 14 && bar % 2))) techStab(o, t, tri, st === 3 ? 0.7 : 0.45, 0.4);   // rhythm, not melody
      if (sec.acid && DQ.acid[st] != null) o.acid.play(t, 52 + DQ.acid[st] + (root - 40), six * (DQ.slide[st] ? 1.1 : 0.7), 0.06 * sec.acid, 900, DQ.accent[st], DQ.slide[st]);
      if (sec.arp) arpNote(o, t, [up[0], up[1], up[2], up[0] + 12][GT.arp[st]], sec.arp * (st % 4 === 0 ? 1 : 0.7));
      if (sec.lead) {   // the fanfare comes back once, for the chequered flag
        var pos = (bar % 8) * 16 + st;
        PW.fan.forEach(function (n) {
          if (n[0] !== pos) return;
          supersaw(o, t, [n[1]], n[2] * six * 0.95, 0.035 * sec.lead, { cut: 3800 });
        });
      }
    }
  };
  SONG_PIT.outroBars = 4;
  SONG_PIT.outro = function (o, t, st, k, N) {   // the cars come home: one last flyby, the engine winds down, the ignition goes off
    var six = o.six, fade = 1 - k / N, v8 = o.v8;
    if (st === 0) {
      o.sub.set(t, 28, 0.15 * fade + 0.02);
      if (k === 0) { flyby(o, t, six * 24, 1); crash(o, t, 0.56); supersaw(o, t, [64, 71, 76], six * 36, 0.03, { a: 0.02, r: 3, cut: 3500 }); v8.level(t, 0.06, 0.3); v8.rpm(t, 70, 0.5); }
      if (k === 1) { v8.blip(t, 60, 200); v8.downshift(t + six * 6, 3, six, 70); tyres(o, t + six * 8, six * 4, 0.7, -0.3); }
      if (k === 2) { v8.rpm(t, 22, 0.5); v8.level(t + six * 2, 0.0001, 0.3); lightsOut(o, t + six * 8, 0.6); }
    }
    if (k < 2 && st % 4 === 0) softKick(o, t, 1 - k * 0.35);
    if (k < 2 && st % 4 === 2) hat(o, t, 0.6 * fade, true);
    if (k < 3) arpNote(o, t, [64, 67, 71, 76][GT.arp[st]], (st % 4 === 0 ? 0.9 : 0.6) * fade);
  };

  var BONUS = [
    { si: 6, game: "sidekiq", name: "Sidekiq Rush", song: SONG_QUEUE, titles: { phthalo: "Dead Letter Queue", knight: "Bunker 0x1F", golden: "Gilded Backpressure" } },
    { si: 7, game: "gems", name: "Gem Match", song: SONG_GEMS, titles: { phthalo: "Facets of Light", knight: "Embers Rising", golden: "Prism Anthem" } },
    { si: 8, game: "schema", name: "Schema Stack", song: SONG_STACK, titles: { phthalo: "Stairway to Production", knight: "The Long Migration", golden: "Golden Stairs" } },
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
    var o = { P: P, song: song, theme: theme, si: si, s: (sp && sp.s) || 0, six: six, dur: six, next: t + 0.08, nodes: [], loop: !!loop, ref: song.ref || 440, bpm: Math.round(bpm), cut: 800, duckDepth: song.duckDepth };
    o.bus = gain(0.0001); o.bus.gain.linearRampToValueAtTime(1, t + fade); if (!song.v2) o.bus.connect(master);
    var verb = ctx.createConvolver(); verb.buffer = song.v2 ? verbBuf2 : verbBuf;
    o.verb = gain(1); var vOut = gain(P.verb); o.verb.connect(verb); verb.connect(vOut); vOut.connect(o.bus);
    o.delay = gain(1); var dl = ctx.createDelay(2), fb = gain(0.32), dtone = filt("lowpass", 1800, 0.5);
    dl.delayTime.value = six * 3; o.dl = dl; o.delay.connect(dl); dl.connect(dtone); dtone.connect(fb); fb.connect(dl); dtone.connect(o.verb);
    if (song.v2) {   // the five songs' echoes land left, then answer from the right half a beat later
      var dl2 = ctx.createDelay(2), ew = P.width || 0.85, eL = panner(-0.8 * ew), eR = panner(0.8 * ew);
      dl2.delayTime.value = six * 1.5; o.dl2 = dl2; dtone.connect(eL); eL.connect(o.bus); dtone.connect(dl2); dl2.connect(eR); eR.connect(o.bus);
    } else dtone.connect(o.bus);
    o.drums = gain(1); var dsh = shaper(P.drive), dpost = gain(0.8); o.drums.connect(dsh); dsh.connect(dpost); dpost.connect(o.bus);
    o.duck = gain(1); o.duck.connect(o.bus);
    o.vib = osc("sine", 5.2, t, t + 36000); o.vibG = gain(8); o.vib.connect(o.vibG); o.nodes.push(o.vib);
    o.bassLp = filt("lowpass", 400, 5); var bsh = shaper(P.bassDrive), bout = gain(0.9); o.bassLp.connect(bsh); bsh.connect(bout); bout.connect(o.duck);
    if (song.v2) {
      busesV2(o, t);
      // output: a fixed tone stage (nothing in it can clip), then the arrangement's own level curve
      var tn = song.tone || {}, hp1 = filt("highpass", 30, 0.7), hp2 = filt("highpass", 30, 0.7), pres = filt("peaking", 3200, 0.8);
      var lows = filt("lowshelf", 55, 0.7), punch = filt("peaking", 110, 1);
      lows.gain.value = tn.sub || 0; punch.gain.value = tn.punch || 0; pres.gain.value = (P.presence || 1.5) + (tn.pres || 0);
      o.trim = (song.trim && song.trim[theme]) || 0;
      o.dyn = gain(Math.pow(10, o.trim / 20));
      o.bus.connect(hp1); hp1.connect(hp2); hp2.connect(lows); lows.connect(punch); punch.connect(pres); pres.connect(o.dyn); o.dyn.connect(master);
    }
    song.init(o, t);
    scheduleDyn(o, t);
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
    if (o.dyn) try { o.dyn.disconnect(); } catch (e) {}   // a v2 track's output chain hangs off o.dyn
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
    var live = { ctx: ctx, master: master, analyser: analyser, noiseBuf: noiseBuf, verbBuf: verbBuf, verbBuf2: verbBuf2 };
    var off = new OAC(2, Math.ceil(secs * rate), rate), CH = 4, o;
    function swapIn() { ctx = off; master = rs.master; analyser = rs.analyser; noiseBuf = rs.noiseBuf; verbBuf = rs.verbBuf; verbBuf2 = rs.verbBuf2; }
    function swapOut() { ctx = live.ctx; master = live.master; analyser = live.analyser; noiseBuf = live.noiseBuf; verbBuf = live.verbBuf; verbBuf2 = live.verbBuf2; }
    ctx = off; graph(); master.gain.value = MASTER;
    var rs = { master: master, analyser: analyser, noiseBuf: noiseBuf, verbBuf: verbBuf, verbBuf2: verbBuf2 };
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
          songs.push({ no: b.si + 1, title: P.titles[b.si], mood: s.mood, bpm: s.range ? Math.round(s.range[0] * P.bpm) + "–" + Math.round(s.range[1] * P.bpm) : Math.round(s.bpm * P.bpm), bars: s.bars, outro: s.outroBars, secs: Math.round(trackSecs(k, b.si)), bonus: true, game: b.game, gameName: b.name, locked: !bonusOpen(b.game) });
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
