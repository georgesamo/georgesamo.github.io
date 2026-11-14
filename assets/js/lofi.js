/* Site soundtrack · 5 original songs × 3 theme palettes = 15 tracks, synthesized live with Web Audio.
 *
 * Songs (the same blueprint for every theme), about 3½ minutes each. Each one is its motif and nothing else: one
 *   melody, said again and again, each time by a different voice or two (piano, music box, fuzz bass, pulse,
 *   strings, leads, brass), at half speed in the breaks, with the band around it. See "the motif-only songs" below.
 *   1 the theme            the hook, B A G F# G E (110 bpm, 88 bars)
 *   2 the horror scene     the music box's lullaby (120 bpm, 96 bars)
 *   3 the character study  the piano melody (132 bpm, 112 bars)
 *   4 the battle of wits   the duel's phrase, traded between two hackers (172 bpm, 140 bars)
 *   5 the epilogue         the old epilogue's melody; A=432 (60 bpm, 48 bars)
 *   Written after Justice ("Pusher", with Gesaffelstein) and Mac Quayle's Mr. Robot score, as one story in five chapters.
 * Palettes: Phthalo (E minor, cold analog) · Dark Knight (D minor, heavier, choir, low brass) ·
 *           Golden (G minor, electronic: square pulse, wide saw lead, saw keys, a trance gate, 0.99x). CRT uses Phthalo.
 * Track 6 (secret, per theme) is the director's cut, unlocked in the Patch Bay (assets/js/patchbay.js), which wakes
 *   after you've heard all five songs: the same story told once, end to end (~10½ min, eight chapters of a minute to a
 *   minute and three quarters), with the five songs' material and instruments, plus a chapter only that palette has
 *   (Phthalo "the monologue", Dark Knight "the warehouse", Golden "the dance break"). See "track 6" below.
 * Tracks 7–10 are bonus tracks, one per arcade game, unlocked in every theme by finishing a run of that game. Like the
 *   songs, each is its motif only, handed between instruments, about 3½ minutes:
 *   7 Sidekiq Rush  the lead on low strings, violins, choir, horns; a breakdown and three drops (132 bpm)
 *   8 Gem Match     the tune on a glass lead, low strings, the fiddle, then all with the choir; a last chord in major (81 bpm)
 *   9 Schema Stack  the riff in the reese bass, on the lead, at half speed, then under the drums; a hard stop (123 bpm)
 *  10 Pit Wall      red lights, the theme on horns, strings and choir, a seven-bar replay where it runs backwards (100 bpm)
 * Track 11 is a hidden gem: the monologue, Phthalo's chapter of the cut on its own, in every palette, unlocked by
 *   running bundle install on Samuka's page.
 * The main rotation follows the list: the five songs, every unlocked bonus track, then the director's cut once it's
 *   unlocked, and round again. Shuffle picks from the same set.
 * Every song ends with an outro at its own tempo whose last bar swells into the home chord; that chord rings on for
 *   about six seconds, and the next track (whatever it is: the next song, shuffle, or itself on repeat) starts under it.
 * On the site the current theme's songs play in order; switching theme crossfades to the same song.
 * SamukaLofi.preview(theme, n) loops one track (used by the /soundtrack/ listening page).
 */
(function () {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.55, LOOK = 0.3, TICK = 25;   // LOOK: how far ahead notes are queued, in seconds
  // the drum bus per palette: [into the drive, out of it]. Measured with soundtrack-lab/stems.py so that, where the
  // kit plays, it adds about 2-3 dB to the music rather than covering it (it used to add 6-10 dB)
  var KIT = { mrrobot: [1, 0.8], industrial: [0.55, 0.36], kpop: [0.85, 0.5] };
  // low key: the kit and the bass a step back (about -2.5 dB), the strings and synths forward. Every track's level
  // is then held by its flat_ curve and normalised at publish, so this moves the balance, not the volume
  var BAL = { drums: 0.75, bass: 0.75, pad: 1.3, arp: 1.2, stab: 1.15, keys: 1.05, fuzz: 1, strings: 1.3, lead: 1.2 };
  var ctx = null, master = null, mixOut = null, analyser = null, noiseBuf = null, verbBuf = null, verbBuf2 = null;
  var on = false, timer = null, cur = null, token = 0, btn = null, nextBtn = null, pinned = null;

  var THEMES = {
    phthalo: { name: "Phthalo", tr: 0, bpm: 1, style: "mrrobot", drive: 2.2, bassDrive: 1.6, kickLow: 44, width: 0.85, presence: 1.5, strBright: 2400, pianoLp: 3200, arp: "saw", lead: "saw", lead2: "pulse", choir: 0, shimmer: 0, verb: 0.55, brass: 1,
      titles: ["Ring Zero", "Something in the Wires", "Alone at 3 AM", "Two Cursors, One Shell", "Green Dawn", "Root Access"] },
    knight: { name: "Dark Knight", tr: -2, bpm: 0.92, style: "industrial", drive: 3.4, bassDrive: 2.6, kickLow: 38, width: 0.75, presence: 0.8, strBright: 1700, pianoLp: 1900, arp: "grit", lead: "grit", lead2: "saw", choir: 1, shimmer: 0, verb: 0.75, brass: 1.3,
      titles: ["Crimson Protocol", "Footsteps Behind You", "What Is Left of Me", "Blade Against Blade", "After the Rain", "The Long Night"] },
    // synth: Golden goes electronic - a square pulse, a wide saw lead, saw-pluck keys, a 16th trance gate on the pads, a little pump
    golden: { name: "Golden", tr: 3, bpm: 0.99, style: "kpop", synth: 1, drive: 1.6, bassDrive: 1.3, kickLow: 48, width: 0.95, presence: 3.0, strBright: 3300, pianoLp: 5200, arp: "bell", lead: "glass", lead2: "pulse", choir: 0, shimmer: 1, verb: 0.8, brass: 0.8,
      titles: ["Golden Hour Uplink", "Gilded Nightmare", "Violet Rain", "Mirror Match", "Lullaby in Gold", "Alchemy"] }
  };   // titles[5] is the secret suite (track 6), unlocked per theme in the Patch Bay
  function themeId() { var s = document.documentElement.dataset.skin; return THEMES[s] ? s : "phthalo"; }
  function quiet(p) { if (p && p.catch) p.catch(function () {}); }

  function ensureCtx() {
    if (ctx) return true;
    // "playback" asks for the larger audio buffers meant for music: the default ("interactive") runs on
    // ~10 ms of headroom, and any CPU spike past that is a dropout - heard as a click on the busy drum parts
    try { ctx = new AC({ latencyHint: "playback" }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return false; } }
    graph(); return true;
  }
  function graph() {   // master bus, analyser, noise and reverb buffers for the current ctx
    var comp = ctx.createDynamicsCompressor();
    // gentle: it only rounds the loudest moments off. A harder setting (-14 dB, 3.5:1) let every kick pull the whole
    // mix down with it - the synths sank whenever the drums played. Loudness is set offline (soundtrack-lab/level.py).
    comp.threshold.value = -9; comp.knee.value = 10; comp.ratio.value = 1.8; comp.attack.value = 0.012; comp.release.value = 0.3;
    // a safety limiter after the compressor: the compressor's 4 ms attack lets transients through and
    // its make-up gain lifts them, which is how a peak used to reach full scale and clip
    var lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    // master: where the synth goes in, at a fixed level, so it always hits the compressor the same way.
    // mixOut: volume, fades and pause, after the limiter - the pre-rendered songs join here, already mastered.
    master = ctx.createGain(); master.gain.value = MASTER;
    mixOut = ctx.createGain(); mixOut.gain.value = 0;
    master.connect(comp); comp.connect(lim); lim.connect(mixOut); mixOut.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8; mixOut.connect(analyser);
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
  // a 4 ms glide down rather than a jump: an instant gain step under held notes is a click, on every kick.
  // DUCK scales every depth the voices ask for: the kicks used to pull the synths and strings down to 16-60 %
  // of their level on every beat (the industrial kick to 16 %), which is how the drums "drowned" everything.
  // Now a kick only leans on the rest (about -1.5 dB), so the music keeps its level when the kit comes in.
  var DUCK = 0.28;
  // Golden (synth) pumps a little harder: about -3 dB instead of -1.5
  function duckAt(o, t, depth) { depth = 1 - (1 - depth) * (o.P.synth ? DUCK * 1.8 : DUCK); var d = o.duck.gain; d.cancelScheduledValues(t); d.setTargetAtTime(depth, t, 0.004); d.setTargetAtTime(1, t + 0.03, 0.09); }
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
  function pad(o, t, notes, len, vol, kind, steady) {   // steady: full level from the start, one filter setting, a short hand-over
    var lp = filt("lowpass", 700, 0.8), g = gain(0);
    if (steady) { lp.frequency.setValueAtTime(kind === "warm" ? 1100 : 900, t); swell(g, t, 0.06, len, 0.8, vol * BAL.strings); }
    else {
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(kind === "warm" ? 1400 : 1100, t + len * 0.5); lp.frequency.linearRampToValueAtTime(600, t + len);
      swell(g, t, len * 0.35, len * 0.6, len * 0.4 + 0.6, vol * BAL.strings);
    }
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
    swell(g, t, a, len, r, vol * BAL.strings / Math.sqrt(notes.length));
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
  function piano(o, t, m, v, len) {
    var f = F(o, m), g = gain(0), lp = filt("lowpass", o.P.pianoLp, 0.5);
    lp.frequency.setValueAtTime(o.P.pianoLp, t); lp.frequency.exponentialRampToValueAtTime(o.P.pianoLp * 0.3, t + len);
    [["triangle", 1, 1], ["sine", 2, 0.3], ["sine", 3.01, o.P.shimmer ? 0.12 : 0.05]].forEach(function (p) {
      var s = osc(p[0], f * p[1], t, t + len + 0.1, p[1] === 1 ? 0 : 3), sg = gain(p[2]); s.connect(sg); sg.connect(lp);
    });
    env(g, t, 0.004, len, 0.12 * v); lp.connect(g); g.connect(o.duck); send(o, g, 0.55, 0.15);
  }

  /* ---------- persistent voices ---------- */
  function makeSub(o, t) {
    var s = osc("sine", 55, t, t + 36000), g = gain(0); s.connect(g); g.connect(o.duck); o.nodes.push(s);
    return { set: function (tt, m, lvl) { s.frequency.setTargetAtTime(F(o, m), tt, 0.01); g.gain.setTargetAtTime(lvl * BAL.bass, tt, 0.3); } };
  }
  function makeLead(o, t, kind, panV) {
    var spec = { saw: [["sawtooth", 1, -7], ["square", 0.5, 6]], grit: [["sawtooth", 1, -9], ["sawtooth", 1, 9]], glass: [["triangle", 1, 0], ["sine", 2, 0]], pulse: [["square", 1, 0], ["square", 1.0, 8]] }[kind];
    var mix = gain(0.5 * BAL.lead), lp = filt("lowpass", 1400, kind === "pulse" ? 6 : 3), g = gain(0.0001), p = panner(panV || 0), oscs = [];
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
      depth: function (tt, d) { lg.gain.setTargetAtTime(d, tt, 0.1); },   // how far the wobble moves the filter (Hz, default 260)
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
  // a v2 bus, or - when an older track's outro uses one of the five songs' voices - a plain filter into its duck bus
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
    o.padOut = gain(BAL.pad); ensOut.connect(o.padOut); o.padOut.connect(o.duck); sendTo(o.padOut, P.style === "industrial" ? 0.7 : 0.5);
    // the tremolo sits at zero depth until a song asks for it
    o.tremLfo = osc("sine", 9, t, t + 36000); o.tremDepth = gain(0); o.tremLfo.connect(o.tremDepth); o.tremDepth.connect(o.padTrem.gain);
    o.nodes.push(lfo, o.tremLfo);
    // the pulse: one resonant lowpass swept by the arrangement, thrown into the echoes
    o.arpIn = gain(1); o.arpF = filt("lowpass", 900, P.style === "industrial" ? 6 : 3.2); o.arpOut = gain(BAL.arp);
    o.arpIn.connect(o.arpF); o.arpF.connect(o.arpOut); o.arpOut.connect(o.duck); sendTo(o.arpOut, 0.16, 0.42);
    // fuzz bass: Justice's sound is a saturated, mid-heavy bass, so the fuzz lives on this bus.
    // Notes arrive here below 0.9 peak, so the shaper never runs off the end of its curve.
    o.fuzzIn = gain(1); o.fuzzF = filt("lowpass", 900, 2.2);
    var fz = shaper(P.bassDrive * 2.2), fzPost = gain(0.42 * BAL.bass), fzHp = filt("highpass", 38, 0.7);
    o.fuzzOut = gain(1);
    o.fuzzIn.connect(o.fuzzF); o.fuzzF.connect(fz); fz.connect(fzPost); fzPost.connect(fzHp); fzHp.connect(o.fuzzOut); o.fuzzOut.connect(o.duck);
    // stabs: saw chords through a little saturation
    o.stabIn = gain(1); var sHp = filt("highpass", 220, 0.7), sSh = shaper(1.6), sPost = gain(0.75);
    o.stabOut = gain(BAL.stab); o.stabIn.connect(sHp); sHp.connect(sSh); sSh.connect(sPost); sPost.connect(o.stabOut); o.stabOut.connect(o.duck); sendTo(o.stabOut, 0.32, 0.12);
    // keys: one fixed lowpass for the piano and the music box
    o.keysIn = gain(1); var kLp = filt("lowpass", P.synth ? 2600 : P.pianoLp * 1.3, P.synth ? 1.2 : 0.5);
    o.keysOut = gain(BAL.keys); o.keysIn.connect(kLp); kLp.connect(o.keysOut); o.keysOut.connect(o.duck); sendTo(o.keysOut, 0.55, 0.1);
    o.bright = P.style === "kpop" ? 1.35 : P.style === "industrial" ? 0.72 : 1;
  }
  // bus faders for a section, gliding (tc seconds) rather than jumping. With song.arpDirect the pulse's fader
  // also cancels that section's level, so the pulse stays where the opening put it while the band comes in.
  function mixTo(o, t, mix, tc) {
    mix = mix || {};
    var lift = o.song.arpDirect ? ((o.song["lift_" + o.theme] || {})[o.song.sec(Math.floor(o.s / 16)).id] || 0) : 0;
    ["pad", "arp", "fuzz", "stab", "keys"].forEach(function (k) {
      var v = (mix[k] != null ? mix[k] : 1) * BAL[k];
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
    env(g, t, 0.003, l, (o.P.synth ? 0.06 : 0.075) * v);
    osc(o.P.synth || o.P.arp === "grit" ? "square" : o.P.arp === "bell" ? "triangle" : "sawtooth", F(o, m), t, t + l + 0.06).connect(g);
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
    if (o.P.synth) {   // Golden: a saw pluck with a square an octave up, through the keys bus's resonant lowpass
      env(g, t, 0.002, len * 0.7, 0.075 * v);
      osc("sawtooth", f, t, stop, -5).connect(g); osc("square", f * 2, t, stop, 5).connect(h); h.connect(g);
    } else {
      env(g, t, 0.003, len, 0.12 * v);
      osc("triangle", f, t, stop).connect(g); osc("sine", f * 2, t, stop, 3).connect(h); h.connect(g);
    }
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
    if (o.P.synth && kind === "glass") kind = "super";   // Golden's electronic lead: two wide saws over a square an octave down
    var spec = { saw: [["sawtooth", 1, -7], ["square", 0.5, 6]], grit: [["sawtooth", 1, -9], ["sawtooth", 1, 9]], glass: [["triangle", 1, 0], ["sine", 2, 0]], pulse: [["square", 1, 0], ["square", 1.0, 8]], super: [["sawtooth", 1, -14], ["sawtooth", 1, 14], ["square", 0.5, 0]] }[kind];
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
  // How a section arrives can be shaped per section id with song.moves (or song["moves_" + theme], which wins):
  //   land   the share of the level change made at the downbeat (0-1, default 1)
  //   grow   bars over which the rest of it follows, evenly in dB (default 0: all at once)
  //   ease   going down: bars before the downbeat over which the louder section eases off (default song.ramp)
  //   drums  bars over which the kit grows in from `from` (default 0.35) of its velocity - see entryV
  //   fade   bars before this section over which the outgoing kit thins to `to` (default 0.3) - for a way down
  // e.g. moves: { "it hunts": { land: 0.4, grow: 2, drums: 2 } } - the hunt starts under its full height and
  // reaches it two bars in, the way a band builds rather than a switch flipping.
  function movesOf(song, theme) { return song["moves_" + theme] || song.moves || {}; }
  // a bar's section id: song.sec(bar).id for the songs and the cut, song.part(bar) for the bonus tracks
  function secId(song, bar) { return song.sec ? song.sec(bar).id : song.part ? song.part(bar) : null; }
  function secStart(song, bar) {
    var st = song.secStarts || (song.secStarts = []);
    if (st[bar] == null) { var id = secId(song, bar), b = bar; while (b > 0 && secId(song, b - 1) === id) b--; st[bar] = b; }
    return st[bar];
  }
  function dynFromSections(song, theme) {
    var lift = song["lift_" + theme] || {}, ramp = song.ramp || 0.25, mv = movesOf(song, theme), pts = [], prev = null;
    for (var b = 0; b < song.bars; b++) {
      var id = secId(song, b), v = lift[id] || 0;
      if (prev === null) { pts.push([0, v]); prev = v; continue; }
      if (v === prev) continue;
      var m = mv[id] || {}, end = b + 1, last = pts[pts.length - 1][0];
      while (end < song.bars && secId(song, end) === id) end++;
      var land = m.land != null ? m.land : 1, grow = Math.max(0, Math.min(m.grow || 0, end - b - 0.25)), at = prev + (v - prev) * land;
      // going down, the level eases off over the last beat(s) of the louder section; going up, it waits for the new
      // section's downbeat and moves in a few tens of milliseconds there, where the entrance covers it. Ramping up
      // before the bar line lifted the end of the quieter section - its riser's crest most of all - into an audible
      // swell just before each drop (song 2 at 0:31, by about 7 dB).
      if (v < prev) { var e = Math.min(m.ease != null ? m.ease : ramp, b - last - 0.01); pts.push([b - e, prev]); pts.push([b, grow ? at : v]); }
      else { pts.push([b, prev]); pts.push([b + 0.06, grow ? at : v]); }
      if (grow) for (var k = 1; k <= Math.ceil(grow * 4); k++) { var f = Math.min(1, k / (grow * 4)); pts.push([b + 0.06 + (grow - 0.06) * f, at + (v - at) * f]); }
      prev = v;
    }
    pts.push([song.bars, prev]);
    var flat = song["flat_" + theme];
    return flat ? withFlat(pts, flat, song.bars) : pts;
  }
  // song["flat_" + theme]: one level correction per bar (dB), measured and written by soundtrack-lab/flatten.py so that
  // every bar of the song sits at the same loudness from the first bar to the last (the user: "the volume at the
  // beginning must be the same throughout to the end"). An instrument coming in makes its bar a little louder; the
  // correction takes the rest of the mix down by as much, so the arrival is heard as colour, not as volume. Each bar's
  // value moves in over the first eighth of the bar, where its downbeat covers the change - never before the bar line.
  function withFlat(pts, flat, bars) {
    var fv = function (x) {
      var b = Math.floor(x), f = x - b, cur = flat[Math.min(b, flat.length - 1)] || 0, was = b > 0 ? flat[Math.min(b - 1, flat.length - 1)] || 0 : cur;
      return f >= 0.125 ? cur : was + (cur - was) * (f / 0.125);
    };
    var xs = pts.map(function (p) { return p[0]; });
    for (var b = 0; b < bars; b++) xs.push(b, b + 0.125);
    xs.sort(function (a, c) { return a - c; });
    var out = [];
    xs.forEach(function (x) { if (!out.length || x > out[out.length - 1][0] + 1e-6) out.push([x, dynAt(pts, x) + fv(x)]); });
    return out;
  }
  // the kit's velocity while a section with moves[id].drums grows in: from `from` at its first bar to 1 after `drums`
  // bars. And when the section after this one has moves[next].fade, the kit thins out over this section's last `fade`
  // bars to `to` (default 0.3) of its velocity, so a quieter section isn't a switch either. It reads the track's own
  // step (o.s), so it works the same inside the director's cut, which plays other songs' bars.
  function entryV(o) {
    var song = o.song; if (!song.sec || (!song.moves && !song["moves_" + o.theme])) return 1;
    var bar = Math.floor(o.s / 16), mv = movesOf(song, o.theme), pos = o.s / 16, v = 1;
    if (bar >= song.bars) return 1;
    var id = song.sec(bar).id, m = mv[id], s0 = secStart(song, bar), end = bar + 1;
    if (m && m.drums) { var k = (pos - s0) / m.drums, from = m.from != null ? m.from : 0.35; if (k < 1) v *= from + (1 - from) * k; }
    while (end < song.bars && song.sec(end).id === id) end++;
    var n = end < song.bars ? mv[song.sec(end).id] : null;
    if (n && n.fade && end - pos <= n.fade) { var to = n.to != null ? n.to : 0.3; v *= to + (1 - to) * ((end - pos) / n.fade); }
    return v;
  }
  function dynAt(pts, bar) {
    if (bar <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) if (bar <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * ((bar - a[0]) / Math.max(0.0001, b[0] - a[0])); }
    return pts[pts.length - 1][1];
  }
  function scheduleDyn(o, t) {
    var song = o.song;
    if (!o.dyn || !(song.sec || song.part)) return;
    var trim = o.trim != null ? o.trim : (song.level && song.level[o.theme]) || 0;   // a bonus track's makeSky level
    var cache = song.dynBy || (song.dynBy = {}), pts = cache[o.theme] || (cache[o.theme] = dynFromSections(song, o.theme)), g = o.dyn.gain, barLen = o.six * 16, base = Math.pow(10, trim / 20), bar0 = o.s / 16;
    var lvl = function (d) { return base * Math.pow(10, d / 20); };
    // seconds from bar0 to a (fractional) bar: a tempo-mapped track (the director's cut) reads its own step times
    var tm = song.tempo ? stepTimes(o.theme, o.si) : null, last = tm ? tm.length - 1 : 0;
    var secsTo = function (bar) {
      if (!tm) return (bar - bar0) * barLen;
      var s = bar * 16, i = Math.min(last, Math.floor(s)), j = Math.min(last, i + 1);
      return tm[i] + (tm[j] - tm[i]) * (s - Math.floor(s)) - tm[Math.min(last, o.s)];
    };
    g.cancelScheduledValues(t); g.setValueAtTime(lvl(dynAt(pts, bar0)), t);
    pts.forEach(function (p) { if (p[0] > bar0) g.linearRampToValueAtTime(lvl(p[1]), t + secsTo(p[0])); });
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
    env(g, t, 0.01, 0.55, 0.13 * v * BAL.bass); s.connect(g); g.connect(o.bus);
  }
  function rumble(o, t, v) {   // the techno rumble: a low, distorted thump in the gap after the kick
    var s = osc("sine", 54, t, t + 0.32), lp = filt("lowpass", 170, 0.8), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    env(g, t, 0.012, 0.2, 0.26 * v); s.connect(lp); lp.connect(g); g.connect(o.drums); send(o, g, 0.3);
  }
  // lv: 0 none, 1 light, 2 groove, 3 full. opt: four (a kick every beat), back (a backbeat), fill (the last beat
  // of a section), v (overall velocity, so a kit can grow in across a section instead of arriving at full weight)
  // Golden's trance gate: with the full kit the pads chop in 16ths, set per step so it stays on the beat
  var GATE16 = [1, 0.3, 0.75, 0.3];
  function synthGate(o, t, st, on) {
    if (!o.P.synth || !o.padTrem) return;
    if (on) o.padTrem.gain.setTargetAtTime(GATE16[st % 4], t, 0.004);
    else if (o.gated) o.padTrem.gain.setTargetAtTime(1, t, 0.02);
    o.gated = !!on;
  }
  function kit(o, t, st, bar, lv, opt) {
    opt = opt || {};
    synthGate(o, t, st, lv >= 3);
    if (!lv) return;
    var style = o.P.style, fill = opt.fill && st >= 12, six = o.six, V = (opt.v != null ? opt.v : 1) * entryV(o);
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
  // (one square per note, not a full stab: on top of a K-pop drop every oscillator counts - measured, the stab version crackled)
  function chop(o, t, st, notes) {
    if (o.P.style !== "kpop" || [3, 6, 11, 14].indexOf(st) < 0) return;
    var dest = inlet(o, "stabIn", 2600), g = gain(0), l = o.six * 0.6, stop = t + l + 0.2;
    env(g, t, 0.002, l + 0.08, 0.05);
    notes.forEach(function (m) { osc("square", F(o, m + 12), t, stop).connect(g); });
    g.connect(seat(o, dest, st % 2 ? 0.5 : -0.5));
  }
  // high sines swelling in and out, far away: atmosphere, not a part
  function glass(o, t, notes, len, vol) {
    var dest = inlet(o, "keysIn", 3200), g = gain(0), stop = t + len + 1.8;
    swell(g, t, len * 0.5, len * 0.5, 1.6, vol);
    notes.forEach(function (m, i) { osc("sine", F(o, m), t, stop, i % 2 ? 4 : -4).connect(g); });
    g.connect(seat(o, dest, 0.3));
  }

  /* ---------- the original songs' material ----------
   * No longer played as songs: Ring Zero's hook (RZ.lead) runs through the five new songs and the director's cut,
   * and the original epilogue's chords and melody (EC) are the new epilogue's heart. */
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
    // two lines of its own, so the hook is kept for the moments that state it. [16th of the 8-bar phrase, note, length]
    // lift (the break): a slow trance line that leans on the 9ths - F# over Em, D over C, B over Am - and rises into B7
    lift: [[0, 78, 6], [6, 76, 2], [8, 71, 8], [16, 74, 4], [20, 76, 4], [24, 79, 8], [32, 79, 6], [38, 76, 2], [40, 74, 8],
           [48, 72, 4], [52, 74, 4], [56, 76, 8], [64, 76, 6], [70, 72, 2], [72, 71, 8], [80, 69, 8], [88, 72, 4], [92, 76, 4],
           [96, 78, 8], [104, 75, 4], [108, 78, 4], [112, 81, 8], [120, 78, 8]],
    // soar (the drive's first half): higher and quicker, climbing to the major seventh over C and the ninth over Am
    soar: [[0, 79, 4], [4, 81, 4], [8, 83, 6], [14, 81, 2], [16, 79, 8], [24, 78, 4], [28, 76, 4], [32, 84, 4], [36, 83, 2], [38, 79, 2],
           [40, 76, 4], [44, 79, 4], [48, 74, 8], [56, 76, 4], [60, 79, 4], [64, 81, 4], [68, 79, 2], [70, 76, 2], [72, 72, 4], [76, 76, 4],
           [80, 83, 12], [92, 81, 4], [96, 78, 4], [100, 75, 4], [104, 71, 4], [108, 75, 4], [112, 78, 8], [120, 83, 8]],
    // rise / soar (new, bars 32-47): C D Em B (VI VII i V) and a melody that climbs over it - no hook in it
    up: [{ r: 36, tri: [48, 52, 55] }, { r: 38, tri: [50, 54, 57] }, { r: 40, tri: [52, 55, 59] }, { r: 35, tri: [47, 51, 54] }],
    upm: [[0, 72, 4], [4, 76, 4], [8, 79, 6], [14, 76, 2], [16, 74, 4], [20, 72, 4], [24, 71, 8],
          [32, 74, 4], [36, 78, 4], [40, 81, 6], [46, 78, 2], [48, 79, 8], [56, 78, 4], [60, 74, 4],
          [64, 76, 6], [70, 79, 2], [72, 83, 8], [80, 81, 4], [84, 79, 4], [88, 76, 8],
          [96, 75, 6], [102, 78, 2], [104, 83, 8], [112, 81, 4], [116, 78, 4], [120, 75, 8]],
    sec: function (bar) {
      if (bar < 8) return { id: "boot", arp: 1, arpCut: 900 + bar * 100, pulse: bar >= 4, mix: { arp: 2.6 } };
      if (bar < 16) return { id: "pulse", arp: 1, arpCut: 1700, bass: 1, fuzz: 900, drums: bar >= 12 ? 1 : 0, kv: 0.7, fill: bar === 15, drop: bar === 15, mix: { arp: 2.2, fuzz: 1.2 } };
      if (bar < 32) return { id: "theme", arp: 1, arpCut: 2100, bass: 1, fuzz: 1400, drums: bar < 24 ? 1 : 2, stab: 1, lead: bar >= 24, crash: bar === 16 || bar === 24, fill: bar === 23 || bar === 31, mix: { arp: 1.3 } };
      // rise: the new melody alone over a lighter groove and a string bed; soar: both leads, the full kit, the stabs
      if (bar < 40) return { id: "rise", up: 1, arp: 0.85, arpCut: 2000, bass: 1, fuzz: 1300, drums: 2, lead: 1, pad: 1, crash: bar === 32, fill: bar === 39, mix: { arp: 1.3, fuzz: 0.8 } };
      if (bar < 48) return { id: "soar", up: 1, arp: 1, arpCut: 2600, bass: 2, fuzz: 2000, drums: 3, stab: 2, lead: 1, both: 1, crash: bar === 40 || bar === 44, fill: bar === 47, mix: { arp: 1.3 } };
      if (bar < 56) return { id: "break", arp: 0.6, arpCut: 900, pad: 1, lead: 1, sub: 1, riser: bar === 52, roll: bar >= 54, drop: bar === 55, mix: { arp: 1.3 } };
      if (bar < 72) return { id: "drive", arp: 1, arpCut: 2700, bass: 2, fuzz: 2100, drums: 3, stab: 2, lead: 1, pad: bar >= 64, crash: bar === 56 || bar === 64, fill: bar === 63 || bar === 71, mix: { arp: 1.3 } };
      return { id: "decay", arp: 1, arpCut: 2100 - (bar - 72) * 200, bass: 1, fuzz: 1300 - (bar - 72) * 100, drums: 0, pad: 1, mix: { arp: 1.3 } };
    }
  };

  /* ---------- 2 · the horror scene ---------- */
  var H2 = {
    cl: [[64, 65, 71], [63, 64, 70], [65, 66, 72], [64, 65, 70]],   // E-F-B clusters, slipping a semitone
    walk: [40, 40, 41, 40, 40, 40, 41, 43],                        // the bass creeps up on you
    hunt: [0, null, null, 0, null, null, 1, null, 0, null, 0, null, null, 1, null, null],
    found: [null, null, 0, 12, null, null, 0, null, null, null, 0, 12, null, null, 0, 1],
    // a lullaby on a music box that has been in the dark too long: up to G, a fall to B, then it creeps round A#
    box: [[0, 0, 76, 4], [0, 4, 79, 4], [0, 8, 78, 6], [0, 14, 71, 2], [1, 0, 72, 6], [1, 6, 71, 2], [1, 8, 70, 4], [1, 12, 71, 4]],
    // a piano somewhere else in the house: the semitone the whole song is built on, far away
    far: [[2, 8, 77], [3, 0, 76], [6, 4, 77], [7, 12, 76]],
    // the chase (new, bars 32-47): Em C Am B, and a lead in E harmonic minor - the D# is what makes it run
    run: [{ r: 40, tri: [52, 55, 59] }, { r: 36, tri: [48, 52, 55] }, { r: 33, tri: [45, 48, 52] }, { r: 35, tri: [47, 51, 54] }],
    runm: [[0, 71, 4], [4, 72, 2], [6, 71, 2], [8, 76, 6], [14, 75, 2], [16, 76, 8], [24, 79, 4], [28, 78, 4],
           [32, 76, 4], [36, 79, 2], [38, 76, 2], [40, 72, 8], [48, 71, 4], [52, 72, 4], [56, 74, 8],
           [64, 72, 4], [68, 76, 4], [72, 81, 8], [80, 79, 4], [84, 76, 4], [88, 72, 8],
           [96, 75, 4], [100, 78, 4], [104, 81, 4], [108, 78, 4], [112, 75, 8], [120, 71, 8]],
    runBass: [0, null, 0, 12, 0, null, 0, 12, 0, null, 0, 12, 0, 7, 0, 12],
    sec: function (bar) {
      if (bar < 8) return { id: "dark room", heart: 1, cluster: bar % 4 === 0, trem: 0.2, sub: 0.09, drone: 1, far: 1 };
      if (bar < 16) return { id: "something moves", heart: 2, cluster: bar % 2 === 0, trem: 0.3, bass: "walk", fuzz: 380, sub: 0.11, drone: 1, glass: bar % 4 === 2, riser: bar === 12 };
      if (bar < 32) return { id: "it hunts", cluster: bar % 2 === 0, trem: 0.42, bass: "hunt", fuzz: 650, drums: bar < 24 ? 1 : 2, screech: bar % 4 === 2, stab: bar % 2 === 1, sub: 0.13, fill: bar === 31, drone: 0.6 };
      // the chase: running, with a tune - the lead over the pulse and a lighter kit, then the octave doubles and the kit fills out
      if (bar < 40) return { id: "the chase", run: 1, trem: 0, fuzz: 800, drums: 2, sub: 0.12, crash: bar === 32, arpCut: 1300 + (bar - 32) * 80 };
      if (bar < 48) return { id: "cornered", run: 2, trem: 0.25, fuzz: 1100, drums: 3, sub: 0.14, crash: bar === 40, screech: bar === 42 || bar === 46, riser: bar === 44, fill: bar === 47, arpCut: 2200 };
      if (bar < 56) return { id: "hide", heart: 3, box: 1, glass: bar % 4 === 0, drone: 1, far: 1, sub: 0.07, trem: 0, riser: bar === 52, drop: bar === 55 };
      if (bar < 72) return { id: "found", cluster: bar % 2 === 0, trem: 0.45, bass: "found", fuzz: 950, drums: 3, screech: bar % 4 === 0, stab: bar % 2 === 0, sub: 0.14, crash: bar === 64 };   // no cymbal on the drop itself: the kit growing in is the arrival
      return { id: "black", heart: 4, sub: 0.04, trem: 0, last: bar === 72, drone: 0.7 };
    }
  };
  // the chase (song 2): a pulse in 16ths, an 8th-note fuzz bass, and the harmonic-minor lead
  function darkRun(o, t, st, bar, sec, c) {
    var six = o.six, pos = (bar % 8) * 16 + st;
    if (st === 0) {
      tremTo(o, t, sec.trem || 0, 9);
      sweep(o, "arpF", sec.arpCut, t, 0.6);
      sweep(o, "fuzzF", sec.fuzz, t, 0.4);
      sweep(o, "padF", 2200, t, 0.8);
      o.sub.set(t, c.r - 12, sec.sub);
      if (bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, sec.run === 2 ? 0.045 : 0.035, { a: six * 4, r: 1.4 });
      if (sec.crash) crash(o, t, 0.45);
      if (sec.riser) riser(o, t, six * 64, 0.06);
      if (sec.screech) scr(o, t, 76 + (bar % 3), six * 10, 0.035, bar % 4 < 2 ? -0.7 : 0.7);
    }
    parp(o, t, [c.tri[0] + 12, c.tri[1] + 12, c.tri[2] + 12, c.tri[1] + 24][[0, 1, 2, 3, 2, 1, 2, 3][st % 8]], st % 4 === 0 ? 0.95 : 0.65, six * 0.6, st % 2 ? 0.5 : -0.5);
    var n = H2.runBass[st];
    if (n !== null && !(sec.fill && st >= 12)) fz(o, t, c.r + n, st % 4 === 0 ? 1 : 0.7, six * 0.8);
    kit(o, t, st, bar, sec.drums, { four: true, back: true, fill: sec.fill });
    if (sec.run === 2) chop(o, t, st, c.tri);
    H2.runm.forEach(function (m) {
      if (m[0] !== pos) return;
      o.la.play(t, m[1], m[2] * six, sec.run === 2 ? 0.08 : 0.072);
      if (sec.run === 2) o.lb.play(t, m[1] - 12, m[2] * six, 0.05);
    });
  }

  /* ---------- 3 · the character study ---------- */
  var C3 = {
    ch: [{ r: 40, tri: [52, 55, 59] }, { r: 36, tri: [48, 52, 55] }, { r: 43, tri: [50, 55, 59] }, { r: 38, tri: [50, 54, 57] }],
    // the character's theme: an arch up to E and back, then it climbs, bar by bar, into G and D
    mel: [[0, 0, 67, 4], [0, 4, 71, 4], [0, 8, 76, 6], [0, 14, 74, 2], [1, 0, 71, 8], [1, 8, 69, 4], [1, 12, 67, 4],   // its own opening, not the hook
          [2, 0, 72, 6], [2, 6, 71, 2], [2, 8, 67, 8], [3, 0, 64, 8], [3, 8, 67, 8],
          [4, 0, 74, 6], [4, 6, 72, 2], [4, 8, 71, 8], [5, 0, 67, 4], [5, 4, 71, 4], [5, 8, 74, 8],
          [6, 0, 78, 6], [6, 6, 76, 2], [6, 8, 74, 8], [7, 0, 74, 8], [7, 8, 69, 8]],
    // the left hand walks up through the D chord at the end of a phrase, so each section is stepped into
    walkup: [[8, 50], [10, 54], [12, 57], [14, 62]],
    arp: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2],
    roll: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
    // the skyline (new, bars 48-63): C G D Em (VI III VII i), the character looking out instead of in, with a melody of its own
    sky: [{ r: 36, tri: [48, 52, 55] }, { r: 43, tri: [50, 55, 59] }, { r: 38, tri: [50, 54, 57] }, { r: 40, tri: [52, 55, 59] }],
    skym: [[0, 0, 79, 6], [0, 6, 76, 2], [0, 8, 72, 4], [0, 12, 76, 4], [1, 0, 74, 6], [1, 6, 76, 2], [1, 8, 79, 8],
           [2, 0, 83, 6], [2, 6, 81, 2], [2, 8, 79, 4], [2, 12, 74, 4], [3, 0, 76, 6], [3, 6, 74, 2], [3, 8, 71, 8],
           [4, 0, 78, 6], [4, 6, 79, 2], [4, 8, 81, 8], [5, 0, 83, 4], [5, 4, 81, 4], [5, 8, 78, 8],
           [6, 0, 79, 6], [6, 6, 78, 2], [6, 8, 76, 8], [7, 0, 71, 4], [7, 4, 74, 4], [7, 8, 76, 8]],
    sec: function (bar) {
      // the opening adds a part at a time - the strings under the piano, then the pulse, then the bass, then the kick -
      // each one at its own full level from its first note (the user: a part that starts low and rises reads as the
      // whole song getting louder); flat_<theme> holds the volume while they arrive
      if (bar < 8) return { id: "3 AM", piano: bar < 4 ? 2.5 : 2, pad: bar >= 4 ? 0.035 : 0, walk: bar === 7, mix: { pad: bar >= 4 ? 0.75 : 0.0001, arp: 0.0001 } };
      if (bar < 16) return { id: "memory", piano: 1.6, pad: 0.035, arp: 0.6, arpCut: 640, sub: 0.06, walk: bar === 15, mix: { arp: 0.6 } };
      if (bar < 32) return { id: "the climb", piano: 0.85, pad: 0.04, arp: 0.85, arpCut: 1700, drums: bar >= 26 ? 1 : 0, kv: 0.7, bass: bar >= 22 ? 1 : 0, roll: bar >= 28, riser: bar === 28, sub: 0.09, drop: bar === 31, mix: { fuzz: 0.8 } };
      if (bar < 48) return { id: "release", piano: 0.55, pad: 0.05, arp: 1, arpCut: 3400, drums: bar < 40 ? 2 : 3, bass: 1, lead: 1, sub: 0.12, crash: bar === 32 || bar === 40 };
      // the skyline: half the kit, the new melody on one lead with the piano answering; open sky: everything, both leads
      if (bar < 56) return { id: "skyline", sky: 1, pad: 0.045, arp: 0.8, arpCut: 2200, drums: 2, bass: 1, sub: 0.1, crash: bar === 48 };
      if (bar < 64) return { id: "open sky", sky: 2, pad: 0.05, arp: 1, arpCut: 3600, drums: 3, bass: 2, sub: 0.13, crash: bar === 56 || bar === 60 };
      if (bar < 72) return { id: "the truth", slow: 1, pad: 0.04, arp: 0.5, arpCut: 900, sub: 0.05, riser: bar === 68, roll: bar >= 70, drop: bar === 71 };
      if (bar < 92) return { id: "becoming", piano: 0.55, pad: 0.055, arp: 1, arpCut: 3800, drums: 3, bass: 2, lead: 2, sub: 0.13, crash: bar === 72 || bar === 80 || bar === 88 };
      return { id: "after", piano: 1, pad: 0.035, arp: 0.6, arpCut: 1400 - (bar - 92) * 200, sub: 0.05 };
    }
  };

  /* ---------- 4 · the battle of wits ---------- */
  var B4 = {
    ch: [{ r: 40, tri: [52, 55, 59] }, { r: 36, tri: [48, 52, 55] }, { r: 33, tri: [45, 48, 52] }, { r: 35, tri: [47, 51, 54] }],
    // two people: A asks (E D G), B answers (B C G), then they push each other higher
    duel: [
      ["a", [[0, 76, 3], [3, 74, 3], [6, 79, 6]]],
      ["b", [[0, 71, 3], [3, 72, 3], [6, 67, 6]]],
      ["a", [[0, 74, 2], [2, 72, 2], [4, 71, 4], [8, 67, 4]]],
      ["b", [[0, 69, 2], [2, 71, 2], [4, 72, 4], [8, 76, 4]]],
      ["a", [[0, 76, 3], [3, 74, 3], [6, 71, 2], [8, 69, 2], [10, 67, 6]]],
      ["b", [[0, 78, 3], [3, 76, 3], [6, 75, 2], [8, 71, 6]]],
      ["a", [[0, 71, 2], [2, 74, 2], [4, 76, 2], [6, 79, 6]]],
      ["b", [[0, 78, 2], [2, 76, 2], [4, 75, 2], [6, 76, 10]]]
    ],
    typeA: [0, 3, 5, 6, 9, 12, 13], typeB: [1, 2, 7, 8, 10, 14, 15],
    // liquid (new, bars 48-71): Cmaj7 D6 Em9 Bm7, Rhodes-style chords on the offbeats and a lead that sings instead of fights
    lq: [{ r: 36, tri: [48, 52, 55, 59] }, { r: 38, tri: [50, 54, 57, 59] }, { r: 40, tri: [52, 55, 59, 66] }, { r: 35, tri: [47, 50, 54, 57] }],
    lqm: [[0, 79, 4], [4, 76, 4], [8, 71, 8], [16, 72, 4], [20, 74, 4], [24, 76, 8],
          [32, 78, 4], [36, 81, 4], [40, 83, 6], [46, 81, 2], [48, 78, 12], [60, 74, 4],
          [64, 76, 4], [68, 78, 4], [72, 79, 8], [80, 83, 4], [84, 79, 4], [88, 78, 8],
          [96, 74, 4], [100, 78, 4], [104, 81, 8], [112, 78, 8], [120, 74, 4], [124, 71, 4]],
    sec: function (bar) {
      if (bar < 8) return { id: "login", type: 1, pad: 0.03, sub: 0.08 };
      if (bar < 16) return { id: "handshake", type: 1, pad: 0.03, hats: 1, drums: "soft", sub: 0.12, duel: 2, riser: bar === 12, drop: bar === 15 };
      if (bar < 48) return { id: "exploit", drums: "full", reese: 1, duel: 2, hats: 2, stab: bar % 8 === 0, sub: 0.18, crash: bar === 16 || bar === 32 };
      // liquid: the fight stops for a moment and the two of them sing, one voice then a harmony; rush: back in, both an octave apart
      if (bar < 64) return { id: "liquid", lq: 1, drums: "liquid", reese: 0.45, pad: 0.035, sub: 0.14, crash: bar === 48 };
      if (bar < 72) return { id: "rush", lq: 2, drums: "full", hats: 2, ride: 1, reese: 0.8, sub: 0.18, crash: bar === 64 || bar === 68 };
      if (bar < 80) return { id: "stalemate", drums: "half", pad: 0.04, unison: 1, reese: 0.6, sub: 0.1, glitch: bar % 2 === 1, riser: bar === 76, drop: bar === 79 };
      if (bar < 112) return { id: "root", drums: "full", ride: 1, reese: 1, duel: 1, hats: 2, stab: bar % 4 === 0, sub: 0.2, crash: bar === 80 || bar === 96 };
      return { id: "logout", type: 1, pad: 0.03, drums: bar < 116 ? "half" : null, sub: 0.07, reese: bar < 116 ? 0.5 : 0 };
    }
  };
  // liquid (song 4): offbeat chords on the keys, a lazy strum, then the melody - one voice, a harmony, then the octave
  function liquid(o, t, st, bar, sec, c) {
    var six = o.six, pos = (bar % 8) * 16 + st;
    if (st === 0) sweep(o, "padF", 2400, t, 1);
    if (sec.lq === 1 && (st === 0 || st === 6 || st === 10)) c.tri.forEach(function (m, i) { keys(o, t + i * 0.012, m + 12, st ? 0.22 : 0.3, six * (st === 6 ? 3 : 5)); });
    B4.lqm.forEach(function (n) {
      if (n[0] !== pos) return;
      o.la.play(t, n[1], n[2] * six, sec.lq === 2 ? 0.08 : 0.07);
      if (sec.lq === 2 || bar % 16 >= 8) o.lb.play(t, sec.lq === 2 ? n[1] - 12 : dia(n[1], -2), n[2] * six, 0.05);   // a third under, then the octave
    });
  }

  /* ---------- 5 · the epilogue ----------
   * Closer to the original epilogue: its chords (EC.chords, G D/F# Em C Am G/B C D) and its melody (EC.mel)
   * are the heart of it, played on the new instruments. Around them, sadness with hope inside it: the
   * grief section sighs downward over Am, Em, C and C minor (the minor iv, the saddest chord in the song),
   * but every second bar the line turns back up; and the end is the hook resolved to G, not to E. */
  var E5 = {
    sorrow: [[40, 0, 40], [36, 1, 36], [33, 0, 45], [35, 1, 47]],                                           // Em C Am B  ([root, major?, bass])
    grief: [[45, 0, 45], [40, 0, 40], [48, 1, 36], [48, 0, 36], [43, 1, 43], [47, 0, 47], [45, 0, 45], [47, 1, 47]],   // Am Em C Cm G Bm Am B
    light: [[43, 1, 43], [48, 0, 36], [43, 1, 43], [50, 1, 38], [43, 1, 43], [43, 1, 43]],                    // G Cm G D G G
    hook: [[0, 0, 67, 8], [0, 8, 71, 8], [1, 0, 76, 12], [1, 12, 74, 4], [2, 0, 72, 8], [2, 8, 71, 8], [3, 0, 71, 16]],   // ashes: G B E, a sigh down to B (the hook waits for the end)
    // falling sighs, and in the second half of each pair the line climbs again - the hope inside the sadness
    sigh: [[0, 0, 72, 8], [0, 8, 71, 8], [1, 0, 67, 8], [1, 8, 71, 4], [1, 12, 74, 4], [2, 0, 76, 8], [2, 8, 74, 8], [3, 0, 75, 8], [3, 8, 74, 8],
           [4, 0, 74, 6], [4, 6, 76, 2], [4, 8, 79, 8], [5, 0, 78, 8], [5, 8, 74, 8], [6, 0, 72, 8], [6, 8, 76, 8], [7, 0, 78, 8], [7, 8, 75, 8]],
    // the last bars: the hook again, but it ends on G instead of E, and then a line that rises
    home: [[0, 0, 71, 8], [0, 8, 69, 8], [1, 0, 67, 16], [3, 0, 74, 4], [3, 4, 79, 4], [3, 8, 83, 8]],
    arp: [0, 1, 2, 3, 2, 1, 0, 2],   // Ring Zero's pulse at half speed, remembered
    // letters (new, bars 32-39): C D Bm Em Am D G G, a chord a bar, and a tune that reaches up at the end of every phrase
    letters: [[36, 1, 36], [38, 1, 38], [35, 0, 35], [40, 0, 40], [33, 0, 45], [38, 1, 38], [43, 1, 43], [43, 1, 43]],
    lmel: [[0, 0, 76, 4], [0, 4, 79, 4], [0, 8, 84, 8], [1, 0, 81, 6], [1, 6, 78, 2], [1, 8, 74, 8], [2, 0, 78, 4], [2, 4, 79, 4], [2, 8, 83, 8], [3, 0, 79, 8], [3, 8, 76, 8],
           [4, 0, 76, 4], [4, 4, 81, 4], [4, 8, 84, 8], [5, 0, 83, 6], [5, 6, 81, 2], [5, 8, 78, 8], [6, 0, 79, 4], [6, 4, 83, 4], [6, 8, 86, 8], [7, 0, 83, 16]],
    sec: function (bar) {
      if (bar < 8) return { id: "ashes", ch: "sorrow", hook: 0.9, bin: 0.03, bed: 0.045, str: 0.03, cello: 0.04, lh: 0.45, padCut: 1100 };   // louder than it was: a lone piano held the song's level only with a 12 dB boost
      if (bar < 16) return { id: "what remains", ch: "ec", arpeggio: 0.3, cello: 0.045, str: 0.03, sub: 0.04, bin: 0.02, padCut: 1200 };
      if (bar < 24) return { id: "remember", ch: "ec", mel: 0, mv: 0.05, arpeggio: 0.25, cello: 0.05, str: 0.035, pulse: 0.45, pulseCut: 750, sub: 0.06, padCut: 1600 };
      if (bar < 32) return { id: "grief", ch: "grief", sigh: 1, arpeggio: 0.25, cello: 0.05, str: 0.04, pulse: 0.35, pulseCut: 650, sub: 0.06, padCut: 1400 };
      // letters: the piano finds a tune in G; the strings, the pulse and one swell of horns join it one by one
      if (bar < 40) return { id: "letters", ch: "letters", letters: 1, cello: 0.045, str: bar >= 34 ? 0.035 : 0, bed: bar < 34 ? 0.02 : 0, pulse: bar >= 36 ? 0.4 : 0, pulseCut: 1100, sub: 0.06, padCut: 1800, brass: bar === 38 };
      if (bar < 50) return { id: "the weight lifts", ch: "ec", mel: 12, mv: 0.045, arpeggio: 0.3, cello: 0.055, str: 0.05, brass: bar === 40 || bar === 44 || bar === 48, pulse: 0.6, pulseCut: 1500, sub: 0.08, padCut: 2400 };
      return { id: "last light", ch: "light", home: 1, str: 0.04, cello: 0.045, pulse: bar < 52 ? 0.3 : 0, pulseCut: 900, sub: 0.05, padCut: 1600, last: bar === 55 };
    }
  };
  var EPI_CUT = {   // the long epilogue, kept for the director's cut's dawn (the song is SONG_EPI below)
    flat_golden: [11.8, 11.8, 12.0, 12.0, 12.0, 11.9, 12.0, 12.0, 4.2, 4.1, 5.0, 6.5, 4.6, 4.3, 5.5, 6.0, -0.1, -0.6, -0.0, -0.0, -1.5, -0.9, 0.0, -0.0, -1.8, -1.6, -1.1, -0.6, -1.1, -1.7, -2.4, -2.3, 4.7, 5.9, 4.5, 3.2, -0.8, 0.3, -1.5, -1.2, -3.5, -3.7, -3.0, -1.6, -4.0, -4.2, -2.0, -2.7, -4.3, -3.9, 1.7, 2.7, 1.9, 1.8, 2.4, 2.9],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [12.0, 12.0, 12.0, 12.0, 12.0, 11.8, 12.0, 12.0, 6.7, 6.0, 5.9, 7.1, 5.5, 5.0, 7.3, 6.3, -1.1, -1.3, -0.5, 0.4, -0.9, -1.8, -0.6, -0.7, -1.6, -1.0, -0.3, -0.4, -0.7, -1.4, -0.9, -1.4, 5.2, 6.3, 4.9, 3.3, -0.9, 0.3, -2.2, -1.3, -3.7, -4.2, -3.5, -2.9, -4.8, -4.3, -2.0, -2.1, -4.8, -4.6, 2.0, 3.2, 3.3, 2.5, 3.5, 3.3],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 6.3, 5.0, 6.0, 5.4, 4.6, 4.5, 7.0, 6.3, 0.0, -0.9, -0.3, -0.8, -1.3, -0.8, 0.3, -0.0, -1.4, -1.0, -0.9, -1.6, -1.5, -2.0, -1.4, -1.3, 4.6, 6.0, 4.7, 1.7, -0.9, -0.1, -1.7, -1.5, -3.4, -3.9, -2.8, -3.1, -4.3, -4.5, -1.6, -2.3, -3.9, -4.0, 1.8, 1.8, 2.5, 2.2, 3.3, 3.2],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "the epilogue · sadness with hope in it, 432 Hz, strings and a last look back", bpm: 60, bars: 56, ref: 432, v2: true, duckDepth: 0.6, sec: E5.sec,
    trim: { "phthalo": 10.2, "knight": 10.7, "golden": 8.9 },
    lift_golden: { "ashes": 0.0, "what remains": 0.0, "remember": 0.0, "grief": 0.0, "letters": 0.0, "the weight lifts": 0.0, "last light": 0.0 },
    lift_knight: { "ashes": 0.0, "what remains": 0.0, "remember": 0.0, "grief": 0.0, "letters": 0.0, "the weight lifts": 0.0, "last light": 0.0 },
    lift_phthalo: { "ashes": 0.0, "what remains": 0.0, "remember": 0.0, "grief": 0.0, "letters": 0.0, "the weight lifts": 0.0, "last light": 0.0 },
    ramp: 1, tone: { sub: -1.5, punch: 1, pres: 3 },
    init: function (o, t) { o.sub = makeSub(o, t); o.bin = makeBinaural(o, t, 108, 2.5, 0.02); },
    play: function (o, t, st, bar) {
      var sec = E5.sec(bar), six = o.six, cc;
      if (sec.ch === "ec") { var e = EC.chords[bar % 8]; cc = [e[0] - 12, e[1], e[2]]; }   // EC.chords sit an octave up: [chord root, major?, bass]
      else if (sec.ch === "grief") cc = E5.grief[(bar - 24) % 8];
      else if (sec.ch === "letters") cc = E5.letters[(bar - 32) % 8];
      else if (sec.ch === "light") cc = E5.light[Math.min(5, bar - 50)];
      else cc = E5.sorrow[bar % 4];
      var r = cc[0], tri = triad(r + 12, cc[1]), bass = cc[2];
      if (st === 0) {
        o.bin.level(t, sec.bin || 0.0001);
        o.sub.set(t, bass - 12, sec.sub || 0.0001);
        sweep(o, "padF", sec.padCut, t, 0.2);
        if (sec.pulse) sweep(o, "arpF", sec.pulseCut, t, 0.2);
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
      if (sec.letters) melodyAt(E5.lmel, (bar - 32) % 8, st).forEach(function (n) {
        keys(o, t, n[2], 0.5, n[3] * six * 1.3);
        if (bar >= 36) sm(o, t, [n[2] - 12], n[3] * six, 0.04, { a: 0.3, r: 1.2, w: 0.2 });   // the strings take the tune, an octave under
      });
      if (sec.letters && (st === 4 || st === 10)) keys(o, t, st === 4 ? tri[2] : tri[1] + 12, 0.22, 2.5);
      if (sec.home) E5.home.forEach(function (n) { if (n[0] === bar - 50 && n[1] === st) keys(o, t, n[2], 0.55, n[3] * six * 1.5); });
      if (sec.pulse && st % 2 === 0) parp(o, t, [tri[0], tri[1], tri[2], tri[0] + 12][E5.arp[st / 2]], sec.pulse, six * 1.6, st % 4 ? 0.5 : -0.5);
    }
  };

  /* ---------- the motif-only songs: forms and voices ----------
   * Every song (and bonus track) is its motif and nothing else: one melody, said again and again, each time by a
   * different voice or two, with the band around it. A song's form is a list of sections, [id, bars, props], where
   * props may be a function of k (the bar inside the section); sec(bar) gives the props plus id, k, n (the section's
   * length) and from (its first bar). A section with half: 1 plays the motif at half speed, over twice the bars. */
  function form(list) {
    var at = [], total = 0;
    list.forEach(function (s) { at.push(total); total += s[1]; });
    function sec(bar) {
      var i = list.length - 1; while (i > 0 && at[i] > bar) i--;
      var s = list[i], k = bar - at[i], p = typeof s[2] === "function" ? s[2](k, s[1]) : s[2] || {}, o = {};
      for (var key in p) o[key] = p[key];
      o.id = s[0]; o.k = k; o.n = s[1]; o.from = at[i];
      return o;
    }
    sec.bars = total;
    return sec;
  }
  function flat(list) { return list.map(function (n) { return [n[0] * 16 + n[1], n[2], n[3]]; }); }   // [bar, 16th, note, len] → [16th, note, len]
  // the motif's notes that start on this 16th of the section, lengths in 16ths (L: the motif's length in 16ths)
  function motifAt(line, sec, st, L) {
    var h = sec.half ? 2 : 1, p = (sec.k * 16 + st) % (L * h);
    if (p % h) return [];
    return line.filter(function (n) { return n[0] * h === p; }).map(function (n) { return [n[0], n[1], n[2] * h]; });
  }
  function motifBar(sec, L) { return Math.floor(sec.k / (sec.half ? 2 : 1)) % (L / 16); }   // which bar of the motif is sounding
  // the five songs' voices. Each sits in its own register: the motif moves by whole octaves (never note by note) until
  // its lowest note (lo) reaches the voice's floor
  var VOICE_LO = { piano: 62, "piano low": 50, box: 70, fuzz: 38, pulse: 62, lead: 62, "lead high": 74, "lead 2": 62, strings: 60, cello: 48, brass: 48 };
  function sing(o, t, voice, m, len, lo, v) {
    var x = m + 12 * Math.ceil((VOICE_LO[voice] - lo) / 12), a = Math.min(0.5, len * 0.15);
    v = v == null ? 1 : v;
    if (voice === "piano" || voice === "piano low") keys(o, t, x, (voice === "piano" ? 0.7 : 0.6) * v, len * 1.5);
    else if (voice === "box") box(o, t, x, 0.85 * v, len * 1.6, 38);
    else if (voice === "fuzz") fz(o, t, x, 0.85 * v, len * 0.95, true);
    else if (voice === "pulse") parp(o, t, x, 1.1 * v, Math.min(len, o.six * 3));
    else if (voice === "lead" || voice === "lead high") o.la.play(t, x, len, (voice === "lead" ? 0.085 : 0.075) * v);
    else if (voice === "lead 2") o.lb.play(t, x, len, 0.065 * v);
    else if (voice === "strings") sm(o, t, [x], len, 0.055 * v, { a: a, r: 1.2, w: 0 });
    else if (voice === "cello") sm(o, t, [x], len, 0.06 * v, { a: a, r: 1.2, w: 0 });
    else if (voice === "brass") br2(o, t, [x], len, 0.05 * v);
  }
  // the bonus tracks' orchestra, in the same way: low strings, violins, choir, horns
  var ORCH_LO = { cello: 48, violins: 64, choir: 52, horns: 52 };
  function orch(o, t, voice, m, len, lo, v) {
    var x = m + 12 * Math.ceil((ORCH_LO[voice] - lo) / 12);
    v = v == null ? 1 : v;
    if (voice === "cello") strings(o, t, [x], len, 0.05 * v, { a: 0.06, r: 0.5, bright: 0.6 });
    else if (voice === "violins") strings(o, t, [x], len, 0.032 * v, { a: 0.04, r: 0.35, bright: 1.1 });
    else if (voice === "choir") choir(o, t, [x], len, 0.04 * v, { a: 0.08, r: 0.6 });
    else if (voice === "horns") horns(o, t, [x], len * 0.95, 0.075 * v, { pan: 0.1 });
  }
  function orchAll(o, t, sec, line, st, L, lo) {
    if (!sec.voice) return;
    motifAt(line, sec, st, L).forEach(function (n) { sec.voice.forEach(function (x) { orch(o, t, x, n[1], n[2] * o.six, lo, sec.v); }); });
  }
  function singAll(o, t, sec, line, st, L, lo) {
    if (!sec.voice) return;
    motifAt(line, sec, st, L).forEach(function (n) { sec.voice.forEach(function (x) { sing(o, t, x, n[1], n[2] * o.six, lo, sec.v); }); });
  }

  /* ---------- 1 · the theme ----------
   * The hook (RZ.lead, B A G F# G E): the piano alone over the pulse, the fuzz bass, the pulse itself, the lead, the
   * lead with a music box over it, the low strings at half speed in the break, then the drive - lead and strings, two
   * leads in octaves, lead, strings and brass - and the piano again as it all decays. (T1's lines are the cut's.) */
  var RZL = 128, RZLO = 64;
  var R1 = form([
    ["boot", 8, function (k) { return { voice: ["piano"], pad: 1, arp: 0.7, arpCut: 1010, sub: k >= 4 ? 0.05 : 0, lh: 1 }; }],
    ["pulse", 8, function (k) { return { voice: ["fuzz"], arp: 1, arpCut: 1500, fuzz: 1015, sub: 0.1, drums: 1, kv: 0.8, mix: { arp: 1.3, fuzz: 0.75 } }; }],
    ["pulse", 8, function (k) { return { voice: ["pulse", "piano low"], arp: 0.55, arpCut: 1900, fuzz: 1200, bass: 1, sub: 0.1, drums: 1, kv: 0.85, fill: k === 7, drop: k === 7 }; }],
    ["theme", 8, function (k) { return { voice: ["lead"], arp: 1, arpCut: 2100, bass: 1, fuzz: 1400, sub: 0.13, drums: 2, stab: 1, crash: k === 0, fill: k === 7 }; }],
    ["theme", 8, function (k) { return { voice: ["lead", "box"], arp: 1, arpCut: 2300, bass: 1, fuzz: 1500, sub: 0.13, drums: 2, stab: 1, fill: k === 7 }; }],
    ["break", 16, function (k) { return { voice: ["cello"], half: 1, arp: 0.6, arpCut: 900, pad: 1, sub: 0.13, riser: k === 12, roll: k >= 14, drop: k === 15 }; }],
    ["drive", 8, function (k) { return { voice: ["lead", "strings"], arp: 1, arpCut: 2700, bass: 2, fuzz: 2100, sub: 0.13, drums: 3, stab: 2, crash: k === 0, fill: k === 7 }; }],
    ["drive", 8, function (k) { return { voice: ["lead high", "lead 2"], arp: 1, arpCut: 2900, bass: 2, fuzz: 2100, sub: 0.13, drums: 3, stab: 2, pad: 1, crash: k === 0, fill: k === 7 }; }],
    ["drive", 8, function (k) { return { voice: ["lead", "strings", "brass"], arp: 1, arpCut: 2900, bass: 2, fuzz: 2100, sub: 0.13, drums: 3, stab: 2, pad: 1, crash: k === 0, fill: k === 7 }; }],
    ["decay", 8, function (k) { return { voice: ["piano"], arp: 1, arpCut: 1400, bass: k < 4 ? 1 : 0, fuzz: 950, sub: 0.06, pad: 1, lh: 1 }; }]
  ]);
  var SONG_RING = {
    flat_golden: [5.7, 4.4, 4.4, 4.5, 4.3, 4.2, 4.2, 4.4, 0.9, 4.2, 1.5, 4.0, 1.8, 2.2, 1.7, 2.1, 6.7, 8.6, 7.2, 8.9, 7.8, 8.1, 7.5, 7.2, -1.6, 0.4, -0.7, 0.9, -0.3, -0.1, -0.5, -0.2, -1.1, 0.0, -0.9, 0.5, -0.7, -0.7, -1.0, -0.6, 0.1, -0.7, -0.7, 0.2, 0.2, -0.6, -0.5, 0.3, 0.1, -0.0, 0.3, 0.4, 0.4, -0.3, -1.0, -3.4, -3.0, -1.5, -2.5, -1.1, -2.1, -2.1, -2.6, -2.0, -3.4, -2.1, -3.2, -1.8, -3.0, -2.7, -3.3, -2.5, -3.9, -2.2, -3.4, -2.2, -2.8, -3.3, -3.2, -3.0, 1.0, 2.1, 1.6, 1.7, 3.7, 3.9, 3.3, 3.4],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [5.4, 4.1, 3.7, 3.9, 3.7, 4.0, 3.6, 3.9, -1.9, 2.4, -1.5, 1.7, -1.3, -1.0, -1.3, -1.1, 4.9, 6.4, 5.3, 7.0, 5.7, 5.8, 5.6, 5.1, -0.9, 0.4, -0.4, 1.1, 0.0, 0.2, -0.1, 0.5, -1.1, 0.1, -0.7, 0.7, -0.3, -0.1, -0.4, -0.0, -0.0, 0.0, 0.5, 0.9, 1.3, -0.1, 0.5, 1.3, -0.4, 0.2, 1.0, 0.4, 1.0, 1.0, -0.3, -3.5, -4.9, -2.8, -3.7, -2.5, -3.6, -3.6, -3.7, -2.7, -4.0, -2.7, -3.2, -2.3, -2.8, -2.8, -2.8, -2.7, -5.8, -4.3, -5.5, -4.0, -5.3, -5.1, -5.4, -4.4, 0.3, 1.0, 1.3, 1.5, 3.2, 3.2, 2.6, 2.9],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [5.7, 4.2, 3.8, 4.6, 3.7, 4.3, 3.7, 3.7, -0.6, 3.3, -0.1, 2.7, 0.2, 0.3, -0.0, 0.5, 5.8, 7.9, 6.4, 8.4, 6.9, 7.3, 7.1, 6.8, -2.1, 1.2, -0.9, 1.2, 0.0, -0.2, -0.4, 0.7, -1.6, 0.8, -1.0, 0.8, -0.8, -0.6, -0.9, 0.2, -0.2, -1.1, -0.1, 1.2, 0.9, -0.8, -0.6, 0.3, 0.2, 0.2, 0.6, 0.3, -0.1, 0.0, -0.5, -2.8, -6.1, -3.0, -4.4, -3.2, -4.0, -4.3, -4.7, -3.4, -4.6, -3.0, -3.9, -2.5, -3.3, -3.4, -3.7, -2.9, -6.7, -5.1, -5.8, -4.7, -5.7, -5.6, -6.1, -4.4, 0.4, 1.1, 1.4, 2.3, 2.9, 3.1, 2.9, 2.8],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "the theme · the hook, passed from the piano to the fuzz bass, the leads and the strings", bpm: 110, bars: R1.bars, v2: true, duckDepth: 0.42, sec: R1,
    trim: { "phthalo": 5.9, "knight": 4.9, "golden": 4.2 },
    lift_golden: { "boot": 0.0, "pulse": 0.0, "theme": 0.0, "break": 0.0, "drive": 0.0, "decay": 0.0 },
    lift_knight: { "boot": 0.0, "pulse": 0.0, "theme": 0.0, "break": 0.0, "drive": 0.0, "decay": 0.0 },
    lift_phthalo: { "boot": 0.0, "pulse": 0.0, "theme": 0.0, "break": 0.0, "drive": 0.0, "decay": 0.0 },
    arpDirect: true, tone: { sub: -2.5, punch: 2, pres: 2 },
    init: function (o, t) { o.sub = makeSub(o, t); o.la = makeLead2(o, t, o.P.lead, -0.35); o.lb = makeLead2(o, t, o.P.lead2, 0.35); },
    play: function (o, t, st, bar) {
      var sec = R1(bar), cb = motifBar(sec, RZL), c = T1.ch[Math.floor(cb / 2) % 4], six = o.six, fill = sec.fill && st >= 12, last = sec.k === sec.n - 1;
      if (st === 0) {
        mixTo(o, t, sec.mix || { arp: 1.3 }, 0.05);
        sweep(o, "arpF", sec.arpCut, t, 0.2);
        if (sec.fuzz) sweep(o, "fuzzF", sec.fuzz, t, 0.2);
        o.sub.set(t, c.r - 12, sec.sub || 0.0001);
        sweep(o, "padF", sec.id === "break" ? 1500 : 2300, t, 0.2);
        if (sec.pad && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, 0.045, { a: six * 6, r: 1.6 });
        if (sec.riser) riser(o, t, six * 64, 0.08);
        if (sec.crash) crash(o, t, 1);
        if (sec.lh && cb % 2 === 0) keys(o, t, c.r + 12, 0.35, 3.2);   // the left hand: one low note under the hook
      }
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.5);
      if (sec.arp) parp(o, t, [c.tri[0] + 12, c.tri[1] + 12, c.tri[2] + 12, c.tri[0] + 24][T1.arp[st]], (st % 4 === 0 ? 1 : 0.72) * sec.arp, six * 0.8, st % 2 ? 0.45 : -0.45);
      if (sec.bass) {
        var rf = sec.bass === 2 ? T1.riffB : T1.riff, n = rf[st];
        if (n !== null) fz(o, t, c.r + n, sec.bass === 2 ? (st % 4 === 0 ? 1 : 0.8) : (T1.acc[st] || 0.7), six * (rf[(st + 1) % 16] === null ? 1.6 : 0.85));
      }
      kit(o, t, st, bar, sec.drums, { four: true, back: sec.drums >= 2, fill: sec.fill, v: sec.kv });
      if (sec.roll && (st % 2 === 0 || last)) rollHit(o, t, 0.3 + (sec.k - sec.n + 2) * 0.25 + st * 0.02);
      if (sec.id === "break" && last && st >= 12) { stb(o, t, c.tri, 0.5, six * 0.3, st % 2 ? 0.7 : -0.7); stb(o, t + six * 0.5, c.tri, 0.4, six * 0.3, st % 2 ? -0.7 : 0.7); }
      if (sec.stab && !fill && (sec.stab === 2 ? T1.stabB : T1.stabA).indexOf(st) >= 0) stb(o, t, c.tri, st % 4 === 0 ? 1 : 0.8, six * 0.9, st % 2 ? 0.55 : -0.55);
      if (sec.stab) chop(o, t, st, c.tri);
      singAll(o, t, sec, RZ.lead, st, RZL, RZLO);
    }
  };

  /* ---------- 2 · the horror scene ----------
   * The broken music box's lullaby (H2.box, two bars): the box alone in the dark room, a piano somewhere below, the
   * fuzz bass hunting (the box joins it), the box at half speed while you hide, the fuzz and the piano when it hunts
   * again, the lead with the box and the low strings when it finds you, and the box slowing down at the end. */
  var H2L = 32, H2LO = 70, H2M = flat(H2.box);
  var D2 = form([
    ["dark room", 12, function (k) { return { voice: k >= 2 ? ["box"] : null, heart: 1, cluster: k % 2 === 0, trem: 0.2, sub: 0.09, drone: 1 }; }],
    ["something moves", 16, function (k) { return { voice: ["piano low"], heart: 2, cluster: k % 2 === 0, trem: 0.3, bass: "walk", fuzz: 380, sub: 0.11, drone: 1, glass: k % 4 === 2, riser: k === 12 }; }],
    ["it hunts", 16, function (k) { return { voice: k < 8 ? ["fuzz"] : ["fuzz", "box"], cluster: k % 2 === 0, trem: 0.42, fuzz: 650, drums: k < 8 ? 1 : 2, screech: k % 4 === 2, stab: k % 2 === 1, sub: 0.13, fill: k === 15, drone: 0.6 }; }],
    ["hide", 12, function (k) { return { voice: ["box"], half: 1, heart: 3, cluster: k % 2 === 0, glass: k % 4 === 0, drone: 1, sub: 0.07, trem: 0, riser: k === 8, drop: k === 11 }; }],
    ["it hunts", 8, function (k) { return { voice: ["fuzz", "piano low"], cluster: k % 2 === 0, trem: 0.42, fuzz: 700, drums: 2, screech: k % 4 === 0, stab: k % 2 === 1, sub: 0.13, fill: k === 7 }; }],
    ["found", 24, function (k) { return { voice: k < 8 ? ["lead", "box"] : k < 16 ? ["lead", "cello"] : ["lead", "box", "cello"], cluster: k % 2 === 0, trem: 0.45, bass: "found", fuzz: 950, drums: 3, screech: k % 4 === 0, stab: k % 2 === 0, sub: 0.14, crash: k % 8 === 0 }; }],
    ["black", 8, function (k) { return { voice: ["box"], half: 1, v: 1, heart: 4, cluster: k % 2 === 0, sub: 0.04, trem: 0, last: k === 0, drone: 0.7 }; }]
  ]);
  var SONG_DARK = {
    flat_golden: [3.2, 1.6, 0.3, 1.6, -0.5, 1.3, 0.2, 1.6, 0.3, 1.3, 0.5, 1.4, -1.1, 0.5, -0.1, 0.5, 0.3, 1.1, -0.0, 0.8, -0.0, 0.5, 0.2, 0.4, 0.6, 0.8, -0.1, 1.0, -0.5, 0.1, -0.5, 0.1, -0.3, 0.2, -0.6, 0.0, -1.1, -0.3, -0.9, -0.4, -0.7, -0.3, -0.8, -0.5, 0.6, 0.5, 0.5, 1.6, 0.1, 1.0, 0.4, 1.1, -0.3, 0.3, 0.5, 0.7, -1.5, 0.1, -0.8, -0.3, -0.8, -0.3, -0.7, -0.4, -0.3, 0.3, -0.3, 0.3, -0.4, 0.1, -0.3, 0.1, -1.8, -1.3, -2.0, -1.2, -1.7, -1.1, -2.0, -1.2, -2.3, -1.5, -2.3, -1.7, -1.6, -1.6, -2.0, -1.5, -0.6, 0.6, -0.2, 0.7, 0.2, 2.3, 1.3, 2.5],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [2.5, 1.9, 1.0, 2.9, 0.7, 2.5, 1.1, 2.5, 0.1, 2.0, 0.8, 2.8, -1.4, 0.6, 0.1, 0.2, 0.1, 0.6, 0.2, 0.8, -0.0, 0.6, 0.0, 0.3, 0.1, 0.6, 0.1, 1.0, -1.0, -1.2, -1.5, -1.1, -1.3, -1.1, -1.3, -1.0, -1.9, -1.8, -2.1, -1.7, -2.1, -1.9, -2.0, -1.5, 1.6, 1.9, 1.2, 1.9, 0.6, 1.0, 1.4, 2.6, 0.4, 2.0, 1.1, 1.4, -2.7, -1.7, -1.9, -1.5, -1.9, -1.7, -1.8, -1.7, -0.8, 0.2, -0.7, 0.3, -0.8, 0.3, -0.9, -0.0, -3.9, -2.8, -3.5, -2.5, -3.2, -2.6, -3.6, -3.0, -3.8, -2.8, -3.8, -2.6, -3.1, -2.8, -3.7, -2.9, -0.3, 1.2, 0.8, 2.1, 1.3, 3.4, 2.0, 2.5],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [4.2, 3.4, 1.3, 2.7, 0.6, 1.9, 1.3, 3.4, 1.4, 2.8, 1.1, 2.8, -0.8, 1.0, 0.4, 0.9, 1.1, 1.6, 0.6, 1.0, 0.5, 0.8, 0.6, 0.9, 1.1, 1.5, 0.5, 1.2, -0.6, -0.8, -0.8, -0.6, -0.7, -0.5, -0.9, -0.6, -1.5, -1.2, -1.5, -0.9, -1.1, -1.1, -1.3, -1.0, 1.2, 1.5, 1.7, 3.1, 1.8, 2.5, 1.4, 2.3, 0.6, 1.6, 1.4, 2.4, -1.6, -1.0, -1.0, -1.0, -1.2, -1.1, -1.0, -0.9, -1.2, -0.0, -0.9, -0.3, -0.8, -0.3, -0.6, 0.0, -3.9, -3.2, -3.8, -3.4, -3.5, -3.1, -3.9, -3.4, -4.1, -3.3, -4.0, -3.5, -3.6, -3.4, -3.9, -3.3, 0.0, 1.8, 0.7, 1.6, 0.7, 3.1, 2.5, 3.9],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "the horror scene · a music box in the dark, and what hears it", bpm: 120, bars: D2.bars, v2: true, duckDepth: 0.4, sec: D2,
    trim: { "phthalo": 6.2, "knight": 4.9, "golden": 4.4 },
    lift_golden: { "dark room": 0.0, "something moves": 0.0, "it hunts": 0.0, "hide": 0.0, "found": 0.0, "black": 0.0 },
    lift_knight: { "dark room": 0.0, "something moves": 0.0, "it hunts": 0.0, "hide": 0.0, "found": 0.0, "black": 0.0 },
    lift_phthalo: { "dark room": 0.0, "something moves": 0.0, "it hunts": 0.0, "hide": 0.0, "found": 0.0, "black": 0.0 },
    tone: { sub: -3, punch: 2, pres: 2 },
    init: function (o, t) { o.sub = makeSub(o, t); o.la = makeLead2(o, t, o.P.lead, 0.3); o.lb = makeLead2(o, t, o.P.lead2, -0.3); },
    play: function (o, t, st, bar) {
      var sec = D2(bar), cl = H2.cl[(bar >> 1) % 4], six = o.six, k = sec.k;
      if (st === 0) {
        tremTo(o, t, sec.trem, 8 + (bar % 3));
        sweep(o, "padF", sec.id === "found" ? 2600 : 1600, t, 0.8);
        if (sec.fuzz) sweep(o, "fuzzF", sec.fuzz, t, 0.5);
        o.sub.set(t, 28, sec.sub);
        var quiet = sec.id === "dark room" || sec.id === "hide" || sec.id === "black";   // no drums: the strings carry it
        if (sec.cluster) sm(o, t, cl, six * 32, quiet ? 0.065 : 0.045, { a: six * 2, r: 2 });
        if (sec.drone && bar % 4 === 0) sm(o, t, quiet ? [40, 47, 52] : [40, 47], six * 64, (quiet ? 0.06 : 0.028) * sec.drone, { a: six * 2, r: 3, w: 0.8, wave: "triangle" });
        if (sec.glass) glass(o, t, bar % 8 < 4 ? [83, 88] : [84, 89], six * 48, quiet ? 0.022 : 0.012);
        if (sec.screech) scr(o, t, 76 + (bar % 3), six * 10, 0.04, bar % 8 < 4 ? -0.7 : 0.7);
        if (sec.riser) riser(o, t, six * 64, 0.06);
        if (sec.crash) crash(o, t, 0.9);
        if (sec.last) { sm(o, t, [40, 41], six * 56, 0.05, { a: 0.05, r: 3, w: 0.3 }); keys(o, t, 28, 0.9, 6); }
      }
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.45);
      // the heartbeat: steady, racing, loud in hiding, running down at the end
      var hb = sec.heart;
      if (hb === 1 && (st === 0 || st === 8)) heart(o, t, 0.6);
      if (hb === 2 && st % 4 === 0) heart(o, t, 0.55);
      if (hb === 3 && (st === 0 || st === 8)) heart(o, t, 0.85);
      if (hb === 4 && ((k === 0 && (st === 0 || st === 8)) || (k === 2 && st === 2) || (k === 4 && st === 8))) heart(o, t, 0.7);
      if (sec.bass === "walk" && st === 0) fz(o, t, H2.walk[bar % 8], 1, six * 15, true);
      if (sec.bass === "found" && H2.found[st] !== null) fz(o, t, 40 + H2.found[st], st % 4 === 2 ? 1 : 0.7, six * 0.9);
      kit(o, t, st, bar, sec.drums, { four: sec.id === "found", back: true, fill: sec.fill });
      if (sec.stab && (st === 0 || st === 7)) stb(o, t, cl, st ? 0.75 : 1, six * 1.2, st ? 0.6 : -0.6);
      if (sec.id === "found") chop(o, t, st, cl);
      singAll(o, t, sec, H2M, st, H2L, H2LO);
    }
  };

  /* ---------- 3 · the character study ----------
   * The character's melody (C3.mel): the piano alone at 3 AM (a music box remembers it with the piano), the strings,
   * the pulse lead as it climbs, the lead an octave up when it's released, the piano low and at half speed for the
   * truth, both leads (then the strings too) as it becomes itself, and the piano alone after. */
  var C3L = 128, C3LO = 64, C3M = flat(C3.mel);
  var S3 = form([
    ["3 AM", 16, function (k) { return { voice: k < 8 ? ["piano"] : ["piano", "box"], lh: 1, pad: 0.035, walk: k === 15, mix: { pad: 0.75, arp: 0.0001 } }; }],
    ["memory", 16, function (k) { return { voice: k < 8 ? ["strings"] : ["strings", "piano low"], lh: 0.8, pad: 0.03, arp: 0.825, arpCut: 820, sub: 0.06, walk: k === 15, mix: { arp: 0.975 } }; }],
    ["the climb", 16, function (k) { return { voice: ["lead 2"], v: 0.85, lh: 0.6, pad: 0.04, arp: 0.85, arpCut: 2025, drums: k >= 8 ? 1 : 0, kv: 0.8, bass: k >= 6 ? 1 : 0, sub: 0.09, riser: k === 12, roll: k >= 14, drop: k === 15, mix: { fuzz: Math.min(1, 0.4 + k * 0.06) } }; }],
    ["release", 16, function (k) { return { voice: k < 8 ? ["lead high"] : ["lead high", "strings"], lh: 0.5, pad: 0.05, arp: 1, arpCut: 3400, drums: k < 8 ? 2 : 3, bass: 1, sub: 0.12, crash: k % 8 === 0 }; }],
    ["the truth", 16, function (k) { return { voice: ["piano low"], half: 1, v: 1.3, pad: 0.04, arp: 0.5, arpCut: 900, sub: 0.05, riser: k === 12, roll: k >= 14, drop: k === 15 }; }],
    ["becoming", 24, function (k) { return { voice: k < 16 ? ["lead high", "lead 2"] : ["lead high", "lead 2", "strings"], lh: 0.5, pad: 0.055, arp: 1, arpCut: 3800, drums: 3, bass: 2, sub: 0.13, crash: k % 8 === 0 }; }],
    ["after", 8, function (k) { return { voice: ["piano"], lh: 1, pad: 0.035, arp: 0.6, arpCut: 980, sub: 0.05 }; }]
  ]);
  var SONG_CHAR = {
    flat_golden: [10.1, 8.1, 8.7, 8.4, 8.8, 8.6, 8.6, 8.3, 7.7, 7.6, 7.7, 7.6, 8.0, 7.8, 7.6, 7.1, 0.7, -0.3, -0.4, -0.1, -0.5, -0.2, -0.5, 0.4, -1.1, -0.9, -0.6, -0.2, -0.6, -0.1, -0.5, 0.1, 1.1, 1.5, 2.1, 2.2, 1.8, 1.7, 1.6, 1.5, 0.1, 0.3, 0.3, 0.7, -0.1, 0.4, -0.6, -1.3, -2.8, -2.2, -2.5, -2.1, -2.7, -2.4, -2.9, -2.4, -3.0, -2.6, -2.6, -2.2, -2.6, -2.3, -2.8, -2.0, 2.6, 4.5, 4.6, 4.2, 5.1, 5.3, 5.3, 4.6, 4.8, 4.8, 5.1, 4.2, 4.9, 5.1, 3.6, 1.1, -2.6, -2.0, -2.0, -1.6, -2.2, -2.1, -2.3, -1.8, -2.6, -2.0, -2.0, -1.4, -2.2, -1.9, -2.2, -1.8, -3.5, -3.1, -3.0, -2.3, -2.9, -2.8, -3.2, -2.4, 2.7, 5.3, 6.1, 5.7, 5.5, 5.6, 5.9, 5.5],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [9.2, 7.0, 8.3, 8.5, 8.0, 7.4, 7.6, 7.6, 6.3, 6.1, 7.2, 7.4, 7.0, 6.3, 6.8, 6.5, 1.3, -0.2, -0.0, 0.4, -0.5, -1.0, -0.7, 0.5, -1.4, -1.5, -0.6, 0.2, -0.9, -1.2, -0.5, 0.0, 1.8, 2.3, 3.0, 3.0, 1.6, 1.2, 1.7, 1.8, 0.1, 0.2, 0.1, 0.8, -0.7, -0.4, -1.1, -2.4, -4.1, -3.2, -3.1, -2.6, -4.1, -3.8, -4.0, -3.4, -7.0, -6.2, -5.8, -5.4, -6.2, -6.1, -6.3, -5.4, 2.2, 3.7, 4.4, 4.1, 5.3, 5.3, 5.5, 4.8, 4.4, 4.0, 4.1, 4.1, 5.1, 4.6, 2.8, -0.3, -5.1, -4.7, -4.8, -3.9, -4.9, -4.5, -4.8, -4.2, -5.1, -4.4, -4.2, -3.7, -5.0, -4.6, -4.8, -4.4, -7.4, -6.7, -6.6, -5.9, -7.4, -7.1, -6.9, -6.2, 1.7, 4.5, 5.7, 5.6, 4.5, 4.2, 5.0, 4.7],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [9.7, 7.7, 8.8, 9.0, 8.6, 7.9, 8.3, 8.3, 6.5, 6.0, 6.9, 7.6, 6.5, 6.7, 7.2, 6.8, 1.1, -0.0, 0.2, 1.5, -0.4, -0.6, -0.3, 0.9, -1.2, -0.9, -0.6, 1.2, -0.4, -0.6, -0.4, 0.8, 1.3, 1.9, 2.7, 3.1, 1.7, 1.1, 1.4, 2.0, -0.5, 0.0, -0.3, 0.8, -0.7, -0.3, -1.1, -1.3, -4.1, -2.6, -2.4, -1.5, -3.0, -2.6, -2.9, -2.0, -6.4, -5.4, -5.7, -4.8, -5.9, -5.4, -5.7, -4.8, 2.4, 4.8, 5.6, 5.1, 6.0, 5.9, 6.8, 5.6, 5.0, 4.6, 4.9, 4.3, 5.1, 4.9, 4.7, 2.6, -4.6, -3.7, -3.4, -2.8, -4.3, -3.9, -4.5, -4.0, -5.1, -3.6, -3.9, -2.7, -4.3, -3.9, -4.3, -3.5, -7.2, -6.0, -5.9, -5.2, -6.3, -5.9, -6.0, -5.0, 2.4, 5.2, 6.2, 6.7, 5.1, 4.8, 5.4, 5.6],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "the character study · one melody, from a piano at 3 AM to the drop and back", bpm: 132, bars: S3.bars, v2: true, duckDepth: 0.3, sec: S3,
    trim: { "phthalo": 5.9, "knight": 5.0, "golden": 4.5 },
    lift_golden: { "3 AM": 0.0, "memory": 0.0, "the climb": 0.0, "release": 0.0, "the truth": 0.0, "becoming": 0.0, "after": 0.0 },
    lift_knight: { "3 AM": 0.0, "memory": 0.0, "the climb": 0.0, "release": 0.0, "the truth": 0.0, "becoming": 0.0, "after": 0.0 },
    lift_phthalo: { "3 AM": 0.0, "memory": 0.0, "the climb": 0.0, "release": 0.0, "the truth": 0.0, "becoming": 0.0, "after": 0.0 },
    ramp: 2, tone: { sub: -2, punch: 1.5, pres: 1.5 },
    init: function (o, t) { o.sub = makeSub(o, t); o.la = makeLead2(o, t, o.P.lead, -0.5); o.lb = makeLead2(o, t, o.P.lead2, 0.5); },
    play: function (o, t, st, bar) {
      var sec = S3(bar), cb = motifBar(sec, C3L), c = C3.ch[Math.floor(cb / 2) % 4], six = o.six;
      if (st === 0) {
        mixTo(o, t, sec.mix, six * 16);   // a bar-long glide: parts fade in rather than switch on
        if (sec.arp) sweep(o, "arpF", sec.arpCut, t, 1.2);
        sweep(o, "padF", sec.drums ? 2800 : 1700, t, 1.6);
        sweep(o, "fuzzF", sec.bass === 2 ? 1500 : 1100, t, 0.5);
        o.sub.set(t, c.r - 12, sec.sub || 0.0001);
        if (sec.pad && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[1] + 12]), six * 32, sec.pad, { a: sec.drums ? six * 2 : six * 10, r: 1.8 });
        if (sec.riser) riser(o, t, six * 64, 0.07);
        if (sec.crash) crash(o, t, 1);
        if (sec.lh) keys(o, t, c.r, 0.55 * sec.lh, 3.2);
      }
      if (sec.drop && st === 8) subDrop(o, t, six * 8, 0.4);
      if (sec.lh && st === 8 && !sec.walk) keys(o, t, c.tri[1], 0.3 * sec.lh, 2.2);
      if (sec.walk) C3.walkup.forEach(function (n) { if (n[0] === st) keys(o, t, n[1], 0.32 + (st - 8) * 0.02, 1.6); });
      singAll(o, t, sec, C3M, st, C3L, C3LO);
      if (sec.arp) parp(o, t, [c.tri[0] + 12, c.tri[1] + 12, c.tri[2] + 12, c.tri[0] + 24][C3.arp[st]], (st % 4 === 0 ? 1 : 0.7) * sec.arp, six * 0.75, st % 2 ? 0.5 : -0.5);
      kit(o, t, st, bar, sec.drums, { four: true, back: sec.drums >= 2, v: sec.kv });
      if (sec.bass === 1 && st % 4 === 2) fz(o, t, c.r, 0.9, six * 1.6);
      if (sec.bass === 2 && C3.roll.indexOf(st) >= 0) fz(o, t, c.r + (st % 4 === 3 ? 12 : 0), st % 4 === 2 ? 0.9 : 0.65, six * 0.8);
      if (sec.drums) chop(o, t, st, c.tri);
      if (sec.roll) { var lb = sec.k === sec.n - 1 ? 1 : 2; if (st % lb === 0) rollHit(o, t, 0.25 + (st / 16) * 0.5); }
    }
  };

  /* ---------- 4 · the battle of wits ----------
   * The duel (B4.duel: A asks, B answers, eight phrases). At login and in the handshake they type it on a piano (A) and
   * a music box (B), at half speed; in the exploit the two leads trade it at half speed (then each with a shadow: A's
   * strings, B's box); in the stalemates they play it together; at root they trade it at full speed (the shadows again,
   * and at the end A's fuzz bass under it); at logout the piano and the box again, fading. */
  var W4 = form([
    ["login", 8, function (k) { return { type: 1, pad: 0.03, sub: 0.08, duel: 2, keys: 1, v: 0.8 }; }],
    ["handshake", 8, function (k) { return { type: 1, pad: 0.03, hats: 1, drums: "soft", sub: 0.12, duel: 2, keys: 1, phase: 4, riser: k === 4, drop: k === 7 }; }],
    ["exploit", 32, function (k) { return { drums: "full", reese: 1, duel: 2, hats: 2, stab: k % 8 === 0, sub: 0.18, crash: k % 16 === 0, shadow: k >= 16 }; }],
    ["stalemate", 16, function (k) { return { drums: "half", pad: 0.04, unison: 1, reese: 0.6, sub: 0.1, glitch: k % 2 === 1, riser: k === 12, drop: k === 15 }; }],
    ["root", 32, function (k) { return { drums: "full", ride: 1, reese: 1, duel: 1, hats: 2, stab: k % 4 === 0, sub: 0.2, crash: k % 16 === 0, shadow: k >= 16 }; }],
    ["stalemate", 8, function (k) { return { drums: "half", pad: 0.04, unison: 1, reese: 0.6, sub: 0.1, glitch: k % 2 === 1, riser: k === 4, drop: k === 7 }; }],
    ["root", 24, function (k) { return { drums: "full", ride: 1, reese: 1, duel: 1, hats: 2, stab: k % 4 === 0, sub: 0.2, crash: k % 8 === 0, shadow: 1, fuzz: k >= 8 }; }],
    ["logout", 12, function (k) { return { type: k < 8, pad: 0.03, drums: k < 4 ? "half" : null, sub: 0.07, reese: k < 4 ? 0.5 : 0, duel: 2, keys: 1, v: 1 }; }]
  ]);
  var SONG_DUEL = {
    flat_golden: [12.0, 12.0, 10.7, 11.8, 12.0, 11.9, 11.4, 12.0, 10.4, 10.2, 10.5, 10.8, 10.7, 11.3, 9.3, 9.3, -3.8, 1.9, -1.8, 1.3, -1.6, 2.5, -1.6, 1.1, -2.7, -0.2, -1.4, 0.6, -1.3, 1.8, -1.2, -0.0, -3.4, -0.1, -1.7, 0.6, -2.0, 0.4, -1.4, 0.0, -2.9, -1.8, -1.7, -0.3, -1.9, 0.3, -1.1, -0.8, 0.6, 1.7, 1.0, 2.1, 1.1, 1.8, 0.6, 1.7, 0.5, 1.5, 1.1, 2.3, 1.3, 2.0, 1.0, 1.0, -2.6, 1.2, -0.5, -0.9, -1.1, 1.8, -0.7, -1.1, -2.4, 1.5, -0.6, -0.5, -1.4, 1.4, -1.0, -0.4, -3.5, -0.2, -2.0, -0.8, -2.7, -0.3, -2.4, -1.1, -2.8, -0.6, -1.9, -1.1, -2.2, -0.6, -2.4, -1.1, 0.7, 1.5, 1.3, 2.4, 1.0, 2.2, 0.7, 1.2, -3.6, -0.3, -2.5, -1.1, -2.4, -0.0, -2.6, -1.9, -3.4, 0.4, -2.8, -1.5, -3.2, 0.8, -3.0, -1.6, -3.8, 0.6, -2.5, -0.9, -3.3, 0.5, -2.9, -1.0, 4.0, 7.3, 4.4, 8.1, 12.0, 12.0, 11.4, 12.0, 11.2, 11.3, 11.4, 11.6],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [12.0, 11.7, 11.7, 12.0, 12.0, 12.0, 12.0, 12.0, 9.2, 9.2, 10.4, 10.7, 10.7, 12.0, 10.4, 10.4, -3.0, -0.3, -0.1, -1.7, -0.4, 1.2, -0.8, -0.7, -2.1, -0.2, -2.0, -0.1, -2.1, 3.2, -2.1, 0.0, -4.4, 1.3, -2.5, 0.5, -2.8, 1.0, -1.4, -0.8, -3.1, -1.2, -1.2, -2.0, -2.0, 0.0, -0.8, -1.9, 1.9, 1.5, 2.0, 2.7, 2.1, 2.6, 1.6, 2.9, 0.6, 2.3, 1.0, 3.5, 1.3, 3.7, 0.9, 3.2, -3.5, 0.0, -1.5, -1.1, -1.3, 1.3, -1.6, -1.6, -2.4, 1.0, -1.5, -1.2, -1.6, 0.9, -1.5, -1.1, -3.7, 0.3, -3.0, -1.8, -2.7, 1.0, -3.0, -1.1, -3.4, -0.2, -2.7, -1.2, -2.7, 0.4, -2.8, -1.5, 1.8, 2.0, 1.4, 2.9, 1.5, 3.2, 0.9, 2.6, -4.5, -0.0, -2.7, -1.2, -2.7, 0.1, -3.1, -1.7, -4.9, 0.8, -3.8, -1.0, -4.3, 0.5, -4.4, -1.1, -4.5, -0.3, -3.8, -1.5, -4.4, 1.2, -4.1, -1.4, 2.9, 6.8, 2.8, 7.3, 12.0, 12.0, 11.7, 12.0, 11.1, 11.2, 12.0, 12.0],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 10.1, 10.5, 10.4, 11.3, 11.0, 12.0, 9.9, 9.1, -3.6, 1.3, -1.5, 0.7, -0.7, 1.7, -0.7, -0.1, -1.1, -0.6, -0.7, -0.9, -0.2, 1.3, -0.4, -1.0, -2.4, -0.4, -0.4, -1.0, -0.9, 0.0, -0.4, -1.1, -1.4, -1.7, -1.0, -1.7, -1.4, 0.1, -0.6, -1.6, 2.3, 2.6, 2.4, 3.1, 2.3, 3.1, 2.4, 2.7, 1.7, 2.9, 2.1, 3.3, 2.2, 3.6, 1.7, 2.4, -1.8, -0.3, -1.2, -0.5, -0.7, 0.3, -1.1, -0.6, -1.0, 0.2, -1.1, -1.1, 0.0, 0.6, -0.8, -1.3, -3.0, 0.7, -2.4, -1.4, -2.2, 0.6, -2.2, -1.6, -2.3, 0.7, -2.1, -1.3, -2.4, 0.6, -2.1, -1.1, 1.4, 2.9, 1.6, 3.5, 1.6, 3.3, 1.7, 2.3, -4.1, 0.8, -2.2, -1.0, -2.3, 0.6, -2.3, -1.1, -4.2, 0.7, -2.9, -0.9, -3.2, 0.0, -2.9, -0.6, -4.0, -0.0, -2.6, -0.9, -3.1, -0.2, -3.1, -0.8, 4.6, 7.7, 4.1, 7.9, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "the battle of wits · drum & bass, two hackers trading one phrase", bpm: 172, bars: W4.bars, v2: true, duckDepth: 0.36, sec: W4,
    kitLift: { industrial: 4 },   // drum & bass at 172: here the kit should drive, even in the quiet industrial mix
    trim: { "phthalo": -1.6, "knight": 0.5, "golden": 1.0 },
    lift_golden: { "login": 0.0, "handshake": 0.0, "exploit": 0.0, "stalemate": 0.0, "root": 0.0, "logout": 0.0 },
    lift_knight: { "login": 0.0, "handshake": 0.0, "exploit": 0.0, "stalemate": 0.0, "root": 0.0, "logout": 0.0 },
    lift_phthalo: { "login": 0.0, "handshake": 0.0, "exploit": 0.0, "stalemate": 0.0, "root": 0.0, "logout": 0.0 },
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.la = makeLead2(o, t, o.P.lead, -0.7); o.lb = makeLead2(o, t, o.P.lead2, 0.7); },
    play: function (o, t, st, bar) {
      var sec = W4(bar), c = B4.ch[Math.floor(bar / 2) % 4], six = o.six, k = sec.k;
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
      // the duel: a phrase every two bars (positions and lengths doubled), or every bar; in the stalemate together
      var local = (k % 2) * 16 + st, v = sec.v == null ? 1 : sec.v;
      if (sec.duel) {
        var slow = sec.duel === 2, ph = B4.duel[((slow ? Math.floor(k / 2) : k) + (sec.phase || 0)) % 8], a = ph[0] === "a";
        ph[1].forEach(function (n) {
          if ((slow ? n[0] * 2 : n[0]) !== (slow ? local : st)) return;
          var len = n[2] * six * (slow ? 2 : 1);
          if (sec.keys) { sing(o, t, a ? "piano" : "box", n[1], len, 67, 0.85 * v); return; }   // typed, before anyone commits
          (a ? o.la : o.lb).play(t, n[1], len, 0.08);
          if (sec.shadow) sing(o, t, a ? "strings" : "box", n[1], len, 67, 0.8);
          if (sec.fuzz && a) sing(o, t, "fuzz", n[1], len, 67, 0.7);
        });
      }
      if (sec.unison) {
        var pair = (k >> 1) % 4 * 2, pa = B4.duel[pair], pb = B4.duel[pair + 1];
        pa[1].forEach(function (n) { if (n[0] * 2 === local) o.la.play(t, n[1], n[2] * six * 2, 0.065); });
        pb[1].forEach(function (n) { if (n[0] * 2 === local) o.lb.play(t, n[1] - 12, n[2] * six * 2, 0.06); });
      }
      if (sec.type) { if ((bar % 2 === 0 || sec.id !== "login") && B4.typeA.indexOf(st) >= 0) blip(o, t, 0.45 * v, -0.75, 3600); if ((bar % 2 === 1 || sec.id !== "login") && B4.typeB.indexOf(st) >= 0) blip(o, t, 0.4 * v, 0.75, 4300); }
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
   * The original epilogue's melody (EC.mel) over its chords (EC.chords, G D/F# Em C Am G/B C D): the piano, the cello,
   * the strings, the piano low and at half speed in the grief, strings and piano together, then brass and strings,
   * and home to G. */
  var ECL = 128, ECLO = 66, ECM = flat(EC.mel);
  var P5 = form([
    ["remember", 8, { voice: ["piano"], cello: 0.04, str: 0.025, bed: 0.02, bin: 0.02, sub: 0.04, lh: 0.3, padCut: 1200 }],
    ["what remains", 8, { voice: ["cello"], cello: 0.045, str: 0.03, arpeggio: 0.2, bin: 0.015, sub: 0.05, padCut: 1400 }],
    ["the weight lifts", 8, { voice: ["strings"], cello: 0.05, str: 0.035, arpeggio: 0.25, pulse: 0.4, pulseCut: 900, sub: 0.06, padCut: 1800 }],
    ["grief", 8, { voice: ["piano low"], half: 1, cello: 0.05, str: 0.03, sub: 0.05, lh: 0.25, padCut: 1300 }],
    ["the weight lifts", 8, { voice: ["strings", "piano"], cello: 0.055, str: 0.04, arpeggio: 0.25, pulse: 0.5, pulseCut: 1200, sub: 0.07, padCut: 2100 }],
    ["last light", 8, { voice: ["brass", "strings"], cello: 0.055, str: 0.045, arpeggio: 0.3, pulse: 0.55, pulseCut: 1400, sub: 0.08, padCut: 2400 }]
  ]);
  var SONG_EPI = {
    flat_golden: [7.2, 5.6, 5.8, 6.3, 4.0, 4.6, 6.2, 6.5, 0.3, -0.3, 0.4, 1.0, 0.0, 0.2, 0.4, 1.4, 0.2, -0.5, -0.2, -0.4, -1.4, -0.5, -0.4, -0.0, 4.0, 4.3, 3.9, 4.8, 5.0, 5.2, 4.8, 5.6, -1.0, -1.9, -1.4, -1.7, -2.5, -1.6, -1.3, -0.5, -2.1, -2.8, -2.7, -2.6, -3.1, -2.8, -2.7, -2.8],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [6.5, 6.2, 6.6, 7.1, 5.7, 5.1, 7.7, 7.1, 1.4, 0.3, 1.2, 1.6, 0.4, -0.2, 1.6, 0.9, -0.9, -1.4, -0.5, 0.2, -1.0, -1.6, -0.9, -0.6, 4.1, 5.7, 5.1, 5.6, 5.8, 5.6, 6.4, 7.2, -0.5, -1.9, -1.3, -1.0, -2.4, -2.4, -0.8, -1.1, -2.8, -3.4, -3.3, -3.3, -3.9, -3.7, -2.7, -2.7],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [6.5, 5.5, 6.1, 5.4, 5.1, 5.2, 6.6, 6.3, 0.7, 0.0, 0.4, 0.4, -0.0, -0.3, 1.3, 1.0, 0.0, -1.0, -0.6, -1.0, -1.3, -0.8, 0.0, -0.3, 4.2, 4.4, 4.8, 4.1, 5.5, 5.3, 6.4, 6.3, -0.9, -2.2, -1.7, -2.3, -2.3, -2.0, -1.1, -1.5, -2.7, -3.3, -2.9, -3.6, -3.3, -3.2, -2.6, -2.7],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "the epilogue · one melody, many voices, 432 Hz, home to G", bpm: 60, bars: P5.bars, ref: 432, v2: true, duckDepth: 0.6, sec: P5,
    trim: { "phthalo": 8.4, "knight": 8.2, "golden": 7.3 },
    lift_golden: { "remember": 0.0, "what remains": 0.0, "the weight lifts": 0.0, "grief": 0.0, "last light": 0.0 },
    lift_knight: { "remember": 0.0, "what remains": 0.0, "the weight lifts": 0.0, "grief": 0.0, "last light": 0.0 },
    lift_phthalo: { "remember": 0.0, "what remains": 0.0, "the weight lifts": 0.0, "grief": 0.0, "last light": 0.0 },
    ramp: 1, tone: { sub: -1.5, punch: 1, pres: 3 },
    init: function (o, t) { o.sub = makeSub(o, t); o.bin = makeBinaural(o, t, 108, 2.5, 0.02); },
    play: function (o, t, st, bar) {
      var sec = P5(bar), six = o.six, e = EC.chords[motifBar(sec, ECL)], r = e[0] - 12, tri = triad(r + 12, e[1]), bass = e[2];
      if (st === 0) {
        o.bin.level(t, sec.bin || 0.0001);
        o.sub.set(t, bass - 12, sec.sub || 0.0001);
        sweep(o, "padF", sec.padCut, t, 2);
        if (sec.pulse) sweep(o, "arpF", sec.pulseCut, t, 1.5);
        sm(o, t, tri.concat([r + 24]), six * 16, sec.str, { a: 1.6, r: 2.2 });
        if (sec.bed && bar % 2 === 0) sm(o, t, tri, six * 32, sec.bed, { a: bar ? six * 8 : six * 3, r: 2.5, w: 0.4, wave: "triangle" });
        sm(o, t, [bass], six * 16, sec.cello, { a: 1.2, r: 1.5, w: 0 });
        keys(o, t, bass + 12, sec.lh || 0.4, 3.6);
      }
      if (sec.arpeggio && (st === 6 || st === 10)) keys(o, t, st === 6 ? r + 19 : tri[1] + 12, sec.arpeggio, 3);
      if (sec.pulse && st % 2 === 0) parp(o, t, [tri[0], tri[1], tri[2], tri[0] + 12][E5.arp[st / 2]], sec.pulse, six * 1.6, st % 4 ? 0.5 : -0.5);
      singAll(o, t, sec, ECM, st, ECL, ECLO);
    }
  };

  var SONGS = [SONG_RING, SONG_DARK, SONG_CHAR, SONG_DUEL, SONG_EPI];

  /* ======================= outros =======================
   * After its last bar every song plays a short outro (song.outroBars) that winds it down and resolves home to
   * E minor (G major for the epilogue); its tuning eases (440 <-> 432) towards whatever plays next. The last bar
   * swells into the home chord, which rings on under the next track's opening (see outroStep). */
  SONG_RING.outroBars = 4;
  SONG_RING.outro = function (o, t, st, k, N) {   // drums peel away, the fuzz closes, the hook rings out over E
    var six = o.six, fade = 1 - k / N, n = T1.riff[st];
    if (st === 0) {
      o.fuzzF.frequency.setTargetAtTime(Math.max(300, 1200 - k * 260), t, 0.6);
      o.arpF.frequency.setTargetAtTime(Math.max(420, 1800 - k * 380), t, 0.6);
      o.sub.set(t, 28, 0.04 + 0.14 * fade);
      if (k === 0) { kick(o, t, 1); crash(o, t, 0.8); sm(o, t, [52, 55, 59, 64], six * 56, 0.05, { a: six * 2, r: 2.5 }); o.la.play(t, 64, six * 24, 0.08); }
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
  // After the logout: one soft chord and the two hackers' last words, then a breath. The tempo glides from
  // 172 down to the epilogue's 60 here, so nothing rhythmic plays once it starts to slow (no ticking that
  // drags), and an E minor pad - the epilogue's first chord - swells in and rings on across the join.
  SONG_DUEL.outro = function (o, t, st, k, N) {
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.05 * fade + 0.02);   // stays at the logout's level, then thins out
      if (k === 0) stb(o, t, [52, 55, 59], 0.25, six * 2, 0);
      if (k === 1) { sm(o, t, [52, 55, 59, 64], six * 40, 0.035, { a: six * 4, r: 2 }); o.la.play(t, 76, six * 6, 0.07); }
      if (k === 2) {
        o.la.play(t, 67, six * 14, 0.05); o.lb.play(t, 64, six * 14, 0.045);
        sm(o, t, [40, 52, 55, 59], 9, 0.03, { a: 3, r: 5, w: 0.4, wave: "triangle" });   // the bridge into the epilogue
      }
    }
    if (k === 1 && st === 8) o.lb.play(t, 71, six * 8, 0.065);
    if (k === 0 && st % 4 === 2) hh(o, t, 0.22 * fade, false, st % 8 === 2 ? -0.4 : 0.4);
  };
  SONG_EPI.outroBars = 2; SONG_EPI.home = [43, 55, 59, 62, 67];   // G major
  SONG_EPI.outro = function (o, t, st, k) {   // a last glint of light over a held G chord
    if (st === 0 && k === 0) { o.bin.level(t, 0.0001); o.sub.set(t, 31, 0.05); sm(o, t, [55, 59, 62, 67], o.six * 30, 0.04, { a: 0.6, r: 3 }); }
    if (k === 0 && (st === 0 || st === 4 || st === 8)) keys(o, t, [79, 83, 86][st / 4], 0.3, 3.5);
  };
  EPI_CUT.outroBars = 2; EPI_CUT.home = [43, 55, 59, 62, 67];   // G major
  EPI_CUT.outro = function (o, t, st, k) {   // a last glint of light over a held G chord
    if (st === 0 && k === 0) { o.bin.level(t, 0.0001); o.sub.set(t, 31, 0.05); sm(o, t, [55, 59, 62, 67], o.six * 30, 0.04, { a: 0.6, r: 3 }); }
    if (k === 0 && (st === 0 || st === 4 || st === 8)) keys(o, t, [79, 83, 86][st / 4], 0.3, 3.5);
  };
  /* The join: every track ends the same way, whatever comes next (the next song, a bonus track, shuffle, or itself
   * on repeat). The outro winds down at the track's own tempo, and its last bar swells into the home chord, which
   * rings on for about six seconds past the end (WASH). The next track starts at the end of the outro, underneath
   * that ring: its opening fades in while the chord fades out. The tunings meet too: the outro glides to the next
   * track's A (432 for the epilogue, 440 for the rest), so the chord and the opening are never out of tune. */
  var WASH = 6.5;   // seconds a track's file runs past its handoff, and how long that tail overlaps the next track
  var HOME = [40, 52, 55, 59, 64];   // E minor: where every track ends unless it says otherwise (song.home)
  function washChord(o, t) {
    var six = o.six, bar = six * 16, home = o.song.home || HOME;
    sm(o, t, home.slice(1), bar + 0.4, 0.04, { a: bar * 0.7, r: WASH - 0.5, w: 0.7 });
    sm(o, t, [home[0]], bar + 0.4, 0.035, { a: bar * 0.5, r: WASH - 1, w: 0, wave: "triangle" });
    keys(o, t + bar, home[home.length - 1] + 12, 0.22, 4.5);   // one high note on the downbeat where the next track begins
    // the voices that never stop on their own (the sub, the epilogue's binaural drone) fade across this bar, so the
    // ring is only the chord: a held sub under the next track's opening was a hum that never ended
    if (o.sub) o.sub.set(t + bar * 0.4, home[0] - 12, 0.0001);
    if (o.bin) o.bin.level(t, 0.0001);
  }
  function outroStep(o, t, st, k) {
    var song = o.song, N = song.outroBars;
    if (!o.tgt) {   // decided once, at the outro's first step
      var ti = upNext(o), ts = TRACKS[ti];
      o.tgt = { si: ti, six: o.six, ref: ts.ref || 440, six0: o.six, ref0: o.ref };
    }
    var g = o.tgt, f = (k * 16 + st + 1) / (N * 16), e = f * f * (3 - 2 * f);
    o.ref = g.ref0 + (g.ref - g.ref0) * e;   // the tuning glides to the next track's (432 <-> 440); the tempo stays
    song.outro(o, t, st, k, N);
    if (k === N - 1 && st === 0) washChord(o, t);
  }
  function unTarget(o) { if (o && o.tgt) { o.six = o.dur = o.tgt.six0; o.ref = o.tgt.ref0; o.tgt = null; } }

  /* ======================= track 6 · the director's cut (secret) =======================
   * The same story as the five songs, told once, end to end, with their material and instruments: a cold
   * open where the hook plays alone on the piano in a house that isn't empty · the machine booting · the theme,
   * whose drive moves the hook onto Em G D B · something in the dark, where the music box gets the whole hook ·
   * a chapter only one palette has (see below) · two cursors, where B answers A with the hook · the collapse ·
   * 3 AM, the character alone · learning to fly, where the character's melody and the hook finally play
   * together · dawn at A=432, where the horns sing the hook in G.
   * The signature chapter is each palette's own:
   *   Phthalo (Mr. Robot) · "the monologue": the bass walks down under one held chord, the pulse runs in threes
   *     against the bar, the hook is played upside down and answered right way up; then the signal breaks up
   *   Dark Knight (industrial) · "the warehouse": a hypnotic fuzz ostinato on E leaning on F, metal-on-metal
   *     semitone stabs, the kick dropping out for the hook in the low brass at half speed, then both leads in octaves
   *   Golden (K-pop) · "the dance break": a trap verse with the hook on a music box, a pre-chorus, the chorus
   *     with the vocal chop, then the key lifts a whole step for the last chorus
   * One tempo map (CUT.tempo) carries it: it glides between chapters, and where a chapter halves or doubles
   * (the collapse, 3 AM into flight, flight into dawn) the jump lands on a downbeat. */
  var CUT = {
    chapters: [[0, "cold open"], [16, "boot sequence"], [28, "the theme"], [68, "something in the dark"], [100, null], [148, "two cursors"], [212, "collapse"], [218, "3 AM"], [246, "learning to fly"], [278, "dawn"]],
    sig: { mrrobot: "the monologue", industrial: "the warehouse", kpop: "the dance break" },
    // [bar, bpm]: straight lines between points; a repeated bar is a jump
    tempo: [[0, 76], [16, 76], [28, 110], [68, 110], [70, 120], [100, 120], [102, 124], [148, 124], [152, 172], [212, 172], [212, 86], [218, 66], [246, 66], [246, 132], [278, 132], [278, 66], [282, 60], [999, 60]],
    prog: [{ r: 40, tri: [52, 55, 59] }, { r: 43, tri: [55, 59, 62] }, { r: 38, tri: [50, 54, 57] }, { r: 35, tri: [47, 51, 54] }]   // Em G D B: the hook's new harmony
  };
  var CUT_MOOD = "the director's cut · the same story, told once, end to end";
  function cutBpm(pos) { return mapBpm(CUT.tempo, pos); }
  function cutName(bar, style) { var name = ""; CUT.chapters.forEach(function (c) { if (bar >= c[0]) name = c[1] || CUT.sig[style] || CUT.sig.mrrobot; }); return name; }
  function hookAt(pos) { return RZ.lead.filter(function (n) { return n[0] === pos; }); }   // pos: 16ths into the 8-bar hook (B A G F# G E ...)
  function lineAt(line, pos) { return line.filter(function (n) { return n[0] === pos; }); }   // the same, for any 8-bar line
  // The signature chapter runs 48 bars (100-148); the chapters after it were written for bars 132-310, so they
  // are played with their bar numbers 16 earlier (SIG_EXTRA) and keep their own arithmetic.
  var SIG_END = 148, SIG_EXTRA = 16;
  function cutSec(bar) {
    if (bar >= 100 && bar < SIG_END) return "sig " + (1 + ((bar - 100) >> 3));
    return cutSecOld(bar >= SIG_END ? bar - SIG_EXTRA : bar);
  }
  // the section each bar belongs to, for the loudness curve: named after the song section it matches
  function cutSecOld(bar) {
    if (bar < 16) return "cold open";
    if (bar < 28) return bar < 22 ? "boot" : "boot 2";
    if (bar < 68) return bar < 36 ? "pulse" : bar < 52 ? "theme" : bar < 60 ? "break" : "drive";
    if (bar < 100) return bar < 76 ? "dark room" : bar < 84 ? "something moves" : bar < 92 ? "hide" : "found";
    if (bar < 132) return "sig " + (1 + ((bar - 100) >> 3));
    if (bar < 196) return bar < 136 ? "run-up" : bar < 144 ? "handshake" : bar < 164 ? "exploit" : bar < 172 ? "stalemate" : "root";
    if (bar < 202) return "collapse";
    if (bar < 230) return bar < 210 ? "3 AM" : bar < 218 ? "memory" : bar < 226 ? "the truth" : "the climb";
    if (bar < 262) return bar < 246 ? "release" : "becoming";
    return "dawn: " + E5.sec(bar - 262).id;
  }
  function pulseOf(c, st, arp) { return [c.tri[0] + 12, c.tri[1] + 12, c.tri[2] + 12, c.tri[0] + 24][(arp || T1.arp)[st]]; }

  function cutCold(o, t, st, bar) {   // 0–16 · 76 · the hook alone on the piano, and the house around it
    var c = T1.ch[Math.floor(bar / 2) % 4], six = o.six, pos = (bar % 8) * 16 + st, style = o.P.style;
    if (st === 0) {
      if (bar === 0) mixTo(o, t, { arp: 1.3 }, 0.05);
      sweep(o, "padF", 1300 + bar * 40, t, 1);
      o.sub.set(t, c.r - 12, bar < 8 ? 0.03 : 0.06);
      if (bar % 8 === 0) wind(o, t, six * 64, 0.8);
      if (bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, 0.035, { a: six * 8, r: 2 });
      if (bar === 12) riser(o, t, six * 64, 0.05);
      if (style === "industrial" && bar % 4 === 0) sm(o, t, [40, 47], six * 64, 0.03, { a: six * 16, r: 3, w: 0.8, wave: "triangle" });   // a drone under the floor
      if (style === "industrial" && bar % 4 === 2) clank(o, t, 0.22);   // metal, somewhere below
      if (style === "kpop" && bar % 4 === 0) glass(o, t, [83, 88], six * 48, 0.012);
    }
    if (bar < 8 && (st === 0 || st === 8)) heart(o, t, 0.4);
    if (bar < 8) hookAt(pos).forEach(function (n) { keys(o, t, n[1], 1.3, n[2] * six * 1.4); });   // the hook, stated once
    else E5.hook.forEach(function (n) {   // then the house answers with the epilogue's first line (G B E, a sigh down to B), not the hook again
      if (n[0] !== (bar - 8) % 4 || n[1] !== st) return;
      keys(o, t, n[2], 0.8, n[3] * six * 1.4); keys(o, t, n[2] - 12, 0.3, n[3] * six);
      if (style === "kpop") box(o, t, n[2] + 12, 0.5, n[3] * six * 1.4, 6);   // a music box, still in tune
    });
    if (bar >= 8) H2.far.forEach(function (n) { if (n[0] === bar % 8 && n[1] === st) keys(o, t, n[2], 0.18, 5); });   // a piano in another room
    if (style === "mrrobot" && bar % 2 === 1 && [0, 3, 5, 6, 9].indexOf(st) >= 0) blip(o, t, 0.32, -0.6, 3600);   // someone typing, late
    if (bar >= 14 && B4.typeA.indexOf(st) >= 0) blip(o, t, 0.4, 0.5, 4300);
  }
  function cutBoot(o, t, st, bar) {   // 16–28 · 76 → 110 · the pulse wakes and opens, then the machine starts
    var k = bar - 16, c = T1.ch[Math.floor(bar / 2) % 4], six = o.six;
    if (st === 0) {
      sweep(o, "arpF", 1100, t, 0.2);
      sweep(o, "fuzzF", 630, t, 0.2);
      if (k < 8 && k % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, 0.045, { a: six * 2, r: 1.6 });
      o.sub.set(t, c.r - 12, 0.06);
      if (k === 8) mixTo(o, t, { arp: 1.3, fuzz: 0.5 }, 0.05);
      if (k === 6) riser(o, t, six * 96, 0.03);
    }
    parp(o, t, pulseOf(c, st), (st % 4 === 0 ? 1 : 0.72), six * 0.8, st % 2 ? 0.45 : -0.45);
    if (k < 8 && k % 2 === 0 && B4.typeA.indexOf(st) >= 0) blip(o, t, 0.4, -0.7, 3600);
    if (k >= 9) kit(o, t, st, bar, 1, { four: true, v: 0.7, fill: k === 11 });
    if (k >= 8) { var n = T1.riff[st]; if (n !== null) fz(o, t, c.r + n, (T1.acc[st] || 0.7) * 0.8, six * (T1.riff[(st + 1) % 16] === null ? 1.6 : 0.85)); }
    if (k === 11 && st === 8) subDrop(o, t, six * 8, 0.25);
  }
  function cutTheme(o, t, st, bar) {   // 28–68 · 110 · Ring Zero told again; in the drive the hook moves to Em G D B
    var k = bar - 28, sec = k < 8 ? "pulse" : k < 24 ? "theme" : k < 32 ? "break" : "drive", six = o.six;
    var c = sec === "drive" ? CUT.prog[Math.floor(bar / 2) % 4] : T1.ch[Math.floor(bar / 2) % 4], pos = (bar % 8) * 16 + st;
    var fillBar = bar === 35 || bar === 51 || bar === 67, fill = fillBar && st >= 12;
    if (st === 0) {
      if (k === 0) mixTo(o, t, { arp: 1.3, fuzz: 0.8 }, 0.05);
      if (k === 8) mixTo(o, t, { arp: 1.3 }, 0.05);
      sweep(o, "arpF", sec === "break" ? 900 : sec === "drive" ? 2700 : 2000, t, 0.6);
      sweep(o, "fuzzF", sec === "drive" ? 2100 : 1400, t, 0.4);
      sweep(o, "padF", sec === "break" ? 1500 : 2300, t, 1);
      o.sub.set(t, c.r - 12, 0.13);
      if ((sec === "break" || (sec === "drive" && k >= 36)) && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, 0.05, { a: six * 6, r: 1.6 });
      if (bar === 36 || bar === 60) crash(o, t, 0.3);
      if (bar === 56) riser(o, t, six * 64, 0.045);
      if (sec === "drive" && bar % 2 === 0) o.lb.play(t, c.tri[1] + 12, six * 28, 0.035);   // a held counter-line on the chord's third, new in this telling
    }
    if (sec !== "break") {
      var rf = sec === "drive" ? T1.riffB : T1.riff, n = rf[st];
      if (n !== null) fz(o, t, c.r + n, sec === "drive" ? (st % 4 === 0 ? 1 : 0.8) : (T1.acc[st] || 0.7), six * (rf[(st + 1) % 16] === null ? 1.6 : 0.85));
    }
    parp(o, t, pulseOf(c, st), (st % 4 === 0 ? 1 : 0.72) * (sec === "break" ? 0.6 : 1), six * 0.8, st % 2 ? 0.45 : -0.45);
    kit(o, t, st, bar, sec === "pulse" ? (k < 4 ? 0 : 1) : sec === "theme" ? (k < 16 ? 1 : 2) : sec === "drive" ? 3 : 0, { four: true, back: sec !== "pulse", fill: fillBar });
    if (sec === "break" && bar >= 58 && (st % 2 === 0 || bar === 59)) rollHit(o, t, 0.4);
    if (bar === 59 && st === 8) subDrop(o, t, six * 8, 0.25);
    var stabs = sec === "drive" ? T1.stabB : sec === "theme" ? T1.stabA : null;
    if (stabs && !fill && stabs.indexOf(st) >= 0) stb(o, t, c.tri, st % 4 === 0 ? 1 : 0.8, six * 0.9, st % 2 ? 0.55 : -0.55);
    if (stabs) chop(o, t, st, c.tri);
    // the hook is saved for the drive, where it gets its new harmony; the theme soars, the break lifts
    var line = sec === "drive" ? RZ.lead : sec === "break" ? T1.lift : sec === "theme" && k >= 16 ? T1.soar : null;
    if (line) lineAt(line, pos).forEach(function (n) { o.lead.play(t, n[1], n[2] * six, sec === "break" ? 0.07 : 0.085); });
  }
  function cutDark(o, t, st, bar) {   // 68–100 · 120 · something in the house: a heartbeat, clusters, the hook on a broken music box
    var k = bar - 68, sec = k < 8 ? "room" : k < 16 ? "moves" : k < 24 ? "hide" : "found", cl = H2.cl[(bar >> 1) % 4], six = o.six;
    if (st === 0) {
      if (k === 0) mixTo(o, t, {}, 0.05);
      tremTo(o, t, sec === "hide" ? 0 : sec === "found" ? 0.45 : 0.25 + k * 0.01, 8 + (bar % 3));
      sweep(o, "padF", sec === "found" ? 2600 : 1600, t, 0.8);
      sweep(o, "fuzzF", sec === "found" ? 950 : 420, t, 0.5);
      o.sub.set(t, 28, sec === "found" ? 0.14 : sec === "hide" ? 0.07 : 0.1);
      if (bar % 2 === 0) sm(o, t, cl, six * 32, sec === "room" ? 0.06 : sec === "hide" ? 0.04 : 0.045, { a: six * 2, r: 2 });
      if (sec !== "found" && bar % 4 === 0) sm(o, t, sec === "moves" ? [40, 47] : [40, 47, 52], six * 64, sec === "moves" ? 0.028 : 0.06, { a: six * 2, r: 3, w: 0.8, wave: "triangle" });
      if ((sec === "moves" || sec === "hide") && bar % 4 === 2) glass(o, t, bar % 8 < 4 ? [83, 88] : [84, 89], six * 48, sec === "hide" ? 0.02 : 0.012);
      if (sec === "found" && bar % 4 === 0) scr(o, t, 76 + (bar % 3), six * 10, 0.04, bar % 8 < 4 ? -0.7 : 0.7);
      if (bar === 80 || bar === 88) riser(o, t, six * 64, 0.045);
      if (bar === 92 || bar === 96) crash(o, t, 0.5);
    }
    if (sec === "room" || sec === "hide") H2.far.forEach(function (n) { if (n[0] === bar % 8 && n[1] === st) keys(o, t, n[2], 0.45, 5); });
    if (sec === "room" && (st === 0 || st === 8)) heart(o, t, 0.6);
    if (sec === "moves" && st % 4 === 0) heart(o, t, 0.55);
    if (sec === "hide" && (st === 0 || st === 8)) heart(o, t, 0.85);
    if (sec === "moves" && st === 0) fz(o, t, H2.walk[bar % 8], 1, six * 15, true);
    if (sec === "found" && H2.found[st] !== null) fz(o, t, 40 + H2.found[st], st % 4 === 2 ? 1 : 0.7, six * 0.9);
    if (sec === "hide") H2.box.forEach(function (n) { if (n[0] === (bar - 84) % 2 && n[1] === st) box(o, t, n[2], 0.9, n[3] * six * 1.6, 38); });   // the lullaby, out of tune
    if (bar === 91 && st === 8) subDrop(o, t, six * 8, 0.25);
    kit(o, t, st, bar, sec === "found" ? 3 : 0, { four: true, back: true, fill: bar === 99 });
    if (sec === "found" && bar % 2 === 0 && (st === 0 || st === 7)) stb(o, t, cl, st ? 0.75 : 1, six * 1.2, st ? 0.6 : -0.6);
    if (sec === "found") chop(o, t, st, cl);
  }

  /* ---------- the signature chapters, 100–148 at 124 bpm: one per palette ---------- */
  var SIG = {
    // the monologue: E D C B walking down under the same Em chord (Em, Em/D, Cmaj7, B), the pulse in threes
    line: [{ r: 40, tri: [52, 55, 59] }, { r: 38, tri: [52, 55, 59] }, { r: 36, tri: [52, 55, 59] }, { r: 35, tri: [51, 54, 57] }],
    three: [0, 7, 12],
    inv: [[0, 71, 6], [6, 72, 2], [8, 74, 4], [12, 76, 2], [14, 74, 2], [16, 78, 12]],   // the hook upside down: B C D E D F#
    type: [0, 3, 5, 6, 9, 12, 13],
    // the second voice in the monologue: long notes against the call and response - B G F#, A G E, then the major
    // seventh over C (B over C) and down through A F# to D#, which leans back into E
    counter: [[0, 83, 8], [8, 79, 8], [16, 78, 12], [28, 79, 4], [32, 81, 8], [40, 79, 8], [48, 76, 16], [64, 76, 8], [72, 79, 8],
              [80, 83, 16], [96, 81, 8], [104, 78, 8], [112, 75, 16]],
    // the warehouse: a fuzz ostinato on E that leans on F every fourth bar
    ost: [0, null, 0, 12, 0, null, 0, 10, 0, null, 0, 12, 0, 7, 0, 10], wroots: [40, 40, 40, 41],
    // the warehouse's hero: up through E minor, the minor sixth (C) pulling it back, then F over the Phrygian F bars;
    // the second half climbs an octave and lands on G# over F minor before falling home
    hero: [[0, 64, 6], [6, 67, 2], [8, 71, 8], [16, 72, 6], [22, 71, 2], [24, 67, 8], [32, 64, 4], [36, 67, 4], [40, 71, 4], [44, 76, 4],
           [48, 77, 12], [60, 76, 4], [64, 76, 6], [70, 79, 2], [72, 83, 8], [80, 84, 6], [86, 83, 2], [88, 79, 8], [96, 76, 4], [100, 79, 4],
           [104, 83, 4], [108, 84, 4], [112, 80, 8], [120, 77, 8]],
    call: [40, 47, 48, 41]   // the standoff: E, B, C, F, one bar each, low in the brass
  };

  /* Phthalo · the monologue, 48 bars, no glitches - a voice thinking out loud: 0-7 alone (the pulse in threes, a held
   * chord) · 8-15 the inner voice (the bass walks down; the hook upside down on the lead, answered right way up, low on
   * the piano) · 16-23 the argument (strings rise, a second voice holds long notes against it, the lightest kit) ·
   * 24-31 the doubt (everything falls away but the piano, which plays the upside-down hook slowly, alone) · 32-39 the
   * build (the pulse opens, the kit grows, a roll) · 40-47 the speech (all of it at full weight, then a clean last chord). */
  function sigMonologue(o, t, st, bar) {
    var k = bar - 100, c = SIG.line[Math.floor(bar / 2) % 4], six = o.six;
    var sec = k < 8 ? "alone" : k < 16 ? "voice" : k < 24 ? "argue" : k < 32 ? "doubt" : k < 40 ? "build" : "speech";
    var lv = sec === "argue" ? (k >= 20 ? 1 : 0) : sec === "build" ? (k < 36 ? 1 : 2) : sec === "speech" ? 3 : 0;
    if (k === 39 && st >= 8) { if (st === 8) subDrop(o, t, six * 8, 0.25); return; }   // the floor falls away before the speech
    if (bar === SIG_END - 1) {   // the last bar: one chord, held, and the room ringing
      if (st === 0) { o.sub.set(t, 28, 0.06); sm(o, t, [40, 52, 55, 59, 64], six * 16, 0.05, { a: 0.03, r: 3, w: 0.6 }); keys(o, t, 64, 0.6, 4); keys(o, t, 40, 0.5, 4); }
      return;
    }
    if (st === 0) {
      if (k === 0) mixTo(o, t, { arp: 1.2, fuzz: 0.7 }, 0.05);
      if (k === 24) mixTo(o, t, { arp: 0.5, fuzz: 0.4 }, 0.05);
      if (k === 32) mixTo(o, t, { arp: 1.2, fuzz: 0.7 }, 0.05);
      sweep(o, "arpF", sec === "doubt" ? 520 : sec === "build" ? 1800 : sec === "speech" ? 3000 : sec === "alone" ? 850 : sec === "voice" ? 1400 : 1950, t, 0.2);
      sweep(o, "padF", sec === "doubt" ? 1500 : 1800, t, 0.2);
      sweep(o, "fuzzF", sec === "doubt" ? 420 : 700 + (sec === "speech" ? 500 : 0), t, 0.5);
      o.sub.set(t, c.r - 12, sec === "doubt" ? 0.04 : 0.05 + lv * 0.025);
      if (bar % 2 === 0) sm(o, t, c.tri.concat([c.r + 24]), six * 32, sec === "doubt" ? 0.03 : 0.04, { a: six * 4, r: 1.5 });
      if (sec !== "alone" && sec !== "doubt" && bar % 2 === 0) fz(o, t, c.r, 0.8, six * 30, true);   // the bass steps down, one held note at a time
      if ((sec === "argue" || sec === "speech") && bar % 2 === 0) sm(o, t, [c.tri[1] + 12, c.tri[2] + 12], six * 32, 0.03, { a: six * 6, r: 2, w: 0.9 });   // strings, higher
      if (sec === "doubt" && bar % 4 === 0) glass(o, t, [c.tri[2] + 24, c.r + 36], six * 48, 0.012);
      if (k === 28 || k === 36) riser(o, t, six * 64, 0.04);
      if (k === 32 || k === 40) crash(o, t, k === 40 ? 0.5 : 0.2);
    }
    var step = (bar * 16 + st) % 3;   // threes against fours: the pulse comes round to the downbeat every three bars
    if (sec !== "doubt") parp(o, t, c.tri[0] + 12 + SIG.three[step], st % 4 === 0 ? 0.9 : 0.6, six * 0.7, step === 0 ? -0.5 : step === 1 ? 0 : 0.5);
    if (sec === "alone" && SIG.type.indexOf(st) >= 0 && bar % 2 === 0) blip(o, t, 0.16, st % 2 ? 0.7 : -0.7, 3600);   // someone typing, far off
    if (lv) kit(o, t, st, bar, lv, { back: lv >= 3, fill: bar === 123 || bar === 131 || bar === 143 });
    if (sec === "build" && k >= 38 && st % (k === 38 ? 2 : 1) === 0) rollHit(o, t, 0.4);
    var ph = (k % 4) * 16 + st;
    if (sec === "voice" || sec === "argue" || sec === "build" || sec === "speech") {   // call and response: the hook upside down on the lead, then right way up, low on the piano
      if (ph < 32) SIG.inv.forEach(function (n) { if (n[0] === ph) o.lead.play(t, n[1], n[2] * six, sec === "voice" ? 0.065 : 0.075); });
      else hookAt(ph - 32).forEach(function (n) { keys(o, t, n[1] - 12, 0.6, n[2] * six * 1.3); if (sec === "speech") keys(o, t, n[1], 0.3, n[2] * six); });
    }
    if (sec === "doubt" && st % 2 === 0) SIG.inv.forEach(function (n) { if (n[0] === ((k - 24) % 4) * 8 + st / 2) keys(o, t, n[1], 0.7, n[2] * six * 2.4); });   // half speed, the piano alone
    if (sec === "argue" || sec === "speech") lineAt(SIG.counter, (k % 8) * 16 + st).forEach(function (n) { o.lb.play(t, n[1], n[2] * six, 0.045); });   // the second voice
  }

  /* Dark Knight · the warehouse, 48 bars of action: 0-3 the dark (the fuzz held, a razor-thin note, wings overhead) ·
   * 4-7 engines (the strings start a 16th-note ostinato, taiko on the beat, a riser) · 8-15 the chase (the full kit,
   * the fuzz ostinato, horn stabs, metal on metal) · 16-19 the standoff (the kick drops out; the low brass calls, the
   * choir answers, a roll) · 20-31 the fight (the hero's theme in horns and lead, stabs on the 8ths, taiko 16ths into
   * every fourth bar) · 32-35 the drop (taiko and strings alone, then a boom and a rise) · 36-47 the escape (both leads
   * an octave apart on the hero's theme, crashes every four bars), and the lights go out. */
  function sigWarehouse(o, t, st, bar) {
    var k = bar - 100, r = SIG.wroots[bar % 4], six = o.six, pos = (k % 8) * 16 + st;
    var sec = k < 4 ? "dark" : k < 8 ? "engines" : k < 16 ? "chase" : k < 20 ? "standoff" : k < 32 ? "fight" : k < 36 ? "drop" : "escape";
    var hot = sec === "chase" || sec === "fight" || sec === "escape", tri = r === 41 ? [53, 56, 60] : [52, 55, 59];   // Em, and a Phrygian F leaning on it
    if (bar === SIG_END - 1 && st >= 4) { if (st === 4) { o.sub.set(t, 28, 0.0001); boom(o, t, 0.45); flyby(o, t, six * 10, 0.3); sm(o, t, tri, six * 12, 0.045, { a: 0.02, r: 2 }); } return; }   // the lights go out
    if (st === 0) {
      if (k === 0) mixTo(o, t, { fuzz: 0.9, stab: 1.1 }, 0.05);
      sweep(o, "fuzzF", sec === "dark" ? 500 : sec === "standoff" || sec === "drop" ? 700 : 1600, t, 0.2);
      sweep(o, "padF", hot ? 1300 : 1800, t, 1);
      o.sub.set(t, r - 12, hot ? 0.12 : 0.08);
      if (sec === "dark" && bar % 2 === 0) fz(o, t, r, 0.9, six * 30, true);
      if (k === 0) sm(o, t, [64], six * 64, 0.012, { a: six * 2, r: 0.12, w: 0, wave: "sawtooth" });   // one razor-thin note, held, then cut
      if (sec === "dark" && k % 2 === 1) flyby(o, t, six * 14, 0.3);   // wings, overhead
      if ((sec === "standoff" || sec === "drop") && bar % 2 === 0 && o.P.choir) choir(o, t, tri, six * 32, 0.045, { a: six * 6, r: 2 });
      if (sec === "standoff") horns(o, t, [SIG.call[k - 16], SIG.call[k - 16] + 12], six * 14, 0.07, { a: six * 3, pan: k % 2 ? 0.25 : -0.25 });   // the call, low
      if ((hot || sec === "engines") && bar % 2 === 0) sm(o, t, tri.concat([tri[0] + 12]), six * 32, 0.03, { a: six * 2, r: 1.2 });
      if (k === 6 || k === 18 || k === 34) riser(o, t, six * 32, 0.045);
      if (k === 8 || k === 20 || k === 28 || k === 36 || k === 40 || k === 44) crash(o, t, 0.5);
      if (k === 8 || k === 20 || k === 34 || k === 36) boom(o, t, 0.7);
    }
    // the drums: only where it runs
    if (hot) kit(o, t, st, bar, 3, { four: true, back: true, fill: bar === 115 || bar === 131 || bar === 135 || bar === 143 });
    if (sec === "engines" && st % 4 === 0) taiko(o, t, 0.7, st % 8 ? 0.35 : -0.35, 85);
    if (sec === "standoff" && st % 4 === 2) rumble(o, t, 0.7);   // the kick goes; the rumble stays
    if (sec === "standoff" && k === 19 && st % (st >= 8 ? 1 : 2) === 0) rollHit(o, t, 0.4);
    if (sec === "standoff" && k === 19 && st === 8) subDrop(o, t, six * 8, 0.25);
    if (sec === "drop" && (st === 0 || st === 6 || st === 10)) taiko(o, t, st ? 0.55 : 0.85, st === 6 ? -0.5 : st === 10 ? 0.5 : 0, st ? 120 : 80);
    if ((sec === "fight" || sec === "escape") && bar % 4 === 3 && st >= 8) taiko(o, t, 0.4 + (st - 8) * 0.06, (st - 11.5) * 0.15, 140 - (st - 8) * 6);   // 16ths into the turn
    // the adrenaline: strings in 16ths, every step, the minor sixth leaning in
    if (sec !== "dark" && sec !== "standoff") spic(o, t, (st % 8 === 6 ? 48 : st % 4 === 3 ? 47 : st % 2 ? 55 : 52) + (r === 41 ? 1 : 0), st % 4 === 0 ? 0.9 : 0.55, st % 2 ? 0.45 : -0.45, hot ? 0.85 : 0.5);
    if (hot && SIG.ost[st] !== null) fz(o, t, r + SIG.ost[st], st % 4 === 0 ? 1 : 0.75, six * 0.8);
    if ((sec === "chase" || sec === "escape") && (st === 6 || st === 14)) stb(o, t, [r + 12, r + 13], st === 6 ? 0.9 : 0.7, six * 0.6, st === 6 ? -0.5 : 0.5);   // metal on metal
    if (sec === "chase" && (st === 6 || st === 14)) horns(o, t, tri.map(function (m) { return m - 12; }), six * 1.5, 0.05, { a: 0.01, pan: st === 6 ? -0.3 : 0.3 });
    if (sec === "fight" && st % 2 === 0 && st % 8 !== 0) stb(o, t, tri, st % 4 === 2 ? 0.55 : 0.4, six * 0.4, st % 4 === 2 ? -0.45 : 0.45);   // stabs on the 8ths
    // the hero's theme: horns and lead in the fight, both leads an octave apart in the escape
    lineAt(SIG.hero, pos).forEach(function (n) {
      if (sec === "fight") { horns(o, t, [n[1] - 12], n[2] * six, 0.05, { a: 0.02 }); if (k >= 24) o.la.play(t, n[1], n[2] * six, 0.07); }
      if (sec === "escape") { o.la.play(t, n[1] + 12, n[2] * six, 0.075); o.lb.play(t, n[1], n[2] * six, 0.065); }
    });
  }

  /* Golden · the dance break, 48 bars of K-pop and hip hop, with tunes of its own: 0-7 the cypher (boom-bap, a music-box
   * riff, DJ scratches) · 8-15 the verse (trap: 808s, rolling hats, the vocal chop) · 16-23 the pre-chorus (Am to B7,
   * climbing) · 24-31 the chorus (the royal-road progression, C D Bm Em, and a sung line on the lead) · 32-39 the dance
   * break (the beat switching every two bars, an 808 bass line, "hey!") · 40-47 the last chorus, a whole step up, with
   * a harmony a third below, coming home for the last two bars. */
  var DB = {
    road: [{ r: 36, tri: [48, 52, 55] }, { r: 38, tri: [50, 54, 57] }, { r: 35, tri: [47, 50, 54] }, { r: 40, tri: [52, 55, 59] }],   // C D Bm Em
    pre: [{ r: 33, tri: [45, 48, 52] }, { r: 33, tri: [45, 48, 52] }, { r: 35, tri: [47, 51, 54] }, { r: 35, tri: [47, 51, 54] }],   // Am Am B B
    // the chorus: E G A over C, F# A B over D, D F# B over Bm, and it settles on E
    chorus: [[0, 76, 4], [4, 79, 4], [8, 81, 6], [14, 79, 2], [16, 76, 8], [24, 74, 4], [28, 76, 4], [32, 78, 4], [36, 81, 4], [40, 83, 6], [46, 81, 2],
             [48, 78, 8], [56, 74, 4], [60, 78, 4], [64, 74, 4], [68, 78, 4], [72, 83, 8], [80, 81, 4], [84, 78, 4], [88, 76, 4], [92, 78, 4],
             [96, 79, 6], [102, 78, 2], [104, 76, 8], [112, 71, 4], [116, 74, 4], [120, 76, 8]],
    // the pre-chorus climbs: C D E, back down, then D# F# A B over B7
    preLine: [[0, 72, 4], [4, 74, 4], [8, 76, 8], [16, 76, 4], [20, 74, 4], [24, 72, 8], [32, 75, 4], [36, 78, 4], [40, 81, 8], [48, 83, 8], [56, 81, 4], [60, 78, 4]],
    // the cypher's music box: a quick riff that tumbles from B down to B
    riff: [[0, 83, 2], [2, 79, 2], [4, 76, 2], [6, 79, 2], [8, 83, 4], [12, 81, 4], [16, 79, 2], [18, 76, 2], [20, 74, 2], [22, 76, 2], [24, 71, 8]],
    bass808: [0, null, null, 0, null, null, 7, null, 0, null, 12, null, 10, null, 7, null]   // the break's 808 line, over the root
  };
  function sigDance(o, t, st, bar) {
    var k = bar - 100, six = o.six;
    var sec = k < 8 ? "rap" : k < 16 ? "trap" : k < 24 ? "pre" : k < 32 ? "chorus" : k < 40 ? "break" : "lift";
    var sung = sec === "chorus" || sec === "lift", home = sec === "lift" && bar >= SIG_END - 2;
    var up = sec === "lift" && !home ? 2 : 0, c0 = home ? T1.ch[0] : sung ? DB.road[(k >> 1) % 4] : sec === "pre" ? DB.pre[(k >> 1) % 4] : T1.ch[Math.floor(bar / 2) % 4];
    var c = { r: c0.r + up, tri: c0.tri.map(function (m) { return m + up; }) }, pos = (k % 8) * 16 + st;
    if (st === 0) {
      if (k === 0) mixTo(o, t, { stab: 1.1, keys: 1.1 }, 0.05);
      sweep(o, "arpF", sec === "pre" ? 1800 : 2600, t, 0.2);
      sweep(o, "fuzzF", 1300, t, 0.4);
      o.sub.set(t, c.r - 12, sec === "rap" || sec === "trap" ? 0.08 : 0.12);
      if ((sec === "pre" || sung) && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, sung ? 0.035 : 0.045, { a: six * (sung ? 2 : 4), r: 1.4 });
      if (k === 20) riser(o, t, six * 64, 0.045);
      if (k === 24 || k === 32 || k === 40) crash(o, t, k === 40 ? 0.3 : k === 32 ? 0.25 : 0.5);
      if (bar % 4 === 0) glass(o, t, [c.tri[2] + 24, c.tri[0] + 36], six * 48, 0.01);
      if (home && bar === SIG_END - 1) { sm(o, t, [52, 55, 59, 64], six * 16, 0.05, { a: 0.05, r: 2.5 }); box(o, t, 88, 0.6, 3, 0); }
    }
    if (home && bar === SIG_END - 1) return;   // the last bar: the chord and one glint
    if (sec === "rap") boomBap(o, t, st, bar);
    else if (sec === "trap") trapBeat(o, t, st, bar);
    else if (sec === "break") danceBreak(o, t, st, bar, k, c);
    else kit(o, t, st, bar, sec === "pre" ? (k < 20 ? 1 : 2) : 3, { four: sung, back: true, fill: bar === 123 || bar === 131 || bar === 145 });
    if ((sec === "rap" || sec === "break") && bar % 2 === 1 && (st === 12 || st === 14)) scr(o, t, c.tri[0] + 12 + (st === 14 ? 5 : 0), six * 1.2, 0.05, st === 12 ? -0.4 : 0.4);   // the DJ
    if ((sec === "rap" || sec === "trap") && [0, 3, 6, 10].indexOf(st) >= 0) keys(o, t, c.tri[st % 3] + 12, 0.42, six * 2);   // syncopated piano chords
    if (sec === "rap") DB.riff.forEach(function (n) { if (n[0] === (k % 2) * 16 + st) box(o, t, n[1], 0.6, n[2] * six * 1.3, 0); });
    if (sec === "trap") { chop(o, t, st, c.tri); if (st % 8 === 0 || st === 11) fz(o, t, c.r, 0.7, six * 1.6); }   // the vocal chop, and the 808 bass under the kicks
    if (sec === "pre") {
      parp(o, t, pulseOf(c, st, C3.arp), st % 4 === 0 ? 0.9 : 0.6, six * 0.7, st % 2 ? 0.4 : -0.4);
      lineAt(DB.preLine, ((k - 16) % 4) * 16 + st).forEach(function (n) { o.lb.play(t, n[1], n[2] * six, 0.06); });
      if (k >= 22 && st % (k === 23 ? 1 : 2) === 0) rollHit(o, t, 0.4);
      if (k === 23 && st === 8) subDrop(o, t, six * 8, 0.25);
    }
    if (sung && !home) {
      if (C3.roll.indexOf(st) >= 0) fz(o, t, c.r + (st % 4 === 3 ? 12 : 0), st % 4 === 2 ? 0.9 : 0.65, six * 0.8);
      chop(o, t, st, c.tri);
      if (st === 0 || st === 8) stb(o, t, c.tri, 0.7, six * 0.8, st ? 0.5 : -0.5);
      lineAt(DB.chorus, pos).forEach(function (n) {
        o.lead.play(t, n[1] + up, n[2] * six, 0.08);
        box(o, t, n[1] + 12 + up, 0.25, n[2] * six, 0);   // a bell doubling the line, an octave up
        if (sec === "lift") o.lb.play(t, n[1] + up - ([4, 6, 11].indexOf(n[1] % 12) >= 0 ? 4 : 3), n[2] * six, 0.05);   // a third below, in the key
      });
    }
    if (home) { if (st % 4 === 0) kit(o, t, st, bar, 1, {}); if (st === 0) keys(o, t, 64, 0.5, 3); }
  }
  // hip hop: a swung boom-bap - the kick on 1 and the "a" of 2, snare and clap on 2 and 4, lazy 16th hats
  function boomBap(o, t, st, bar) {
    var six = o.six, sw = st % 2 ? six * 0.18 : 0;
    if (st === 0 || st === 7 || (st === 10 && bar % 2)) kick808(o, t, st ? 0.75 : 0.95);
    if (st === 4 || st === 12) { snare(o, t, 0.7); clap(o, t, 0.35); }
    if (st % 2 === 0 || st % 4 === 3) hh(o, t + sw, st % 4 === 0 ? 0.55 : 0.35, false, st % 4 < 2 ? -0.25 : 0.25);
    if (st === 14 && bar % 4 === 3) hh(o, t, 0.5, true, 0.3);
  }
  // trap: a half-time clap, 808s, the hats rolling in 32nds and triplets
  function trapBeat(o, t, st, bar) {
    var six = o.six;
    if (st === 0 || st === 11 || (st === 6 && bar % 2)) kick808(o, t, 0.9);
    if (st === 8) { clap(o, t, 0.75); snap(o, t, 0.6); }
    if (bar % 2 === 1 && st >= 12) for (var i = 0; i < 3; i++) hh(o, t + i * six / 3, 0.3 + i * 0.1, false, 0.15);   // a triplet roll
    else if (bar % 4 === 2 && st >= 8 && st < 12) { hh(o, t, 0.4, false, -0.15); hh(o, t + six / 2, 0.35, false, 0.15); }   // 32nds
    else if (st % 2 === 0) hh(o, t, st % 4 === 0 ? 0.55 : 0.4, false, st % 4 ? 0.2 : -0.2);
  }
  // the dance break: the beat switches every two bars (half time, then double time), claps stacked, 808s punching
  function danceBreak(o, t, st, bar, k, c) {
    var six = o.six, dbl = (k >> 1) % 2 === 1, b8 = DB.bass808[st];
    if (b8 !== null) fz(o, t, c.r + b8, st % 8 === 0 ? 0.9 : 0.7, six * 1.4);   // the 808 bass line
    if (dbl) {
      if (st % 4 === 0) kick808(o, t, 0.9);
      if (st % 8 === 4) { clap(o, t, 0.8); snare(o, t, 0.55); }
      hh(o, t, st % 2 ? 0.3 : 0.5, st % 4 === 2, st % 2 ? 0.25 : -0.25);
    } else {
      if (st === 0 || st === 3 || st === 10) kick808(o, t, 0.95);
      if (st === 8) { clap(o, t, 0.9); snap(o, t, 0.7); snare(o, t, 0.5); }
      if (st % 2 === 0) hh(o, t, 0.45, false, 0);
      if (bar % 2 === 1 && st >= 13) hh(o, t + six / 2, 0.4, false, 0.2);
    }
    if (k % 2 === 1 && (st === 4 || st === 12)) stb(o, t, [c.tri[0] + 24, c.tri[2] + 24], 0.55, six * 0.3, st === 4 ? -0.6 : 0.6);   // "hey!"
  }

  // The joins between chapters: nothing just stops. A chapter going somewhere quieter drains away into it, and
  // something carries across; a chapter arriving bigger is announced (a riser) and lands (an impact).
  function cutSeam(o, t, st, bar) {
    if (st !== 0) return;
    var six = o.six, style = o.P.style;
    if (bar === 14) sm(o, t, [40, 52, 55, 59], six * 48, 0.025, { a: six * 24, r: 3, w: 0.6 });   // cold open → boot: a pad, already the pulse's Em
    if (bar === 26) riser(o, t, six * 32, 0.05);
    if (bar === 32) { crash(o, t, 0.3); boom(o, t, 0.25); }   // the theme lands (the cut joins it at 32)
    if (bar === 66 || bar === 67) { sweep(o, "fuzzF", bar === 66 ? 600 : 380, t, six * 6); sweep(o, "arpF", bar === 66 ? 700 : 420, t, six * 8); }   // the theme drains away into the dark
    if (bar === 66) wind(o, t, six * 40, 0.9);
    if (bar === 67) heart(o, t + six * 8, 0.5);
    if (bar === 98) riser(o, t, six * 32, 0.05);
    if (bar === 100) crash(o, t, 0.25);
    if (bar === SIG_END - 2 && style === "kpop") riser(o, t, six * 32, 0.05);
    if (bar === SIG_END) boom(o, t, 0.4);   // two cursors start on an impact, not out of nothing
    if (bar === 276) { sm(o, t, [40, 52, 55, 59], six * 32, 0.025, { a: six * 2, r: 4, w: 0.5 }); sweep(o, "padF", 1600, t, 0.2); }   // flight → dawn: Em, dawn's first chord, swelling under the last bars
    if (bar === 278) { crash(o, t, 0.15); boom(o, t, 0.25); }
  }

  function duelDrums(o, t, st, bar, d, withRide) {   // the battle of wits' kit, with each palette's accents on top
    var six = o.six;
    if (d === "full") { if (st === 0 || st === 10) kick(o, t, 1); if (st === 4 || st === 12) snare(o, t, 1); if (st === 7 || st === 15) snare(o, t, 0.28); }
    else if (d === "half") { if (st === 0) kick(o, t, 0.9); if (st === 8) snare(o, t, 0.85); }
    else if (d === "soft") { if (st === 0 || st === 10) softKick(o, t, 0.8); }
    if (d === "soft") { if (st % 4 === 2) hh(o, t, 0.45, false, 0.3); }
    else hh(o, t, st % 2 ? 0.3 : st % 4 === 2 ? 0.85 : 0.55, false, st % 4 < 2 ? -0.35 : 0.35);
    if (withRide && st % 4 === 2) ride(o, t, 0.9);
    if (o.P.style === "kpop" && d === "full") { if (bar % 4 === 3 && st >= 12) hh(o, t + six / 2, 0.35 + (st - 12) * 0.12, false, 0.15); if (st === 4 || st === 12) snap(o, t, 0.7); }
    if (o.P.style === "industrial" && (d === "full" || d === "half")) { if (st === 2 || st === 14) rumble(o, t, 0.8); if (st === 7 || st === 15) clank(o, t, 0.35); }
  }
  function cutCursors(o, t, st, bar) {   // 132–196 · 124 → 172 · two cursors, one shell: the duel, and B answering with the hook
    var k = bar - 132, c = B4.ch[Math.floor(bar / 2) % 4], six = o.six;
    var sec = k < 4 ? "run" : k < 12 ? "handshake" : k < 32 ? "exploit" : k < 40 ? "stalemate" : k < 60 ? "root" : "commit";
    if (st === 0) {
      if (k === 0) { mixTo(o, t, {}, 0.05); tremTo(o, t, 0); }
      o.sub.set(t, c.r - 12, sec === "run" || sec === "handshake" || sec === "stalemate" ? 0.1 : 0.18);
      sweep(o, "padF", sec === "stalemate" ? 2200 : 1300, t, 1);
      if ((sec === "run" || sec === "handshake" || sec === "stalemate" || sec === "commit") && bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[0] + 12]), six * 32, 0.035, { a: six * 2, r: 1.4 });
      var rz = sec === "exploit" || sec === "root" || sec === "commit" ? 1 : sec === "stalemate" ? 0.6 : sec === "handshake" && k >= 8 ? 0.5 : 0;
      if (rz && bar % 2 === 0) { o.reese.rate(t, sec === "root" || sec === "commit" ? 0.55 : 0.35); o.reese.play(t, c.r, six * 30, 0.19 * rz); }
      if (bar === 140 || bar === 168 || bar === 188) riser(o, t, six * 64, 0.03);
      if (bar === 144 || bar === 160 || bar === 172 || bar === 192) crash(o, t, 0.5);
      if ((sec === "exploit" && bar % 8 === 0) || (sec === "root" && bar % 4 === 0)) stb(o, t, c.tri, 1, six * 2, bar % 8 < 4 ? -0.5 : 0.5);
    }
    if ((bar === 143 || bar === 171) && st === 8) subDrop(o, t, six * 8, 0.25);
    if (sec === "exploit" && bar % 4 === 3 && st === 12) o.reese.play(t, c.r + 12, six * 4, 0.17);
    if (sec === "run" || sec === "handshake") {   // two people typing; in the run-up a roll that speeds up with the tempo
      if (B4.typeA.indexOf(st) >= 0) blip(o, t, 0.45, -0.75, 3600);
      if (B4.typeB.indexOf(st) >= 0) blip(o, t, 0.4, 0.75, 4300);
      if (sec === "run") { if (st % (k < 2 ? 2 : 1) === 0) rollHit(o, t, 0.4); if (st === 0) kick(o, t, 0.8); return; }
    }
    var local = (bar % 2) * 16 + st;
    if (sec === "handshake" || sec === "exploit") {   // the duel as written: a phrase every two bars, tentative at first
      var ph = B4.duel[Math.floor((bar - 136) / 2) % 8], who = ph[0] === "a" ? o.la : o.lb;
      ph[1].forEach(function (n) { if (n[0] * 2 === local) who.play(t, n[1], n[2] * six * 2, sec === "handshake" ? 0.05 : 0.08); });
    }
    if (sec === "stalemate") {   // together, at half speed
      var pair = (bar >> 1) % 4 * 2;
      B4.duel[pair][1].forEach(function (n) { if (n[0] * 2 === local) o.la.play(t, n[1], n[2] * six * 2, 0.065); });
      B4.duel[pair + 1][1].forEach(function (n) { if (n[0] * 2 === local) o.lb.play(t, n[1] - 12, n[2] * six * 2, 0.06); });
      if (bar % 2 === 1 && st >= 12) { stb(o, t, c.tri, 0.45, six * 0.25, st % 2 ? 0.7 : -0.7); stb(o, t + six * 0.5, c.tri, 0.35, six * 0.25, st % 2 ? -0.7 : 0.7); }
    }
    if (sec === "root") {   // new in this telling: A keeps its phrases, B answers with the theme's soaring line, twice as fast
      if (bar % 2 === 0) B4.duel[(bar >> 1) % 4 * 2][1].forEach(function (n) { if (n[0] === st) o.la.play(t, n[1], n[2] * six, 0.08); });
      else lineAt(T1.soar, ((bar >> 1) % 4) * 32 + st * 2).forEach(function (n) { o.lb.play(t, n[1], n[2] * six / 2, 0.07); });
    }
    if (sec === "commit") hookAt((k - 60) * 16 + st).forEach(function (n) { o.la.play(t, n[1] + 12, n[2] * six, 0.075); o.lb.play(t, n[1], n[2] * six, 0.06); });   // the last commit: both of them, the hook
    duelDrums(o, t, st, bar, sec === "handshake" ? "soft" : sec === "stalemate" ? "half" : "full", sec === "root" || sec === "commit");
    if (sec !== "handshake" && sec !== "stalemate") chop(o, t, st, c.tri);
  }
  function cutCollapse(o, t, st, bar) {   // 196–202 · 86 → 66 · the hit, a tape-stop dive, a heartbeat running down
    var six = o.six, k = bar - 196;
    if (st === 0) {
      o.sub.set(t, 28, Math.max(0.03, 0.16 - k * 0.025));
      if (k === 0) {
        kick(o, t, 0.6); tom(o, t, 62, 0.55); crash(o, t, 0.2); stb(o, t, [52, 55, 59], 0.65, six * 2, 0);
        o.reese.rate(t, 0.2); o.reese.play(t, 40, six * 24, 0.15);
        sm(o, t, [28, 40, 47], six * 48, 0.05, { a: 0.02, r: 4, w: 0.3 });
      }
      if (k === 2) sm(o, t, [52, 53, 59], six * 48, 0.045, { a: six * 8, r: 3 });
      if (k === 4) sm(o, t, [40, 47, 52], six * 32, 0.05, { a: six * 4, r: 3, w: 0.6, wave: "triangle" });
      if (k === 4) { keys(o, t, 28, 0.8, 6); keys(o, t, 29, 0.5, 6); sm(o, t, [52, 55, 59, 64], six * 40, 0.05, { a: six * 2, r: 3 }); }
    }
    if (k === 0 && st === 4) o.reese.bend(t, 16, six * 6);
    if (k >= 1 && (st === 0 || (k < 3 && st === 8))) heart(o, t, 0.7);
  }
  function cutThreeAm(o, t, st, bar) {   // 202–230 · 66 · the character alone at 3 AM: the piano's melody, the strings coming up under it
    var k = bar - 202, c = C3.ch[Math.floor(bar / 2) % 4], mb = k % 8, six = o.six, sec = k < 8 ? "piano" : k < 16 ? "memory" : k < 24 ? "truth" : "climb", style = o.P.style;
    if (st === 0) {
      if (k === 0) mixTo(o, t, { arp: 0.45 }, 0.05);
      if (k === 16) mixTo(o, t, { arp: 0.8 }, 0.05);
      sweep(o, "padF", sec === "climb" ? 2600 : 1700, t, 1.6);
      sweep(o, "arpF", 520 + k * 60, t, 1.2);
      o.sub.set(t, c.r - 12, sec === "piano" ? 0.02 : sec === "climb" ? 0.09 : 0.05);
      if (bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[1] + 12]), six * 32, sec === "climb" ? 0.05 : 0.035, { a: six * 2, r: 1.8 });
      if (sec === "truth" && bar % 4 === 0) glass(o, t, [c.tri[2] + 24, c.tri[0] + 36], six * 48, 0.012);
      if (sec !== "truth") keys(o, t, c.r, 0.5, 3.2);
      if (k === 24) riser(o, t, six * 64, 0.045);
      if (style === "industrial" && sec === "memory" && bar % 4 === 0) pad(o, t, c.tri, six * 64, 0.018);   // the choir, under the strings
    }
    if (sec !== "truth" && st === 8 && mb !== 7) keys(o, t, c.tri[1], 0.3, 2.2);
    if (sec !== "truth" && mb === 7) C3.walkup.forEach(function (n) { if (n[0] === st) keys(o, t, n[1], 0.32 + (st - 8) * 0.02, 1.6); });
    if (sec !== "truth") melodyAt(C3.mel, mb, st).forEach(function (n) {
      keys(o, t, n[2], sec === "piano" ? 1.3 : 0.9, n[3] * six * 1.4);
      if (style === "kpop" && sec === "memory") box(o, t, n[2] + 12, 0.4, n[3] * six * 1.4, 0);
    });
    if (sec === "truth") C3.mel.forEach(function (n) { if (n[0] === Math.floor((k - 16) / 2) && n[1] * 2 === ((k - 16) % 2) * 16 + st) keys(o, t, n[2] - 12, 1.4, n[3] * six * 2.4); });   // half speed, low, alone
    if (sec === "memory" || sec === "climb") parp(o, t, pulseOf(c, st, C3.arp), (st % 4 === 0 ? 1 : 0.7) * (sec === "climb" ? 0.85 : 0.5), six * 0.75, st % 2 ? 0.5 : -0.5);
    if (sec === "climb") {   // no kit: the roll alone carries it up
      if (bar >= 228 && st % (bar === 229 ? 1 : 2) === 0) rollHit(o, t, 0.4);
      if (bar === 229 && st === 8) subDrop(o, t, six * 8, 0.25);
    }
  }
  function cutFly(o, t, st, bar) {   // 230–262 · 132 · learning to fly: the character's theme as trance, then the hook flies with it
    var k = bar - 230, c = C3.ch[Math.floor(bar / 2) % 4], mb = bar % 8, six = o.six, sec = k < 16 ? "release" : k < 24 ? "becoming" : "both";
    if (st === 0) {
      if (k === 0) mixTo(o, t, {}, 0.05);
      sweep(o, "arpF", 3400, t, 1.2); sweep(o, "padF", 2800, t, 1.6); sweep(o, "fuzzF", sec === "release" ? 1100 : 1500, t, 0.5);
      o.sub.set(t, c.r - 12, 0.12);
      if (bar % 2 === 0) sm(o, t, c.tri.concat([c.tri[1] + 12]), six * 32, 0.05, { a: six * 2, r: 1.8 });
      if (k % 8 === 0) crash(o, t, 0.35);
      keys(o, t, c.r, 0.35, 3);
    }
    var both = sec === "both" && mb < 6;   // the hook's last two bars want B major, the melody's want D: there the melody leads alone
    melodyAt(C3.mel, mb, st).forEach(function (n) {
      if (both) o.lb.play(t, n[2], n[3] * six, 0.065);
      else { o.la.play(t, n[2] + 12, n[3] * six, 0.075); if (sec !== "release") o.lb.play(t, n[2], n[3] * six, 0.06); }
    });
    if (both) hookAt(mb * 16 + st).forEach(function (n) { o.la.play(t, n[1] + 12, n[2] * six, 0.075); });   // the theme and the character, one line each
    parp(o, t, pulseOf(c, st, C3.arp), st % 4 === 0 ? 1 : 0.7, six * 0.75, st % 2 ? 0.5 : -0.5);
    kit(o, t, st, bar, 3, { four: true, back: true, fill: bar === 245 || bar === 253 });
    if (sec === "release" && st % 4 === 2) fz(o, t, c.r, 0.9, six * 1.6);
    if (sec !== "release" && C3.roll.indexOf(st) >= 0) fz(o, t, c.r + (st % 4 === 3 ? 12 : 0), st % 4 === 2 ? 0.9 : 0.65, six * 0.8);
    chop(o, t, st, c.tri);
  }
  function cutDawn(o, t, st, bar) {   // 262–310 · 66 → 60, A=432 · the epilogue, and this time the horns sing the hook in G
    var k = bar - 262, six = o.six, style = o.P.style;
    if (k === 0 && st === 0) { mixTo(o, t, {}, 0.05); tremTo(o, t, 0); }
    EPI_CUT.play(o, t, st, k);
    if (k >= 8 && k < 16 && st % 2 === 0) hookAt(((k - 8) * 16 + st) / 2).forEach(function (n) { br2(o, t, [n[1] - 12], n[2] * six * 2, 0.05); });
    if (style === "industrial" && k >= 24 && k < 32 && k % 2 === 0 && st === 0) { var g = E5.grief[(k - 24) % 8]; br2(o, t, [g[2], g[0] + 7], six * 32, 0.03); }   // the low brass, holding the grief up
    if (style === "mrrobot" && k < 8 && (st === 0 || st === 6)) blip(o, t, 0.18, st ? 0.5 : -0.5, 3600);   // the screen still on
    if (style === "kpop" && k >= 50) E5.home.forEach(function (n) { if (n[0] === k - 50 && n[1] === st) box(o, t, n[2] + 12, 0.45, n[3] * six * 1.5, 0); });
  }
  /* The cut plays a list of segments of the chapters above: [first bar, end bar) in the bar numbers they were written
   * in. It keeps every chapter at about a minute to a minute and a half - before, the collapse lasted 19 seconds and
   * dawn over three minutes. The boot runs on from the cold open; two cursors and 3 AM are tightened; dawn is the
   * epilogue in 20 bars (its ashes, what remains with the horns' hook, the weight lifts, last light). The tempo map,
   * the tuning and the section names are all read through the map, so each segment keeps its own. */
  var CUT_SEGS = [[0, 16], [16, 28], [32, 68], [68, 100], [100, 148], [148, 172], [180, 200], [208, 212],
                  [212, 226], [234, 238], [242, 246], [246, 278], [278, 282], [286, 294], [318, 324], [328, 334]];
  var CUT_MAP = []; CUT_SEGS.forEach(function (s) { for (var b = s[0]; b < s[1]; b++) CUT_MAP.push(b); });   // bar -> the bar it plays
  function cutOld(pos) { var b = Math.max(0, Math.floor(pos)), n = CUT_MAP.length; return b < n ? CUT_MAP[b] + (pos - b) : CUT_MAP[n - 1] + 1 + (pos - n); }
  CUT.chapters = [[0, "cold open"], [28, "the theme"], [64, "something in the dark"], [96, null], [144, "two cursors"], [192, "3 AM"], [214, "learning to fly"], [246, "dawn"]];
  var SONG_CUT = {
    flat_golden: [7.1, 4.1, 4.8, 5.5, 6.3, 5.3, 5.8, 5.4, 4.8, 3.5, 4.5, 5.0, 5.9, 4.9, 4.8, 2.8, 1.0, 1.8, 1.9, 2.7, 2.7, 3.3, 2.2, 2.7, 7.6, 10.5, 10.7, 8.8, 6.7, 8.0, 8.1, 7.9, 3.9, 4.5, 4.3, 4.0, 3.1, 3.1, 4.2, 3.9, -2.2, -1.6, -2.2, -1.7, -2.3, -2.2, -2.5, -2.1, -0.3, -0.9, -1.5, -1.6, -1.6, -1.8, -1.8, -2.8, -3.5, -2.9, -2.8, -2.1, -3.7, -2.8, -4.1, -2.8, -1.7, -1.0, -2.2, -0.9, -2.3, -0.9, -2.0, -1.3, -3.8, -2.3, -3.1, -2.6, -2.7, -1.9, -2.9, -2.4, -0.1, 0.6, -0.2, 0.2, 0.3, 1.1, -0.2, -0.3, -0.5, 1.1, 0.5, 1.5, 0.4, 1.7, 0.1, 1.1, 9.6, 11.7, 12.0, 12.0, 12.0, 10.1, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 10.8, 12.0, 12.0, 0.3, -0.1, -0.2, -0.1, -1.2, -1.5, -1.5, -2.8, -2.7, -2.2, -2.4, -2.1, -2.0, -2.3, -2.2, -2.4, 11.0, 12.0, 12.0, 12.0, 12.0, 10.5, 12.0, 12.0, -4.0, -3.3, -3.4, -3.2, -2.8, -3.5, 4.4, 8.6, 8.2, 9.7, 4.6, 4.8, 4.5, 8.9, 6.3, 10.3, 1.0, 3.7, 1.8, 2.2, -6.1, -5.5, -4.0, -6.0, -4.6, -3.5, -3.9, -6.0, -5.5, -4.5, -3.8, -5.6, -2.1, -1.7, -2.6, -1.6, -3.1, -1.8, -2.2, -1.2, -5.5, -3.5, -5.8, -3.8, -6.3, -4.2, -5.1, -4.2, -5.4, -2.5, -5.3, -4.4, -7.6, -4.0, -6.6, -4.6, -0.3, 12.0, 12.0, 12.0, 9.0, 10.6, 10.0, 12.0, 11.7, 11.8, 12.0, 12.0, 12.0, 11.4, 12.0, 12.0, 10.8, 10.5, 8.5, 8.5, 6.1, 4.2, -2.8, -1.7, -2.9, -2.3, -2.3, -1.5, -2.7, -2.4, -2.4, -1.6, -3.0, -2.3, -2.2, -1.6, -2.6, -2.6, -3.4, -2.6, -3.7, -3.1, -2.9, -2.6, -3.4, -3.5, -3.3, -2.7, -3.8, -2.8, -3.7, -2.4, -4.2, -4.0, 10.8, 12.0, 11.9, 12.0, 7.4, 7.8, 7.3, 10.6, 7.7, 6.7, 7.5, 10.3, 2.5, 2.4, 5.1, 5.6, 2.2, 2.0, 8.8, 10.0, 11.4, 9.9, 11.5, 11.9],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [7.6, 4.4, 3.9, 5.7, 5.7, 5.3, 6.1, 6.2, 6.2, 4.0, 4.5, 5.5, 6.8, 5.2, 5.1, 3.1, 2.1, 3.1, 2.4, 3.1, 3.6, 4.2, 3.9, 4.8, 7.8, 12.0, 12.0, 10.3, 6.8, 7.5, 8.5, 7.7, 5.3, 6.2, 5.9, 6.2, 4.6, 4.7, 5.4, 6.0, -0.7, 0.6, -0.5, 0.2, -0.9, -0.6, -0.6, -0.5, 1.9, 1.3, 1.5, 1.8, 1.2, 0.9, 0.7, -1.1, -2.0, -1.3, -1.3, -0.6, -3.5, -3.0, -4.2, -3.1, -0.5, 0.9, -1.2, -0.1, -0.4, 0.2, -0.5, 0.8, -3.6, -2.1, -2.9, -2.7, -2.8, -2.1, -2.7, -2.2, 1.4, 3.2, 0.8, 0.9, 1.2, 2.6, 0.8, 1.5, -2.3, -0.5, -1.5, -0.6, -2.0, -0.7, -1.6, 0.2, -1.2, 2.3, 1.7, 2.4, 7.1, 6.6, 6.6, 6.7, 0.7, 1.4, 1.5, 1.7, 1.8, 1.7, 1.6, 1.6, 3.1, 3.6, 2.8, 0.3, -1.7, -0.9, -1.1, -1.2, -1.4, -1.5, -1.6, -2.0, -1.9, -1.8, -2.2, -2.1, 6.7, 7.2, 6.6, 6.8, -2.3, -1.2, -1.5, -1.4, -1.0, -0.9, -1.2, -1.1, -1.5, -1.1, -1.4, 1.5, 3.7, 5.4, 2.2, 3.5, 3.0, 5.7, 4.2, 5.8, -0.2, 1.8, 0.9, 0.5, -5.9, -4.8, -4.6, -5.4, -5.1, -2.2, -5.2, -4.4, -6.9, -2.3, -6.2, -3.3, -3.1, -0.4, -3.6, 0.1, -4.5, -1.0, -3.4, -0.7, -5.8, -3.2, -5.9, -2.8, -6.3, -3.3, -5.0, -3.9, -5.6, -2.6, -5.5, -2.4, -7.0, -5.1, -6.8, -3.3, -0.7, 4.6, 4.5, 5.1, 2.3, 3.9, 3.1, 5.8, 5.4, 6.0, 5.9, 6.4, 5.5, 5.8, 6.7, 6.8, 5.4, 4.8, 2.9, 2.3, 0.4, -0.5, -3.2, -2.3, -3.0, -2.4, -2.5, -1.9, -3.1, -2.8, -3.1, -2.4, -3.1, -2.3, -2.5, -1.9, -3.5, -3.1, -4.2, -3.2, -4.0, -3.1, -3.1, -2.5, -3.8, -3.4, -3.7, -2.9, -3.9, -2.9, -3.3, -2.3, -4.1, -4.0, 3.3, 5.4, 4.1, 4.5, 3.2, 3.2, 3.3, 5.6, 2.6, 2.9, 4.1, 5.6, -2.2, -2.8, -2.2, -1.1, -3.1, -2.9, 3.1, 4.0, 3.5, 1.6, 3.0, 4.1],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [8.1, 5.4, 5.3, 6.9, 7.2, 6.6, 6.5, 6.4, 6.2, 4.6, 5.3, 6.3, 7.2, 6.9, 5.2, 3.6, 2.2, 3.0, 3.3, 4.1, 4.2, 5.0, 3.2, 4.0, 9.2, 12.0, 12.0, 12.0, 9.1, 12.0, 12.0, 11.8, 7.7, 9.0, 8.4, 9.8, 6.7, 6.5, 8.4, 8.3, -0.5, 0.3, -0.4, 0.1, -0.9, -0.6, -0.5, 0.1, 1.3, 0.7, -0.0, 0.1, -0.1, -0.2, -0.1, -1.0, -2.6, -1.0, -0.5, -0.3, -3.1, -2.6, -4.1, -2.4, -1.0, 0.3, -0.8, 1.0, 0.0, 1.1, -1.0, -0.2, -3.0, -1.8, -1.9, -1.6, -1.7, -0.9, -1.9, -1.3, 1.6, 2.8, 1.3, 2.1, 1.6, 3.0, 1.3, 1.1, -2.2, 0.5, -0.5, 1.0, -0.5, 1.1, -0.7, 0.9, 2.8, 5.0, 4.2, 4.6, 3.8, 4.7, 3.7, 4.4, -1.3, -0.5, 1.2, 1.3, -1.7, -0.6, 0.8, 1.0, -3.1, -2.6, -1.3, -0.7, -3.9, -3.0, -2.3, -2.0, 5.5, 7.5, 6.4, 8.7, 6.9, 7.1, 6.3, 8.2, -2.8, -1.7, 0.3, 0.3, -3.1, -2.1, -0.7, 0.1, -4.6, -3.7, -2.5, -1.9, -4.3, -3.6, -2.8, -2.2, 2.4, 6.6, 4.3, 5.3, 1.5, 4.3, 2.2, 5.2, -0.1, 2.2, -0.3, 0.6, -6.8, -5.3, -5.8, -6.7, -5.5, -3.3, -6.1, -6.1, -6.9, -3.3, -6.4, -5.3, -3.9, -1.9, -4.3, -1.9, -4.9, -1.9, -4.2, -2.0, -6.5, -4.8, -6.1, -3.6, -6.7, -6.2, -6.6, -3.9, -6.1, -4.8, -6.4, -3.3, -7.6, -6.5, -8.0, -5.0, 0.4, 6.2, 4.0, 4.6, 1.5, 2.9, 3.4, 6.4, 5.0, 5.7, 4.0, 4.5, 4.7, 5.0, 6.1, 6.3, 4.4, 4.4, 2.3, 2.2, 0.7, 0.4, -3.8, -2.4, -3.3, -2.4, -3.2, -1.9, -3.3, -2.8, -3.5, -2.0, -3.1, -2.4, -2.2, -1.5, -3.5, -3.0, -4.7, -3.4, -4.1, -3.5, -3.4, -2.5, -4.1, -3.2, -4.2, -2.9, -4.6, -3.8, -3.9, -2.5, -5.2, -4.8, 3.0, 4.9, 4.2, 4.5, 3.6, 3.5, 3.9, 5.0, 3.2, 2.9, 4.4, 5.1, -2.6, -3.2, -2.5, -2.1, -3.4, -3.7, 2.4, 3.3, 3.2, 2.5, 2.8, 2.3],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: CUT_MOOD, bpm: 76, bars: CUT_MAP.length, outroBars: 2, v2: true, duckDepth: 0.4,
    tempo: function (pos) { return mapBpm(CUT.tempo, cutOld(pos)); },
    refAt: function (pos) { pos = cutOld(pos); return pos < 278 ? 440 : pos < 282 ? 440 - 2 * (pos - 278) : 432; },   // dawn retunes to A=432
    chapter: function (bar, theme) { return cutName(bar, (THEMES[theme] || THEMES.phthalo).style); },
    sec: function (bar) { return { id: cutSec(CUT_MAP[Math.min(bar, CUT_MAP.length - 1)]) }; },
    trim: { "phthalo": 8.2, "knight": 5.6, "golden": 5.1 },
    // measured: each section matched to the loudness of its counterpart in the five songs (cutSec names the match)
    lift_golden: { "cold open": 0.0, "boot": 0.0, "boot 2": 0.0, "pulse": 0.0, "theme": 0.0, "break": 0.0, "drive": 0.0, "dark room": 0.0, "something moves": 0.0, "hide": 0.0, "found": 0.0, "sig 1": 0.0, "sig 2": 0.0, "sig 3": 0.0, "sig 4": 0.0, "sig 5": 0.0, "sig 6": 0.0, "run-up": 0.0, "handshake": 0.0, "exploit": 0.0, "stalemate": 0.0, "root": 0.0, "collapse": 0.0, "3 AM": 0.0, "memory": 0.0, "the truth": 0.0, "the climb": 0.0, "release": 0.0, "becoming": 0.0, "dawn: ashes": 0.0, "dawn: what remains": 0.0, "dawn: remember": 0.0, "dawn: grief": 0.0, "dawn: the weight lifts": 0.0, "dawn: last light": 0.0 },
    lift_knight: { "cold open": 0.0, "boot": 0.0, "boot 2": 0.0, "pulse": 0.0, "theme": 0.0, "break": 0.0, "drive": 0.0, "dark room": 0.0, "something moves": 0.0, "hide": 0.0, "found": 0.0, "sig 1": 0.0, "sig 2": 0.0, "sig 3": 0.0, "sig 4": 0.0, "sig 5": 0.0, "sig 6": 0.0, "run-up": 0.0, "handshake": 0.0, "exploit": 0.0, "stalemate": 0.0, "root": 0.0, "collapse": 0.0, "3 AM": 0.0, "memory": 0.0, "the truth": 0.0, "the climb": 0.0, "release": 0.0, "becoming": 0.0, "dawn: ashes": 0.0, "dawn: what remains": 0.0, "dawn: remember": 0.0, "dawn: grief": 0.0, "dawn: the weight lifts": 0.0, "dawn: last light": 0.0 },
    lift_phthalo: { "cold open": 0.0, "boot": 0.0, "boot 2": 0.0, "pulse": 0.0, "theme": 0.0, "break": 0.0, "drive": 0.0, "dark room": 0.0, "something moves": 0.0, "hide": 0.0, "found": 0.0, "sig 1": 0.0, "sig 2": 0.0, "sig 3": 0.0, "sig 4": 0.0, "sig 5": 0.0, "sig 6": 0.0, "run-up": 0.0, "handshake": 0.0, "exploit": 0.0, "stalemate": 0.0, "root": 0.0, "collapse": 0.0, "3 AM": 0.0, "memory": 0.0, "the truth": 0.0, "the climb": 0.0, "release": 0.0, "becoming": 0.0, "dawn: ashes": 0.0, "dawn: what remains": 0.0, "dawn: remember": 0.0, "dawn: grief": 0.0, "dawn: the weight lifts": 0.0, "dawn: last light": 0.0 },
    ramp: 1,
    tone: { sub: -2, punch: 1.5, pres: 1.5 },
    init: function (o, t) {
      o.sub = makeSub(o, t); o.lead = makeLead2(o, t, o.P.lead, -0.35); o.la = makeLead2(o, t, o.P.lead, -0.7); o.lb = makeLead2(o, t, o.P.lead2, 0.7);
      o.reese = makeReese(o, t); o.bin = makeBinaural(o, t, 108, 2.5, 0.02);
    },
    play: function (o, t, st, bar) {
      bar = CUT_MAP[bar];   // from here on, the bar as the chapters count it
      if (bar === 100 && st === 0) tremTo(o, t, 0);
      if (bar < 16) cutCold(o, t, st, bar);
      else if (bar < 28) cutBoot(o, t, st, bar);
      else if (bar < 68) cutTheme(o, t, st, bar);
      else if (bar < 100) cutDark(o, t, st, bar);
      else if (bar < SIG_END) (o.P.style === "industrial" ? sigWarehouse : o.P.style === "kpop" ? sigDance : sigMonologue)(o, t, st, bar);
      else {
        var b = bar - SIG_EXTRA;   // the later chapters count their bars as they were written
        if (b < 196) cutCursors(o, t, st, b);
        else if (b < 202) cutCollapse(o, t, st, b);
        else if (b < 230) cutThreeAm(o, t, st, b);
        else if (b < 262) cutFly(o, t, st, b);
        else cutDawn(o, t, st, b);
      }
      cutSeam(o, t, st, bar);
    },
    outro: EPI_CUT.outro, home: EPI_CUT.home
  };
  /* ---------- bonus track 11 · the monologue (secret: run bundle install on Samuka's page) ----------
   * Phthalo's chapter of the director's cut as a track of its own, in every palette's sound: alone, the inner voice,
   * the argument, the doubt, the build, the speech. Its levels are the cut's (the "sig" sections). */
  var SONG_MONO = {
    flat_golden: [6.0, 4.4, 4.4, 4.8, 4.0, 4.4, 4.0, 4.6, -1.7, -0.3, 1.8, 2.2, -1.7, -0.6, 1.1, 1.7, -3.2, -2.5, -1.0, -0.4, -3.8, -3.0, -1.4, -1.1, 6.5, 6.9, 7.3, 8.5, 6.9, 6.9, 7.2, 8.4, -2.2, -1.2, 0.9, 1.4, -2.6, -1.6, -0.1, 0.1, -2.7, -2.0, -0.6, -0.4, -3.1, -2.5, -1.0, 3.6],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [7.0, 5.6, 5.3, 5.7, 5.0, 5.3, 4.7, 5.3, -1.6, 0.1, 1.2, 1.4, -1.6, -0.1, 0.7, 1.2, -2.4, -1.6, -0.9, 0.1, -3.3, -2.2, -1.7, -1.0, 7.3, 8.3, 8.3, 10.1, 8.5, 8.3, 8.0, 9.9, -2.3, -0.7, 0.5, 1.0, -2.8, -1.8, -1.4, -0.6, -3.8, -2.6, -2.7, -2.0, -4.2, -3.1, -2.8, -1.6],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [6.7, 5.0, 4.6, 4.8, 4.2, 4.8, 4.3, 5.1, -1.4, 0.0, 1.6, 1.8, -1.4, -0.3, 0.9, 1.5, -3.2, -2.7, -0.9, -0.0, -3.9, -2.8, -2.5, -2.4, 6.0, 7.5, 6.9, 8.8, 6.6, 6.3, 6.8, 8.5, -2.7, -1.3, 0.4, 0.7, -2.6, -1.7, -0.6, 0.4, -4.4, -3.8, -2.4, -1.7, -4.2, -3.3, -3.1, -2.1],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "The Monologue · a voice thinking out loud: the bass walking down, a pulse in threes, the hook upside down", bpm: 124, bars: 48, v2: true, duckDepth: 0.4,
    sec: function (bar) { return { id: "sig " + (1 + (bar >> 3)) }; },
    trim: { "phthalo": 8.2, "knight": 5.6, "golden": 5.1 },
    lift_phthalo: { "sig 1": 0.0, "sig 2": 0.0, "sig 3": 0.0, "sig 4": 0.0, "sig 5": 0.0, "sig 6": 0.0 },
    lift_knight: { "sig 1": 0.0, "sig 2": 0.0, "sig 3": 0.0, "sig 4": 0.0, "sig 5": 0.0, "sig 6": 0.0 },
    lift_golden: { "sig 1": 0.0, "sig 2": 0.0, "sig 3": 0.0, "sig 4": 0.0, "sig 5": 0.0, "sig 6": 0.0 },
    ramp: 1, tone: { sub: -2, punch: 1.5, pres: 1.5 },
    init: function (o, t) { o.sub = makeSub(o, t); o.lead = makeLead2(o, t, o.P.lead, -0.35); o.lb = makeLead2(o, t, o.P.lead2, 0.7); },
    play: function (o, t, st, bar) { if (bar === 0 && st === 0) tremTo(o, t, 0); sigMonologue(o, t, st, bar + 100); },
    outroBars: 2,
    outro: function (o, t, st, k) {   // the room after the speech: the pulse in threes, alone and fading, someone typing far off
      var step = (k * 16 + st) % 3;
      if (k === 0) parp(o, t, 52 + SIG.three[step], (st % 4 === 0 ? 0.6 : 0.4) * (1 - st / 20), o.six * 0.7, step === 0 ? -0.5 : step === 1 ? 0 : 0.5);
      if (k === 0 && SIG.type.indexOf(st) >= 0) blip(o, t, 0.12, st % 2 ? 0.7 : -0.7, 3600);
    }
  };
  /* ======================= bonus tracks 7–10 · one per arcade game, unlocked by finishing a run =======================
   * Same rules as the five songs: E minor, A=440, and an outro that ends on the home chord, ringing under whatever
   * comes next, so any track can hand over to any other. Once unlocked they join the main rotation
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

  // 7 · Sidekiq Rush · "the queue" (124 → 146 bpm, about three minutes), written after the game: jobs pour in and get
  // routed to three queues, and every queue has its own sound - critical a sharp ping on the left, default a soft saw in
  // the middle, mailers a bell on the right ("you've got mail"). The three share one riff, a 16th each, so the riff is
  // the routing. Then the backlog: the tempo creeps up and Redis's memory alarm gets louder; autoscale (the drop: a
  // worker more, so a melody more); a rate limit (half the jobs, half time); a Redis flush that drains everything away;
  // batch ×2 (every hat, both leads); and the queue drains, one lane at a time.
  // a job lands in its queue
  function job(o, t, lane, m, v, pan) {
    var f = F(o, m), g = gain(0), p = panner(pan || 0);
    if (lane === "m") {   // mailers: a small FM bell
      var c = osc("sine", f, t, t + 0.6), mod = osc("sine", f * 3.01, t, t + 0.3), mg = gain(f * 1.2);
      mg.gain.setValueAtTime(f * 1.2, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.25); mod.connect(mg); mg.connect(c.frequency);
      env(g, t, 0.002, 0.45, 0.05 * v); c.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.35, 0.3);
      return;
    }
    var crit = lane === "c", s = osc(crit ? "square" : "sawtooth", f, t, t + 0.25, crit ? 0 : 5), lp = filt("lowpass", crit ? 3800 : 1900, crit ? 2 : 1.2);
    if (crit) { s.frequency.setValueAtTime(f * 1.06, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.02); }   // critical arrives with a little bend: urgent
    env(g, t, 0.002, crit ? 0.09 : 0.15, (crit ? 0.04 : 0.05) * v); s.connect(lp); lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.12, crit ? 0.2 : 0);
  }
  function alarm(o, t, v) { beep(o, t, 83, o.six * 3, 0.5 * v); beep(o, t + o.six * 4, 79, o.six * 3, 0.5 * v); }   // Redis running out of memory
  function flush(o, t, len, v) {   // FLUSHALL: a wash of noise that drains down and away
    var n = noiseL(t, len), bp = filt("bandpass", 4000, 1.5), g = gain(0);
    bp.frequency.setValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(150, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(g); g.connect(o.bus); send(o, g, 0.4);
  }
  function zap(o, t, notes, v, pan) {   // a short synth chord stab
    var lp = filt("lowpass", 2400, 2), g = gain(0), p = panner(pan || 0), stop = t + 0.3;
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.18);
    env(g, t, 0.002, 0.18, 0.045 * v / Math.sqrt(notes.length));
    notes.forEach(function (m) { osc("sawtooth", F(o, m), t, stop, -8).connect(lp); osc("sawtooth", F(o, m), t, stop, 8).connect(lp); });
    lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.25, 0.3);
  }
  // 7 · Sidekiq Rush · a hybrid-orchestral rush (132 bpm, three and a half minutes) in Pit Wall's instruments: a
  // rolling bass under low spiccato strings, a high string ostinato, horn stabs, a choir, taiko and shakers around a
  // four-on-the-floor kick, and the sky filter for every build. Three drops; the lead melody is the horns' and violins'.
  var DQ = {
    roots: [40, 40, 36, 38],   // E E C D, two bars each
    chords: { 40: [52, 55, 59], 36: [48, 52, 55], 38: [50, 54, 57] },
    roll: [null, 0, 12, 0, null, 0, 12, 7, null, 0, 12, 0, null, 12, 10, 7],   // 16ths that roll around the kick
    ost: [0, 2, 1, 3, 0, 2, 1, 2, 0, 2, 1, 3, 0, 1, 2, 3],   // the high strings: chord tones, 3 = the octave
    acc: { 0: 1, 3: 1, 6: 1, 8: 1, 11: 1, 14: 1 },
    stab: [3, 6, 11, 14],
    taiko: { 2: [0.45, -0.7, 120], 7: [0.4, 0.7, 100], 10: [0.5, -0.5, 140], 15: [0.45, 0.6, 90] },
    lead: [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 74, 8], [16, 72, 6], [22, 71, 2], [24, 67, 8],
      [32, 76, 4], [36, 79, 4], [40, 78, 2], [42, 74, 6], [48, 71, 16],
      [64, 76, 4], [68, 74, 2], [70, 71, 2], [72, 74, 8], [80, 72, 6], [86, 74, 2], [88, 76, 8],
      [96, 79, 6], [102, 78, 2], [104, 76, 4], [108, 74, 4], [112, 71, 16]],
  };
  // the motif only: the lead - the low strings (twice), the violins, the choir into the first drop (horns and violins),
  // the violins at half speed in the breakdown, the horns alone into the second drop, the low strings in the tunnel,
  // and everything at the end
  DQ.sec = form([
    ["boot", 16, function (k) { return { voice: ["cello"], kick: k >= 2, shk: k >= 4, roll: k < 8 ? 0.45 : 0.6, low: k < 8 ? 0.5 : 0.65, taiko: k >= 8 ? 0.4 : 0, sky: 1725 }; }],
    ["groove", 16, function (k) { return { voice: ["violins"], kick: 1, shk: 1, hats: 1, clap: k >= 8, roll: 0.7, low: 0.7, ost: 0.5, taiko: 0.6, sky: 3150 }; }],
    ["build", 8, function (k) { return { voice: ["choir"], kick: k < 4, kroll: k >= 4, shk: 1, hats: 1, roll: 0.75, low: 0.7, ost: 0.8, taiko: 0.7, sky: 5450, sroll: k >= 4, riser: k === 4 }; }],
    ["drop", 16, function (k) { return { voice: ["horns", "violins"], kick: 1, shk: 1, hats: 2, clap: 1, roll: 1, low: 1, ost: 1, stab: 1, taiko: 1, choir: k % 2 === 0, sky: 9000, hit: k === 0 }; }],
    ["breakdown", 16, function (k) { return { voice: ["violins"], half: 1, choir: k % 2 === 0, ost: 0.45, low: 0.5, taiko: 0.35, sky: 1300 }; }],
    ["build", 8, function (k) { return { voice: ["horns"], v: 0.8, kroll: 1, shk: k >= 4, hats: k >= 4 ? 1 : 0, ost: 0.95, roll: 0.6, low: 0.7, taiko: 0.6, sky: 4650, sroll: k >= 4, riser: k === 4, gap: k === 7 }; }],
    ["drop", 16, function (k) { return { voice: ["horns", "violins"], kick: 1, shk: 1, hats: 2, clap: 1, roll: 1, low: 1.1, ost: 1, stab: 1, taiko: 1, ride: 1, choir: k % 4 === 0, sky: 9500, hit: k === 0 }; }],
    ["tunnel", 8, function (k) { return { voice: ["cello"], kick: 1, shk: 1, roll: 0.8, low: 0.8, ost: 0.85, taiko: 1, sky: 3750, sroll: k >= 4, riser: k === 4, gap: k === 7 }; }],
    ["drop", 8, function (k) { return { voice: ["horns", "violins", "choir"], kick: 1, shk: 1, hats: 2, clap: 1, roll: 1, low: 1.1, ost: 1, stab: 1, taiko: 1, ride: 1, choir: k % 2 === 0, sky: 9500, fill: k === 7, hit: k === 0 }; }]
  ]);
  var SONG_QUEUE = {
    flat_golden: [2.2, 1.1, -0.3, 0.4, 0.2, 0.7, 0.2, 0.6, -0.5, -0.3, -0.6, 0.2, -0.0, 0.1, -0.5, 0.4, -0.2, 0.3, 0.0, 0.8, 0.5, 0.5, 0.4, 0.9, -0.1, 0.1, 0.0, 0.6, 0.1, 0.5, 0.4, 0.6, 2.6, 2.7, 3.0, 3.2, 3.2, 2.8, 1.3, 0.0, -5.0, -3.4, -3.9, -3.1, -3.5, -3.0, -3.6, -3.5, -4.4, -3.5, -3.9, -3.1, -3.5, -2.9, -3.7, -3.4, 0.9, 4.8, 5.9, 5.7, 5.1, 4.9, 6.9, 8.0, 5.0, 5.7, 5.8, 5.5, 5.5, 4.8, 5.5, 5.7, 2.5, 4.0, 4.0, 3.7, 3.7, 3.6, 1.5, 2.0, -5.0, -3.6, -3.6, -3.0, -3.4, -3.1, -3.4, -2.7, -3.9, -3.6, -3.7, -2.7, -3.3, -3.2, -3.3, -2.7, -1.9, -1.6, -2.1, -1.3, -1.7, -1.4, -2.4, -2.0, -5.2, -4.0, -4.4, -3.5, -3.8, -4.0, -4.1, -4.2],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [2.9, 1.7, 0.7, 1.5, 1.1, 1.1, 0.7, 1.8, -0.0, 0.5, -0.2, 0.8, 0.4, 0.7, 0.2, 0.8, -0.1, 0.1, -0.1, 0.4, 0.3, 0.3, 0.2, 0.5, -0.1, -0.1, -0.2, 0.2, 0.3, 0.1, 0.0, 0.3, 1.2, 1.4, 1.3, 1.4, 1.7, 1.7, 0.3, -0.3, -5.3, -4.2, -4.2, -4.0, -3.9, -3.6, -3.9, -4.0, -4.7, -4.2, -4.5, -3.9, -3.9, -3.7, -4.0, -4.0, 2.3, 4.3, 3.8, 4.8, 5.0, 4.7, 4.3, 4.7, 4.9, 5.7, 4.9, 6.3, 6.1, 4.9, 4.5, 4.9, 0.7, 1.7, 1.5, 1.9, 1.7, 1.7, 0.5, 1.2, -5.7, -4.1, -3.8, -3.2, -3.9, -3.8, -3.6, -3.1, -4.3, -4.1, -4.0, -3.1, -3.8, -3.8, -3.7, -3.3, -1.4, -1.1, -1.5, -0.8, -1.0, -1.2, -1.9, -1.1, -5.5, -4.7, -4.8, -4.8, -4.5, -4.3, -4.4, -4.8],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [3.8, 2.7, 0.6, 1.4, 0.5, 0.9, 1.1, 1.4, -0.1, 0.3, -0.0, 0.8, 0.1, 0.3, 0.6, 0.8, 0.1, 0.5, -0.2, 0.6, 0.2, 0.3, 0.4, 0.5, -0.2, 0.1, -0.3, 0.1, 0.1, 0.2, 0.0, 0.4, 1.4, 2.1, 1.4, 2.1, 1.1, 0.8, -2.6, -3.4, -4.9, -3.6, -3.6, -3.3, -3.4, -3.3, -3.9, -3.2, -4.1, -3.8, -3.4, -3.4, -3.6, -3.5, -3.7, -3.1, 3.6, 6.3, 6.6, 6.8, 7.5, 6.4, 6.8, 7.0, 6.5, 6.8, 6.0, 7.4, 6.5, 7.2, 6.3, 6.4, 2.0, 2.7, 2.9, 3.1, 1.0, 1.1, -2.3, 0.3, -4.6, -3.7, -3.4, -2.8, -3.8, -3.5, -3.2, -2.9, -3.8, -3.7, -3.5, -2.8, -3.4, -3.4, -3.5, -2.8, -1.6, -0.9, -1.3, -0.7, -1.2, -1.3, -2.0, -1.6, -5.2, -3.9, -4.2, -3.4, -4.1, -4.0, -4.2, -4.2],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "Sidekiq Rush · one lead, from the low strings to the horns, three drops", bpm: 132, bars: DQ.sec.bars,
    part: function (bar) { return DQ.sec(bar).id; },
    level: { phthalo: -1.9, knight: -2.6, golden: -1.4 },
    init: function (o, t) { o.sub = makeSub(o, t); o.sky = makeSky(o, t, 600); },
    play: function (o, t, st, bar) {
      var sec = DQ.sec(bar), root = DQ.roots[Math.floor(motifBar(sec, 128) / 2) % 4], tri = DQ.chords[root], up = tri.map(function (m) { return m + 12; }), six = o.six, hush = sec.gap && st >= 8;
      o.cut = 300 + Math.min(1300, sec.sky * 0.15);
      if (st === 0) {
        o.sky(t, sec.sky, six * 6);
        o.bassLp.frequency.setTargetAtTime(o.cut * 1.6, t, 0.6);
        o.sub.set(t, root - 12, sec.kick || sec.kroll ? 0.12 + 0.05 * (sec.low || 0) : 0.06);
        if (sec.hit) { crash(o, t, 0.9); boom(o, t, 1); taiko(o, t, 1, -0.5, 70); taiko(o, t, 1, 0.5, 85); horns(o, t, [tri[0], tri[2], tri[0] + 12], six * 6, 0.1, { a: 0.01 }); }
        else if (sec.id === "drop" && sec.k % 8 === 0) crash(o, t, 0.5);
        if (sec.choir) choir(o, t, up, six * (sec.id === "drop" ? 32 : 30), 0.045, { a: six * 6, r: 2, pan: bar % 4 < 2 ? -0.3 : 0.3 });
        if (sec.riser) riser(o, t, six * 64, 0.07);
      }
      if (sec.gap && st === 8) { o.sub.set(t, root - 12, 0.0001); subDrop(o, t, six * 8, 0.9); o.sky(t, 2200, six * 2); }
      if (hush) return;
      if (sec.kick && st % 4 === 0) kick(o, t, 1);
      if (sec.kroll) { var kk = sec.k % 8, ev = kk < 4 ? 4 : kk < 6 ? 2 : 1; if (st % ev === 0) kick(o, t, 0.8); }
      if (sec.clap && (st === 4 || st === 12)) { snare(o, t, 0.55); clap(o, t, 0.4); }
      if (sec.shk) shk(o, t, st % 2 ? 0.4 : 0.7, st % 4 < 2 ? -0.5 : 0.5);
      if (sec.hats === 1 && st % 4 === 2) hat(o, t, 0.6, true);
      if (sec.hats === 2 && st % 4 === 2) hat(o, t, 0.8, true);
      if (sec.ride && st % 4 === 0) ride(o, t, 0.5);
      if (sec.taiko) { var tk = DQ.taiko[st]; if (tk) taiko(o, t, tk[0] * sec.taiko, tk[1], tk[2]); }
      if (sec.sroll) rollAt(o, t, st, bar, sec.from + sec.n - 4, 4);
      var r = DQ.roll[st];
      if (sec.roll && r != null) {   // the rolling bass, doubled by low strings on the off-16ths
        bassNote(o, t, root + r, sec.roll * (st % 2 ? 0.7 : 0.9), six * 0.8);
        if (sec.low && st % 2) spic(o, t, root + 12 + (r === 12 ? 0 : r), 0.8 * sec.low, st % 4 === 1 ? -0.35 : 0.35, 0.25);
      }
      if (sec.ost) { var on = DQ.ost[st] === 3 ? up[0] + 12 : up[DQ.ost[st]], ac = DQ.acc[st]; spic(o, t, on, sec.ost * (ac ? 1 : 0.55), -0.55, sec.sky > 5000 ? 1 : 0.45); if (ac) spic(o, t, on - 12, sec.ost * 0.7, 0.55, 0.6); }
      if (sec.stab && DQ.stab.indexOf(st) >= 0 && (bar % 2 === 1 || st !== 3)) horns(o, t, [tri[0], tri[2]], six * 1.2, st === 3 ? 0.07 : 0.05, { a: 0.008, pan: st % 2 ? 0.25 : -0.25 });
      orchAll(o, t, sec, DQ.lead, st, 128, 67);   // the lead, in this section's voices
      if (sec.fill && st >= 8) taiko(o, t, 1, st % 2 ? 0.6 : -0.6, [140, 125, 110, 100, 90, 80, 72, 64][st - 8]);
    }
  };
  SONG_QUEUE.outroBars = 4;
  SONG_QUEUE.outro = function (o, t, st, k, N) {   // the last chord rings in the horns and the choir, the taiko walk away
    var six = o.six, fade = 1 - k / N;
    if (st === 0) {
      o.sub.set(t, 28, 0.12 * fade + 0.02); o.sky(t, 4000 - k * 800, six * 8);
      if (k === 0) { crash(o, t, 0.8); boom(o, t, 0.8); horns(o, t, [52, 59, 64], six * 24, 0.09, { a: 0.02 }); choir(o, t, [64, 67, 71], six * 40, 0.05, { a: 0.1, r: 3 }); strings(o, t, [40], six * 30, 0.07, { a: 0.05, r: 3, bright: 0.5 }); }
    }
    if (k < 2 && st % 4 === 0) kick(o, t, 1 - k * 0.35);
    if (k < 3 && (st === 2 || st === 10)) taiko(o, t, 0.6 * fade, st === 2 ? -0.6 : 0.6, st === 2 ? 110 : 90);
    if (k < 3) spic(o, t, [64, 71, 67, 76][DQ.ost[st] % 4], (DQ.acc[st] ? 0.8 : 0.4) * fade, st % 2 ? 0.5 : -0.5, 0.5);
  };

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

  /* ---------- tracks 8–10: hybrid-orchestral voices, a "sky" over the mix, and sounds played backwards ----------
   * Three references set the form and the production, never the notes: every melody below is written for these
   * songs. What was taken is how they're built (soundtrack-lab/reports/refs-ac4-f1-fc3.md): sections made by
   * opening and closing the top end at a steady level, elements taking turns instead of stacking, entries that
   * swell or arrive under a closed filter, and the width living in the percussion around a mono bass. */
  // the sky: one lowpass over the whole track, so a section can change by brightness instead of level
  // its gain is the song's level trim for the palette (song.level, dB, measured by rendering: tracks 8–10 sit near −15 LUFS)
  function makeSky(o, t, hz) {
    var f = filt("lowpass", hz, 0.5), lv = gain(Math.pow(10, ((o.song.level && o.song.level[o.theme]) || 0) / 20));
    o.bus.disconnect(); o.bus.connect(f); f.connect(lv); lv.connect(master);
    o.dyn = lv;   // kill() disconnects it with the track; scheduleDyn applies the song's flat_<theme> to it
    return function (tt, to, tc) { f.frequency.setTargetAtTime(to, tt, tc); };
  }
  function spic(o, t, m, v, panV, bright) {   // one short bowed string note (spiccato): the ostinato's grain
    var f = F(o, m), lp = filt("lowpass", 900 + 2600 * (bright == null ? 1 : bright), 0.9), g = gain(0), p = panner(panV || 0), stop = t + 0.2;
    osc("sawtooth", f, t, stop, -6).connect(lp); osc("sawtooth", f, t, stop, 6).connect(lp);
    env(g, t, 0.004, 0.11, 0.045 * v * BAL.strings); lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.18);
  }
  function horns(o, t, notes, len, vol, opt) {   // a horn section: saws behind a lowpass that opens as the note blooms (no vibrato: cheap)
    opt = opt || {};
    var a = opt.a != null ? opt.a : Math.min(0.22, len * 0.3), lp = filt("lowpass", 300, 1), g = gain(0), p = panner(opt.pan || 0), stop = t + len + 0.6;
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1700 * o.P.brass, t + a); lp.frequency.linearRampToValueAtTime(1000 * o.P.brass, t + len);
    swell(g, t, a, len, 0.45, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) { [-7, 7].forEach(function (d) { osc("sawtooth", F(o, m), t, stop, d).connect(lp); }); });
    lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.45);
  }
  function choir(o, t, notes, len, vol, opt) {   // "ah": one saw per voice through two vowel formants
    opt = opt || {};
    var a = opt.a != null ? opt.a : len * 0.4, r = opt.r != null ? opt.r : 1.5, stop = t + Math.max(a, len) + r + 0.1;
    var mix = gain(2.4), f1 = filt("bandpass", 650, 5), f2 = filt("bandpass", 1080, 6), lp = filt("lowpass", 2600, 0.6), g = gain(0), p = panner(opt.pan || 0);
    swell(g, t, a, len, r, vol * BAL.strings / Math.sqrt(notes.length));
    notes.forEach(function (m, i) { osc("sawtooth", F(o, m), t, stop, i % 2 ? 7 : -7).connect(mix); });
    mix.connect(f1); mix.connect(f2); f1.connect(lp); f2.connect(lp); lp.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.9);
  }
  function taiko(o, t, v, panV, f) {   // a big low drum, panned: in all three tracks the percussion carries the width
    f = f || 95;
    var s = osc("sine", f, t, t + 0.7), g = gain(0), p = panner(panV || 0); s.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.35);
    env(g, t, 0.003, 0.55, 0.6 * v); s.connect(g);
    var n = noise(t, 0.06), lp = filt("lowpass", 900), ng = gain(0); env(ng, t, 0.001, 0.05, 0.25 * v); n.connect(lp); lp.connect(ng); ng.connect(g);
    g.connect(p); p.connect(o.drums); send(o, p, 0.35);
  }
  function shk(o, t, v, panV) {   // a shaker
    var n = noise(t, 0.07), hp = filt("highpass", 6000, 0.7), g = gain(0), p = panner(panV || 0);
    env(g, t, 0.006, 0.045, 0.09 * v); n.connect(hp); hp.connect(g); g.connect(p); p.connect(o.drums);
  }
  function glint(o, t, m, v, panV) {   // a gem catching the light: a high bell, very short
    var f = F(o, m), s = osc("sine", f, t, t + 0.9), mod = osc("sine", f * 2.76, t, t + 0.5), mg = gain(f * 1.4), g = gain(0), p = panner(panV || 0);
    mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.3); mod.connect(mg); mg.connect(s.frequency);
    env(g, t, 0.002, 0.7, 0.035 * v); s.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.5, 0.4);
  }
  // backwards: a sound's tail swells up out of nothing and it stops dead where its attack would have been
  function backEnv(g, t, len, peak) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + len);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + len); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.012);
  }
  function backTone(o, t, notes, len, vol, opt) {   // a chord or note backwards, its filter closing toward silence the wrong way round
    opt = opt || {};
    var lp = filt("lowpass", 400, 0.8), g = gain(0), p = panner(opt.pan || 0), stop = t + len + 0.05;
    lp.frequency.setValueAtTime(450, t); lp.frequency.exponentialRampToValueAtTime(opt.bright || 2600, t + len);
    backEnv(g, t, len, vol / Math.sqrt(notes.length));
    notes.forEach(function (m) { [-8, 8].forEach(function (d) { osc(opt.wave || "sawtooth", F(o, m), t, stop, d).connect(lp); }); });
    lp.connect(g); g.connect(p); p.connect(o.duck);
    if (opt.verb) send(o, p, opt.verb);
  }
  function backSpic(o, t, m, len, v, panV) {   // the ostinato backwards: every 16th rushes in and cuts
    var lp = filt("lowpass", 2400, 0.8), g = gain(0), p = panner(panV || 0), f = F(o, m);
    osc("sawtooth", f, t, t + len + 0.03, -6).connect(lp); osc("sawtooth", f, t, t + len + 0.03, 6).connect(lp);
    backEnv(g, t, len, 0.04 * v); lp.connect(g); g.connect(p); p.connect(o.duck);
  }
  function backKick(o, t, len, v) {   // a kick backwards: a low swell that climbs in pitch and stops on the beat
    var s = osc("sine", o.P.kickLow, t, t + len + 0.03), g = gain(0);
    s.frequency.setValueAtTime(o.P.kickLow, t); s.frequency.exponentialRampToValueAtTime(150, t + len);
    backEnv(g, t, len, 0.8 * v); s.connect(g); g.connect(o.drums);
  }
  function backHit(o, t, len, v, hz, panV) {   // a snare, cymbal or hat backwards: filtered noise that rushes in and cuts
    var n = noiseL(t, len + 0.05), f = filt(hz > 5000 ? "highpass" : "bandpass", hz, hz > 5000 ? 0.7 : 0.8), g = gain(0), p = panner(panV || 0);
    backEnv(g, t, len, v); n.connect(f); f.connect(g); g.connect(p); p.connect(o.drums);
  }
  function rewind(o, t, len, v) {   // the tape spooling back: a chirping whirr that speeds up
    var s = osc("sawtooth", 260, t, t + len + 0.05), am = osc("square", 14, t, t + len + 0.05), amg = gain(0.5), body = gain(0.5), bp = filt("bandpass", 1500, 2), g = gain(0);
    s.frequency.exponentialRampToValueAtTime(2600, t + len); am.frequency.exponentialRampToValueAtTime(70, t + len);
    am.connect(amg); amg.connect(body.gain); s.connect(body); body.connect(bp); bp.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * v, t + len * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + len);
    g.connect(o.bus); send(o, g, 0.2);
  }
  function backShift(v8, tt, gears, gearLen, lo, hi) {   // an upshift run backwards: each gear snaps up, then the revs sink
    for (var i = 0; i < gears; i++) { var j = gears - 1 - i, g0 = tt + i * gearLen; v8.rpm(g0, hi * (1 + j * 0.06), 0.012); v8.rpm(g0 + 0.03, lo * (1 + j * 0.12), gearLen * 0.4); }
  }

  // 8 · Gem Match · "match three" (110 bpm, about three minutes), written after the game: bright puzzle pop in G, mallets
  // and pizzicato over a bouncy bass, and every move has a sound - a swap (two notes trading sides), a match (three notes
  // up), cascades that climb, a Pipeline sweeping across the row, a Force push going off, the rainbow Bundle shimmering
  // through every gem at once. Then the last five moves tick down, and the board clears. Six gems, six notes: G A B D E G.
  var PENT = [79, 81, 83, 86, 88, 91, 93, 95];   // the gems, G pentatonic
  function mallet(o, t, m, v, pan, len) {   // a marimba: a sine, and a bright partial that dies at once
    var f = F(o, m), g = gain(0), h = gain(0.35), p = panner(pan || 0), l = len || 0.5;
    osc("sine", f, t, t + l + 0.05).connect(g);
    osc("sine", f * 3.93, t, t + 0.12).connect(h); h.gain.setValueAtTime(0.35, t); h.gain.exponentialRampToValueAtTime(0.001, t + 0.08); h.connect(g);
    env(g, t, 0.002, l, 0.08 * v); g.connect(p); p.connect(o.duck); send(o, p, 0.25, 0.15);
  }
  function swapFx(o, t, m, v) { mallet(o, t, m, 0.6 * v, -0.5, 0.15); mallet(o, t + o.six * 0.5, m + 5, 0.6 * v, 0.5, 0.15); }   // two gems trade places
  function matchFx(o, t, notes, v, pan) { notes.forEach(function (m, i) { glint(o, t + i * o.six * 0.5, m, v, (pan || 0) + (i - 1) * 0.3); }); }   // three in a row
  function pipeline(o, t, len, v) { for (var i = 0; i < 12; i++) mallet(o, t + i * len / 12, 67 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26][i], 0.5 * v, -0.8 + i * 0.145, 0.2); }   // a striped gem clears its row
  function forcePush(o, t, tri, v) { boom(o, t, 0.8 * v); crash(o, t, 0.6 * v); zap(o, t, tri.concat([tri[0] + 12]), 1.2 * v, 0); taiko(o, t, 0.9 * v, 0, 70); }   // a bomb: 3×3 gone
  function bundleFx(o, t, v) { [67, 71, 74, 76, 79, 83, 86, 88, 91, 95].forEach(function (m, i) { glint(o, t + i * o.six * 0.25, m, 0.8 * v, -0.9 + i * 0.2); }); }   // the rainbow Bundle
  function wood(o, t, v, m) { var s = osc("triangle", F(o, m || 84), t, t + 0.06), g = gain(0); env(g, t, 0.001, 0.04, 0.07 * v); s.connect(g); g.connect(o.duck); }   // the move counter
  // 8 · Gem Match · one long crescendo on two chords (81 bpm, about three minutes), after the form of Assassin's
  // Creed IV's "The Ends of the Earth": strings rise out of silence, the low strings bring the weight before
  // anything gets bright, the drums creep in as rolls and then march, a fiddle tune over Em and C, one borrowed turn
  // (A G G D) with the choir, a bar where the drums drop out and two where the bass does, the climax with Em held over
  // a moving bass, and a last chord in E major. The gems glint over the climax.
  var GT = {
    pair: [[40, [52, 55, 59]], [36, [48, 52, 55]]],   // Em, C: a bar each, over an E pedal
    walk: [40, 36, 43, 40],   // the climax: Em held while the bass moves E C G E
    tune: [[0, 71, 6], [6, 72, 2], [8, 71, 4], [12, 67, 4], [16, 64, 8], [24, 67, 4], [28, 72, 4],
      [32, 71, 6], [38, 74, 2], [40, 76, 8], [48, 79, 4], [52, 76, 4], [56, 72, 8],
      [64, 71, 6], [70, 72, 2], [72, 74, 4], [76, 76, 4], [80, 79, 6], [86, 76, 2], [88, 72, 8],
      [96, 74, 4], [100, 71, 4], [104, 67, 4], [108, 69, 4], [112, 71, 12], [124, 69, 2], [126, 67, 2]],
    march: { 0: [1, 0, 72], 6: [0.55, -0.6, 95], 8: [0.8, 0, 80], 11: [0.5, 0.6, 105], 14: [0.6, -0.4, 90] },   // [level, pan, pitch]
  };
  // the motif only: the tune - on the glass lead over still strings, on the low strings as the timpani creep in, on the
  // fiddle with the march, the fiddle and the choir on the open sea, the glass at half speed as the swell recedes,
  // a held breath, then the fiddle and the glass in octaves with the choir and the gems; then the last chord in major
  GT.sec = form([
    ["the call", 8, function (k) { return { voice: ["glass"], hi: 0.9, low: 0.6, sky: 2200, riser: k === 4 }; }],
    ["the hull", 8, function (k) { return { voice: ["cello"], hi: 0.85, low: 0.8, sub: 0.6, roll: 0.33, sky: 2200 }; }],
    ["full sail", 8, function (k) { return { voice: ["fiddle"], hi: 0.9, low: 1, sub: 1, drums: 0.96, sky: 4875, crash: k === 0 }; }],
    ["open sea", 16, function (k) { return { voice: k < 8 ? ["fiddle"] : ["fiddle", "choir"], hi: 1, low: 1, sub: 1, drums: 1, choir: k >= 8, sky: 7000, crash: k % 8 === 0 }; }],
    ["the swell recedes", 8, function (k) { return { voice: ["glass"], half: 1, hi: 0.8, low: 0.85, sub: 0.7, drums: k < 4 ? 0.55 : 0, sky: 3200 }; }],
    ["the hole", 4, function (k) { return { fifths: 1, hi: 0.85, drums: k >= 2 ? 0.9 : 0, snRoll: k === 3, sky: 4000, riser: k === 0 }; }],
    ["the ends of the earth", 16, function (k) { return { voice: ["fiddle", "glass low"], walk: 1, hi: 1.1, low: 1.2, sub: 1.3, drums: 1.1, choir: 1, glint: 1, sky: 9000, crash: k % 4 === 0 && k < 8 || k === 8 }; }],
    ["landfall", 2, function (k) { return { picardy: k === 0, sky: 2425, glint: k === 1 ? 0.5 : 0 }; }]
  ]);
  var SONG_GEMS = {
    flat_golden: [6.2, 3.7, 3.9, 3.0, 2.5, 2.8, 2.9, 3.0, -0.2, -0.0, -0.2, 0.4, -0.1, 0.2, -0.3, 0.2, 0.2, 0.5, 0.3, 0.1, 0.1, 0.5, 0.1, 0.6, -0.2, -0.2, -0.3, 0.1, -0.3, 0.2, -0.3, -0.3, -0.7, -0.6, -0.5, -0.2, -0.7, -0.4, -0.8, -0.5, 1.4, 2.1, 2.3, 1.9, 1.6, 1.1, 1.4, 1.6, 5.1, 6.5, 5.0, 4.3, -1.6, -1.3, -1.6, -1.6, -1.7, -1.2, -1.8, -1.7, -1.7, -1.3, -1.9, -2.0, -1.8, -1.5, -2.0, -1.9, 0.0, 0.0],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [4.5, 2.5, 3.1, 2.2, 2.2, 2.5, 2.4, 2.4, 0.0, 0.1, -0.0, 0.5, -0.2, 0.2, -0.3, -0.0, 0.2, 0.4, 0.0, 0.5, 0.3, 0.5, 0.1, 0.4, 0.0, 0.0, -0.2, 0.1, -0.3, -0.4, -0.2, -0.0, -0.8, -0.6, -0.8, -0.5, -0.9, -0.6, -1.0, -0.8, 1.2, 1.8, 1.8, 1.6, 1.6, 1.4, 1.6, 1.6, 4.0, 4.2, 3.2, 2.8, -1.5, -1.6, -2.1, -1.8, -1.9, -1.4, -2.0, -1.5, -1.7, -1.2, -2.1, -1.4, -1.8, -1.5, -2.2, -1.7, -0.3, -0.2],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [6.6, 3.5, 4.6, 3.2, 3.2, 3.3, 3.4, 3.4, 0.2, 0.3, 0.1, 0.2, -0.3, 0.1, -0.2, -0.0, 0.1, 0.6, 0.2, 0.1, 0.2, 0.2, 0.1, 0.3, -0.4, 0.0, -0.1, -0.1, -0.2, -0.0, -0.3, -0.2, -1.2, -0.6, -1.1, -0.9, -0.5, -0.9, -1.0, -0.5, 1.4, 2.0, 2.1, 2.2, 2.4, 1.9, 2.2, 1.9, 6.1, 7.1, 4.9, 3.1, -1.9, -1.4, -2.2, -2.0, -2.2, -1.7, -2.4, -1.9, -2.2, -1.6, -2.3, -1.9, -2.0, -1.7, -2.3, -2.0, -0.0, 0.3],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "Gem Match · one tune growing from silence, a last chord in major", bpm: 81, bars: GT.sec.bars,
    part: function (bar) { return GT.sec(bar).id; },   // section names for layout() (not .sec: these aren't calibrated)
    level: { phthalo: 1.8, knight: 0.7, golden: 0.8 },
    init: function (o, t) { o.sub = makeSub(o, t); o.sky = makeSky(o, t, 1000); o.fid = makeLead(o, t, "saw", 0.12); o.cnt = makeLead(o, t, "glass", -0.35); },
    play: function (o, t, st, bar) {
      var sec = GT.sec(bar), six = o.six, ch = GT.pair[motifBar(sec, 128) % 2];
      var bass = sec.walk ? GT.walk[sec.k % 4] : 40;   // an E pedal everywhere else
      var tri = sec.fifths ? [52, 59, 64] : sec.walk ? [52, 55, 59] : ch[1], up = tri.map(function (m) { return m + 12; });
      if (st === 0) {
        o.sky(t, sec.sky, six * 8);
        o.sub.set(t, bass - 12, sec.sub ? 0.07 * sec.sub : 0.0001);
        if (sec.picardy) {   // the last chord turns major, and everything lets go
          strings(o, t, [64, 68, 71, 76], six * 40, 0.05, { a: six * 3, r: 4 }); strings(o, t, [40, 52], six * 40, 0.05, { a: six * 2, r: 4, bright: 0.5 });
          choir(o, t, [64, 68, 71], six * 36, 0.05, { a: six * 4, r: 4 }); o.sub.set(t, 28, 0.05);
        }
        if (sec.hi) {
          pad(o, t, up, six * 16, 0.028 * sec.hi, "warm");
          if (bar % 2 === 0) strings(o, t, [64, 67], six * 32, 0.038 * sec.hi, { a: bar < 4 ? six * 14 : six * 4, r: 1.2 });
        }
        if (sec.low) strings(o, t, [bass], six * 16, 0.06 * sec.low, { a: bar < 8 ? six * 8 : 0.2, r: 0.8, bright: 0.45 });
        if (sec.ring) { strings(o, t, [64, 67, 71], six * 16, 0.045, { a: 0.05, r: 3 }); strings(o, t, [40], six * 16, 0.07, { a: 0.05, r: 3, bright: 0.45 }); }
        if (sec.choir && bar % 2 === 0) choir(o, t, [64, 67, 71], six * 32, 0.05, { a: six * 6, r: 2, pan: bar % 4 < 2 ? -0.3 : 0.3 });
        if (sec.crash) { crash(o, t, 0.6); taiko(o, t, 1, 0, 60); }
        if (sec.riser) riser(o, t, six * 64, 0.06);
      }
      if (sec.roll) taiko(o, t, sec.roll * (0.35 + 0.65 * st / 16) * (st % 2 ? 0.75 : 1), st % 2 ? 0.45 : -0.45, 64);   // a timpani roll that creeps up
      if (sec.drums) {
        var d = GT.march[st];
        if (d) taiko(o, t, d[0] * sec.drums, d[1], d[2]);
        if (st === 0) kick(o, t, 0.55 * sec.drums);
        if (st === 8) snare(o, t, 0.75 * sec.drums);
        if (st % 2 === 1) snare(o, t, 0.12 * sec.drums);   // the side drum's ghost notes, felt in eighths
        if (st % 4 === 2) shk(o, t, 0.6 * sec.drums, st % 8 === 2 ? -0.6 : 0.6);
      }
      if (sec.snRoll) rollAt(o, t, st, bar, bar, 1);
      if (sec.voice) motifAt(GT.tune, sec, st, 128).forEach(function (n) {   // the tune, in this section's voices
        var len = n[2] * six;
        sec.voice.forEach(function (v) {
          if (v === "glass") o.cnt.play(t, n[1], len, 0.06);
          if (v === "glass low") o.cnt.play(t, n[1] - 12, len, 0.07);
          if (v === "fiddle") o.fid.play(t, n[1], len, sec.walk ? 0.085 : 0.075);
          if (v === "cello" || v === "choir") orch(o, t, v, n[1], len, 64, v === "choir" ? 0.9 : 1.1);
        });
      });
      if (sec.glint && st % 4 === 2) glint(o, t, [76, 79, 83, 88][(st + bar) % 4] + 12, sec.glint, st % 8 === 2 ? -0.7 : 0.7);
    }
  };
  SONG_GEMS.outroBars = 4; SONG_GEMS.home = [40, 52, 56, 59, 64];   // E major, the last chord
  SONG_GEMS.outro = function (o, t, st, k, N) {   // the major chord rings away; a few last glints
    var six = o.six, fade = 1 - k / N;
    if (st === 0) { o.sub.set(t, 28, 0.04 * fade + 0.01); o.sky(t, 1600 - k * 250, six * 8); if (k === 0) pad(o, t, [64, 68, 71], six * 40, 0.025, "warm"); }
    if (k < 3 && (st === 0 || st === 6 || st === 12)) glint(o, t, [88, 83, 80, 76][(st / 6 + k) % 4], 0.5 * fade, st === 6 ? 0.6 : -0.6);
  };

  // 9 · Schema Stack · "falling migrations" (136 → 160 bpm, under three minutes), written after the game: a chiptune
  // block-puzzle tune in E minor - square leads, a triangle bass jumping octaves, noise drums - in three levels, each
  // faster than the last, with a level-up fanfare between them. Rows clear at the end of every phrase; in level 2 a
  // pending migration blocks its row and the beat stutters; a db:rollback plays the tune backwards; then four rows at
  // once, and the schema deploys. The tune climbs up its chords like blocks stacking.
  function chip(o, t, m, len, v, pan) {   // a short square note, 8-bit style
    var g = gain(0), p = panner(pan || 0), s = osc("square", F(o, m), t, t + len + 0.04);
    swell(g, t, 0.003, len * 0.8, 0.03, 0.035 * v); s.connect(g); g.connect(p); p.connect(o.duck); send(o, p, 0.08, 0.12);
  }
  function triBass(o, t, m, v, len) { var g = gain(0), s = osc("triangle", F(o, m), t, t + len + 0.04); swell(g, t, 0.003, len * 0.8, 0.03, 0.2 * v); s.connect(g); g.connect(o.duck); }
  function chipDrum(o, t, kind, v) {   // a kick that is a falling square; a snare and a hat of white noise
    if (kind === "k") { var s = osc("square", 160, t, t + 0.1), g = gain(0); s.frequency.exponentialRampToValueAtTime(45, t + 0.08); env(g, t, 0.001, 0.08, 0.13 * v); s.connect(g); g.connect(o.drums); duckAt(o, t, 0.6); return; }
    var n = noise(t, kind === "s" ? 0.12 : 0.04), f = filt(kind === "s" ? "bandpass" : "highpass", kind === "s" ? 2200 : 8000, 0.8), g2 = gain(0);
    env(g2, t, 0.001, kind === "s" ? 0.1 : 0.025, (kind === "s" ? 0.28 : 0.1) * v); n.connect(f); f.connect(g2); g2.connect(o.drums);
  }
  function lineClear(o, t, v) {   // a row of migrations deploys: four quick squares up an E minor chord
    [76, 79, 83, 88].forEach(function (m, i) { chip(o, t + i * o.six * 0.5, m, o.six * 0.45, 0.9 * v, -0.45 + i * 0.3); });
  }
  // 9 · Schema Stack · one dark loop that never changes (123 bpm, three minutes), after the form of Far Cry 3's
  // "Journey Into Madness": i VI III V, two bars a chord; it opens on bass and pads alone under a shut filter, the kit
  // arrives at full level but behind that filter, the bass steps up, a riff peaks, the drums drop out over a pedal,
  // come back brighter, dip once on the V as a pickup, and the last stretch hands the lead to the drums, the
  // brightest part of the song, before a hard stop. Wide percussion around a mono bass. Lines clear at phrase ends.
  var ST = {
    loop: [[40, [52, 55, 59]], [36, [48, 52, 55]], [43, [50, 55, 59]], [35, [51, 54, 59]]],   // Em C G B
    colour: [[57, 60, 64], [48, 52, 55]],   // the drop-out: Am, then C, over the E pedal
    groove: [0, null, null, 0, null, null, 12, null, 0, null, null, 0, null, 7, null, 10],
    riff: [[0, 64, 2], [2, 67, 2], [4, 66, 2], [6, 64, 4], [10, 63, 2], [12, 64, 4], [16, 71, 6], [22, 70, 2], [24, 67, 4], [28, 64, 4],
      [32, 64, 2], [34, 67, 2], [36, 72, 4], [40, 71, 2], [42, 67, 2], [44, 64, 4], [48, 60, 8], [56, 64, 4], [60, 67, 4],
      [64, 67, 2], [66, 71, 2], [68, 74, 4], [72, 71, 2], [74, 74, 2], [76, 79, 4], [80, 78, 6], [86, 74, 2], [88, 71, 8],
      [96, 71, 2], [98, 75, 2], [100, 78, 4], [104, 75, 2], [106, 71, 2], [108, 70, 4], [112, 66, 8], [120, 63, 4], [124, 71, 4]],
    kick: { 0: 1, 6: 0.8, 10: 0.9 },
    toms: { 2: [0.5, -0.8, 180], 5: [0.4, 0.75, 150], 7: [0.45, -0.6, 210], 13: [0.55, 0.8, 130], 15: [0.4, -0.75, 170] },   // [level, pan, pitch]
  };
  // the motif only: the riff - in the reese bass under a shut filter while the kit arrives, the lead, the lead an octave
  // up, the lead at half speed while the drums drop out, the bass and the lead together when they come back, a pickup
  // on the V, then under the drums when they take over; then the hard stop
  ST.sec = form([
    ["the stack", 16, function (k) { return { voice: ["bass"], pad: 1, kit: k >= 8 ? 1 : 0, perc: k >= 12 ? 0.5 : 0, sky: 912.5 }; }],
    ["lock-in", 8, function (k) { return { voice: ["bass"], pad: 1, kit: 1, perc: 0.6, sky: 1150, crash: k === 0 }; }],
    ["the riff", 16, function (k) { return { voice: ["lead"], lead: 0.8, bass: 1, pad: 0.8, kit: 1, perc: 0.8, sky: 1400, crash: k === 8, clear: k % 8 === 7 }; }],
    ["the riff", 8, function (k) { return { voice: ["lead"], lead: 0.8, up: 12, bass: 1, pad: 0.8, kit: 1, perc: 1, sky: 1500, crash: k === 0, clear: k === 7 }; }],
    ["the drop-out", 8, function (k) { return { voice: ["lead"], half: 1, lead: 0.6, bass: 0.9, pad: 1, perc: 0.45, pedal: 1, colour: 1, sky: 590 }; }],
    ["back in", 16, function (k) { return { voice: ["bass", "lead"], lead: 0.7, pad: 0.7, kit: 1, perc: 1, sky: 2025, crash: k % 8 === 0, clear: k % 8 === 7 }; }],
    ["the pickup", 2, { voice: ["bass", "lead"], lead: 0.7, pad: 0.7, kit: 1, perc: 1, sky: 2025, ci: 3 }],
    ["madness", 24, function (k) { return { voice: ["lead"], lead: 0.4, bass: 1, pad: 0.6, kit: 1.25, perc: 1.3, sky: 2800, crash: k % 8 === 0, clear: k % 8 === 7 }; }],
    ["madness", 1, { stop: 1, sky: 2800 }]
  ]);
  var SONG_STACK = {
    flat_golden: [0.5, -0.4, 0.3, 0.3, -0.3, -0.1, -0.2, 0.0, -0.2, -0.3, -0.6, 0.6, -0.2, -0.7, 0.1, 0.3, -1.2, -0.9, -0.2, -0.2, -1.3, -0.5, -0.8, -0.5, 0.2, 0.3, 0.5, 1.0, -0.8, -0.3, -0.2, 1.1, -0.2, -0.2, 0.9, 1.2, -0.8, -0.0, -0.0, 0.7, -1.2, -0.2, -0.5, -0.1, -0.8, -0.2, -0.3, 0.1, 1.6, 3.1, 2.8, 3.1, 2.7, 3.3, 3.3, 2.8, -1.3, -0.7, -1.3, -0.2, -1.3, -1.7, -1.7, -0.4, -1.1, -1.4, -0.5, 0.1, -2.1, -1.2, -1.2, -0.9, -0.6, -0.5, 0.2, 0.5, 1.1, 1.5, 0.1, 0.6, 0.7, 1.5, 0.1, 0.9, 1.0, 1.3, 0.1, 0.5, 0.9, 1.3, 0.6, 1.3, 1.2, 1.4, 0.1, 0.4, 0.7, 1.0, 12.1],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [1.3, -0.4, 0.3, 0.7, -0.7, -0.6, -0.6, 0.4, -0.1, -0.3, 0.1, 1.0, -0.8, -0.6, -0.4, -0.0, -0.4, -0.8, -0.5, 0.4, -1.7, -0.9, -1.1, -0.5, -0.4, -0.0, 0.2, 0.9, -1.0, 0.4, -0.3, 0.7, -0.2, 0.0, 0.4, 0.8, -0.3, -0.1, 0.0, 0.6, -0.7, -0.2, -0.4, 0.4, -0.9, 0.1, -0.2, 0.3, 1.4, 3.6, 3.1, 4.2, 2.9, 3.7, 3.7, 4.3, -1.6, -1.3, -2.0, -0.7, -2.3, -1.7, -2.4, -1.4, -1.5, -1.5, -1.8, -0.8, -2.4, -1.5, -2.6, -1.3, -1.4, -1.8, 0.8, 1.0, 1.1, 1.6, 0.3, 1.2, 0.9, 1.4, 0.6, 0.7, 0.9, 1.6, -0.1, 1.1, 1.0, 1.6, 0.6, 1.0, 0.8, 1.9, -0.1, 0.6, 0.9, 1.4, 12.0],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [2.0, 1.1, 1.1, 1.3, 0.0, 0.9, 0.8, 1.1, 0.4, -0.0, -0.1, 0.8, -0.5, -0.5, 0.4, 0.4, -0.4, -0.1, -0.2, -0.1, -1.2, -0.5, -0.7, -0.0, 0.4, 0.2, 0.3, 1.0, -0.5, -0.1, 0.3, 1.1, -0.1, 0.2, 0.4, 0.8, -0.8, 0.2, -0.0, 1.0, -0.4, -0.2, -0.3, 0.4, -1.2, -0.5, -0.1, 0.6, 2.1, 3.9, 4.0, 4.3, 3.6, 3.6, 3.9, 4.6, -1.0, -1.2, -1.0, -0.3, -2.3, -1.1, -1.2, -1.0, -1.3, -0.9, -1.4, -0.7, -1.7, -1.3, -1.6, -0.6, -1.0, -1.1, 0.2, 0.2, 0.2, 1.0, -0.6, -0.5, 0.5, 0.6, -0.2, 0.3, 0.3, 0.8, -0.5, -0.4, 0.4, 0.5, -0.3, 0.5, 0.2, 1.0, -0.4, -0.3, 0.5, 0.5, 12.1],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "Schema Stack · one riff in a dark loop, the drums take over", bpm: 123, bars: ST.sec.bars,
    part: function (bar) { return ST.sec(bar).id; },
    level: { phthalo: -1.4, knight: -2.2, golden: -1.0 },
    init: function (o, t) { o.sub = makeSub(o, t); o.reese = makeReese(o, t); o.lead = makeLead(o, t, o.P.lead, 0); o.sky = makeSky(o, t, 300); },
    play: function (o, t, st, bar) {
      var sec = ST.sec(bar), six = o.six, ci = sec.ci != null ? sec.ci : Math.floor(motifBar(sec, 128) / 2) % 4, ch = ST.loop[ci], root = sec.pedal ? 40 : ch[0];
      var tri = sec.colour ? ST.colour[Math.floor(sec.k / 2) % 2] : ch[1];
      o.cut = 380 + sec.sky * 0.15;
      if (st === 0) {
        o.sky(t, sec.sky, sec.stop ? 0.05 : six * 6);
        o.bassLp.frequency.setTargetAtTime(o.cut * 1.6, t, 0.4);
        o.reese.rate(t, sec.id === "madness" ? 1 / (six * 4) : 0.35);
        o.reese.depth(t, sec.id === "madness" ? 260 : 100);   // a slow wobble this deep was heard as the volume breathing
        if (sec.crash) crash(o, t, 0.35);
        if (sec.stop) {   // the hard stop: one last hit, then only the drums' tail
          kick(o, t, 1); crash(o, t, 0.8); taiko(o, t, 1, -0.5, 80); taiko(o, t, 1, 0.5, 100);
          o.reese.play(t, 40, six * 3, 0.22); o.sub.set(t, 28, 0.0001); bassNote(o, t, 40, 0.8, six * 3);
          return;
        }
        o.sub.set(t, root - 12, 0.05 + 0.06 * (sec.bass || 0.55));
        if (sec.pad && bar % 2 === 0) pad(o, t, tri.map(function (m) { return m + 12; }), six * 32, 0.026 * sec.pad, "saw", true);
      }
      if (sec.stop) { if (st === 6 || st === 10) taiko(o, t, st === 6 ? 0.6 : 0.4, st === 6 ? 0.7 : -0.7, 110); return; }
      var gv = ST.groove[st];
      if (gv != null && sec.bass && !(sec.voice && sec.voice.indexOf("bass") >= 0)) o.reese.play(t, root + (sec.pedal ? 0 : gv), six * (gv === 12 ? 0.7 : 1.4), 0.19 * sec.bass);
      if (sec.kit) {
        var kv = Math.min(1.25, sec.kit);
        if (ST.kick[st]) kick(o, t, ST.kick[st] * kv * 0.9);
        if (st === 8) { snare(o, t, 0.9 * kv); if (kv > 1) clap(o, t, 0.45); }
        if (st === 3 || st === 15) snare(o, t, 0.12 * kv);
        hat(o, t, (st % 2 ? 0.28 : 0.5) * kv, st === 14);
      }
      if (sec.perc) {
        var tm = ST.toms[st];
        if (tm) taiko(o, t, tm[0] * sec.perc * 0.8, tm[1], tm[2]);
        if (st % 2 === 0) shk(o, t, (st % 4 ? 0.5 : 0.8) * sec.perc, st % 4 ? 0.75 : -0.75);
      }
      if (sec.voice) motifAt(ST.riff, sec, st, 128).forEach(function (n) {   // the riff, in this section's voices
        if (sec.voice.indexOf("bass") >= 0) o.reese.play(t, n[1] - 24, n[2] * six * 0.95, 0.17);
        if (sec.voice.indexOf("lead") >= 0) o.lead.play(t, n[1] + (sec.up || 0), n[2] * six, 0.08 * sec.lead * (n[2] >= 6 ? 0.7 : 1));   // held notes sit back
      });
      if (sec.clear && st === 12) lineClear(o, t, 0.6);
    }
  };
  SONG_STACK.outroBars = 4;
  SONG_STACK.outro = function (o, t, st, k, N) {   // after the stop: the toms echo away left and right over a dark pedal
    var six = o.six, fade = 1 - k / N;
    if (st === 0) { o.sky(t, 900 - k * 150, six * 8); o.sub.set(t, 28, 0.05 * fade + 0.01); if (k === 1) pad(o, t, [64, 67, 71], six * 40, 0.025, "saw"); }
    if (k < 3 && (st === 0 || st === 6 || st === 10)) taiko(o, t, (st === 0 ? 0.7 : 0.45) * fade, st === 6 ? 0.75 : st === 10 ? -0.75 : 0, [90, 120, 150][st / 5 | 0] || 100);
    if (k < 2 && st % 4 === 2) shk(o, t, 0.5 * fade, st % 8 === 2 ? -0.7 : 0.7);
  };

  // 10 · Pit Wall · a hybrid-orchestral race theme (100 bpm, four minutes), after the form of Brian Tyler's F1 theme:
  // a string ostinato and horns over half-time drums, sections made by opening and closing the top end at a steady
  // level, drums and bass taking turns to lead, and for the last third the key drops a whole step (E minor to D,
  // with B♭ and F borrowed in). The five red lights and the V8 stay. The twist, halfway: "the replay", seven bars where
  // the race runs backwards: the tape rewinds and the theme's first seven bars play in reverse (retrograde notes,
  // sounds that swell in and cut, kicks and cymbals sucked backwards, the gearbox running down) until it slams back in.
  var PW = {
    body: [[40, [52, 55, 59]], [36, [48, 52, 55]], [45, [52, 57, 60]], [40, [52, 55, 59]], [43, [50, 55, 59]], [36, [48, 52, 55]], [38, [50, 54, 57]], [35, [51, 54, 59]]],   // Em C Am Em G C D B
    lift: [[38, [50, 54, 57]], [34, [50, 53, 58]], [41, [48, 53, 57]], [43, [50, 55, 59]]],   // D B♭ F G, two bars each
    grid: [35, [50, 54, 59]],   // the grid: B under Bm
    ost: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1],
    acc: { 0: 1, 3: 1, 6: 1, 8: 1, 11: 1, 14: 1 },   // 3+3+2, 3+3+2
    theme: [[0, 71, 6], [6, 76, 2], [8, 79, 8], [16, 76, 6], [22, 72, 2], [24, 76, 8], [32, 81, 8], [40, 79, 4], [44, 76, 4],
      [48, 78, 4], [52, 79, 4], [56, 71, 8], [64, 74, 6], [70, 79, 2], [72, 83, 8], [80, 81, 4], [84, 79, 4], [88, 76, 8],
      [96, 78, 4], [100, 81, 4], [104, 78, 4], [108, 81, 4], [112, 78, 8], [120, 75, 8]],
    finale: [[0, 74, 6], [6, 78, 2], [8, 81, 8], [16, 86, 8], [24, 85, 4], [28, 81, 4], [32, 82, 8], [40, 81, 4], [44, 77, 4],
      [48, 74, 8], [56, 77, 8], [64, 81, 6], [70, 79, 2], [72, 77, 8], [80, 84, 8], [88, 81, 8], [96, 83, 6], [102, 81, 2], [104, 79, 8],
      [112, 78, 4], [116, 79, 4], [120, 81, 8]],
    taiko: { 3: [0.5, -0.7, 110], 6: [0.6, 0.7, 95], 10: [0.45, -0.5, 130], 11: [0.4, 0.5, 110], 14: [0.7, -0.6, 85] },
    REV: 41, REVN: 7   // the replay: bars 41–47
  };
  // the motif only: the theme - on the horns once the lights go out (then the violins join), on the low strings
  // through the hairpin, in the choir down the undercut, everything for four bars, then backwards in the replay, then
  // horns and violins at full throttle (the choir behind), the low strings and horns into the last stint, all of it
  // to the flag, and one last hit
  PW.sec = form([
    ["the grid", 5, function (k) { return { key: "grid", ost: 0.8, sky: 3200, lights: k + 1, choir: k >= 1, boom: 1, low: 0.35, riser: k === 3 }; }],
    ["lights out", 16, function (k) { return { voice: k < 8 ? ["horns"] : ["horns", "violins"], out: k === 0, ost: 1, sky: 9000, dr: 1, low: 0.45, pad: 1, crash: k % 8 === 0, fly: k === 4 || k === 12, corner: k >= 2 }; }],
    ["the hairpin", 8, function (k) { return { voice: ["cello"], v: 1.2, ost: 0.8, sky: 950, dr: 0.85, low: 0, tyres: k === 3 || k === 7, corner: 1 }; }],
    ["the undercut", 8, function (k) { return { voice: ["choir"], v: 1.1, ost: 0.7, sky: 4450, dr: 0.3, low: 1, pad: 1, riser: k === 6 }; }],
    ["the undercut", 4, function (k) { return { voice: ["horns", "violins"], ost: 1, sky: 9000, dr: 1, low: 0.6, pad: 1, crash: k === 0, rewind: k === 3 }; }],
    ["the replay", 7, { back: 1 }],
    ["full throttle", 16, function (k) { return { voice: ["horns", "violins"], ost: 1, sky: 9000, dr: 1, low: 1, pad: 1, choir: k >= 8, crash: k % 8 === 0, slam: k === 0, fly: k % 8 === 5, corner: 1 }; }],
    ["the last stint", 16, function (k) { return { voice: k < 8 ? ["cello", "horns"] : ["horns", "violins"], ost: 1, sky: k < 8 ? 3000 + k * 750 : 9500, dr: k < 8 ? 0.8 : 1, low: 1, pad: 1, choir: k >= 8, crash: k % 8 === 0, fly: k === 11, corner: 1 }; }],
    ["chequered flag", 2, function (k) { return { flag: 1, last: k === 0 }; }]
  ]);
  function pitReplay(o, t, st, bar) {   // the replay: the theme's first seven bars, last bar first, every sound backwards
    var six = o.six, k = bar - PW.REV, ch = PW.body[PW.REVN - 1 - k], up = ch[1].map(function (m) { return m + 12; }), v8 = o.v8, g = k * 16 + st, end = PW.REVN * 16;
    if (st === 0) {
      o.sky(t, 6500, six * 2);
      o.sub.set(t, ch[0] - 12, 0.0001);
      backTone(o, t, up, six * 16 - 0.01, 0.085, { pan: -0.25, verb: 0.15 });   // the bar's chord, swelling into the bar line
      backTone(o, t, [ch[0], ch[0] + 12], six * 16 - 0.01, 0.12, { bright: 700, wave: "triangle" });
      backKick(o, t + six * 16 - 0.45, 0.45, 1);                     // the downbeat kick, heard before it lands
      backHit(o, t + six * 8 - 0.32, 0.32, 0.5, 1900);                 // the backbeat snare, sucked in
      if (bar % 2 === 0) backKick(o, t + six * 6 - 0.35, 0.35, 0.6);  // the ghost kick on 10, mirrored to 6
      for (var p in PW.taiko) { var tk = PW.taiko[p], e = 16 - p; backTone(o, t + six * e - 0.4, [36], 0.4, 0.09 * tk[0], { bright: 300, wave: "sine", pan: -tk[1] }); }
      if (k === 1) { v8.level(t, 0.06, 0.2); backShift(v8, t, 4, six * 8, 110, 320); }   // the gearbox, top gear first
      if (k === 5) tyres(o, t + six * 4, six * 6, 0.9, -0.5);
      if (k === PW.REVN - 1) {   // the last bar: a reversed cymbal and a rising "lights out", into the slam
        backHit(o, t, six * 16, 0.13, 6000); backHit(o, t + six * 8, six * 8, 0.06, 2600, 0.3);
        var s = osc("sine", 70, t + six * 10, t + six * 16 + 0.02), lg = gain(0); s.frequency.exponentialRampToValueAtTime(520, t + six * 16); backEnv(lg, t + six * 10, six * 6, 0.1); s.connect(lg); lg.connect(o.bus);
        v8.level(t, 0.04, 0.4); v8.rpm(t, 52, 0.4);
      }
    }
    if (st % 2 === 1) backHit(o, t, six * 0.9, 0.05, 7600, st % 4 === 1 ? 0.5 : -0.5);   // the shaker, backwards
    backSpic(o, t, up[PW.ost[15 - st]], six * 0.92, PW.acc[15 - st] ? 1 : 0.55, st % 2 ? 0.5 : -0.5);
    PW.theme.forEach(function (n) {   // the melody in retrograde: a note that started at p now ends at end - p
      if (n[0] >= end) return;
      if (end - n[0] - n[2] !== g) return;
      backTone(o, t, [n[1] - 12], n[2] * six, 0.11, { bright: 2200, pan: 0.1 });
      backTone(o, t, [n[1]], n[2] * six, 0.05, { bright: 3800, wave: "triangle", pan: -0.15, verb: 0.2 });
    });
  }
  var SONG_PIT = {
    flat_golden: [9.8, 8.6, 5.7, 4.6, 4.0, 0.1, 1.6, 2.6, 3.0, 2.8, 3.9, 3.9, 3.5, -0.2, 0.4, -0.2, -0.1, 0.2, 0.2, 0.4, 0.2, 1.6, 4.2, 4.8, 4.8, 5.1, 5.1, 5.4, 5.3, 0.4, 1.5, -0.3, 0.7, -0.2, 1.2, 1.2, 1.5, -0.5, -0.2, -1.1, 1.2, 9.6, 8.2, 8.2, 9.6, 9.6, 8.1, 11.0, -2.7, -1.7, -2.8, -1.8, -2.4, -1.6, -1.7, -1.4, -2.5, -2.1, -3.1, -2.4, -2.5, -2.1, -2.2, -1.8, -2.3, -1.1, -2.6, -2.0, -2.5, -1.2, -1.5, -1.5, -2.4, -2.0, -3.2, -2.3, -2.9, -2.2, -2.1, -1.8, -2.6, 0.3],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_knight: [9.7, 8.6, 5.8, 4.7, 4.7, -0.8, 0.1, 1.4, 1.6, 1.5, 2.0, 2.3, 1.9, -0.4, 0.1, -0.2, 0.1, -0.1, 0.2, 0.2, -0.1, 2.8, 3.6, 4.9, 4.5, 4.8, 4.6, 4.7, 4.6, 0.7, 2.0, 0.3, 0.8, 0.7, 1.8, 1.6, 1.7, -0.7, -0.2, -0.9, 1.2, 8.7, 6.7, 6.7, 8.5, 8.2, 7.1, 9.9, -2.7, -1.9, -2.3, -1.4, -2.0, -1.3, -1.5, -1.4, -1.9, -1.5, -2.3, -1.9, -2.0, -2.0, -1.8, -1.7, -1.5, -1.0, -1.8, -1.4, -1.7, -1.2, -1.3, -1.4, -2.0, -1.6, -2.5, -2.1, -2.1, -1.7, -1.9, -1.8, -2.5, 1.9],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    flat_phthalo: [10.1, 8.9, 6.7, 5.9, 5.3, -0.3, 1.0, 1.3, 2.4, 2.2, 2.7, 2.6, 2.7, -0.6, 0.2, -0.6, -0.0, 0.0, 0.4, -0.0, 0.3, 2.1, 4.3, 4.9, 4.7, 4.5, 5.3, 4.8, 5.0, 1.5, 2.0, 0.4, 1.6, 1.1, 2.3, 1.8, 2.3, -1.0, -0.3, -1.2, 1.7, 8.4, 6.9, 7.1, 8.3, 8.8, 7.2, 9.4, -2.6, -2.0, -2.5, -1.8, -2.0, -1.5, -1.5, -1.3, -2.1, -1.9, -2.8, -2.2, -2.2, -1.9, -2.0, -1.7, -1.5, -0.9, -2.0, -1.5, -1.6, -0.9, -1.4, -1.0, -2.3, -1.8, -3.0, -2.4, -2.2, -1.8, -2.0, -1.6, -1.1, 1.9],   // per-bar level (dB), written by soundtrack-lab/flatten.py
    mood: "Pit Wall · one race theme, lights out, and a lap that runs it backwards", bpm: 100, bars: PW.sec.bars,
    part: function (bar) { return PW.sec(bar).id; },
    level: { phthalo: 0.7, knight: -0.1, golden: 0.6 },
    init: function (o, t) { o.sub = makeSub(o, t); o.v8 = makeV8(o, t); o.sky = makeSky(o, t, 1400); },
    play: function (o, t, st, bar) {
      var sec = PW.sec(bar), six = o.six, v8 = o.v8;
      if (sec.back) return pitReplay(o, t, st, bar);
      var ch = sec.key === "grid" ? PW.grid : sec.key === "lift" ? PW.lift[Math.floor((bar - 67) / 2) % 4] : PW.body[(bar - sec.from) % 8];
      var bass = ch[0], tri = ch[1], up = tri.map(function (m) { return m + 12; }), mel = sec.key === "lift" ? PW.finale : PW.theme;
      var pos = ((bar - (sec.from || 0)) % 8) * 16 + st, hush = sec.rewind && st >= 8;
      if (sec.flag) {   // the last hit: E minor, the theme's home; everything else has stopped
        if (sec.last && st === 0) {
          kick(o, t, 1); boom(o, t, 1); crash(o, t, 0.9); taiko(o, t, 1, -0.6, 70); taiko(o, t, 1, 0.6, 85);
          horns(o, t, [52, 59, 64], six * 20, 0.09, { a: 0.02 }); choir(o, t, [64, 67, 71], six * 20, 0.06, { a: 0.03, r: 3 });
          strings(o, t, [40, 52], six * 24, 0.08, { a: 0.02, r: 3, bright: 0.5 }); o.sub.set(t, 28, 0.12); o.sky(t, 6000, six * 8);
          v8.level(t, 0.05, 0.3); v8.rpm(t, 150, 0.3);
        }
        if (sec.k === 1 && st === 0) { o.sub.set(t, 28, 0.03); v8.rpm(t, 70, 0.6); }
        return;
      }
      if (st === 0) {
        o.sky(t, sec.sky, six * 6);
        o.sub.set(t, bass - 12, 0.04 + 0.12 * (sec.low || 0));
        if (sec.low) strings(o, t, [bass], six * 16, 0.07 * sec.low, { a: 0.06, r: 0.5, bright: 0.55 });
        if (sec.pad) pad(o, t, up, six * 16, 0.026, "saw");
        if (sec.choir && bar % 2 === 0) choir(o, t, sec.key === "grid" ? [62, 66, 71] : up, six * 32, 0.05, { a: six * 8, r: 2, pan: bar % 4 ? 0.3 : -0.3 });
        if (sec.crash) crash(o, t, 0.6);
        if (sec.riser) riser(o, t, six * 32, 0.1);
        if (sec.boom) taiko(o, t, 0.35 + bar * 0.06, 0, 62);
        // the car
        if (sec.lights) { lightOn(o, t, 1); v8.level(t, 0.065, 0.2); v8.rpm(t, 90 + sec.lights * 45, six * 4); if (sec.lights === 5) v8.limiter(t + six * 8, 330, 8, six); }
        if (sec.out) { lightsOut(o, t, 1); kick(o, t, 1); boom(o, t, 1); v8.level(t, 0.075, 0.02); v8.shift(t, 5, six * 6, 110, 320); v8.level(t + six * 30, 0.035, 1.5); }
        if (sec.slam) { kick(o, t, 1); boom(o, t, 1); taiko(o, t, 1, 0, 70); v8.level(t, 0.07, 0.02); v8.shift(t, 4, six * 8, 120, 330); v8.level(t + six * 32, 0.035, 1.2); }
        if (sec.corner && !sec.out && !sec.slam && bar % 4 === 0) v8.rpm(t, 150 + (bar % 8) * 20, six * 8);
        if (sec.fly) flyby(o, t, six * 16, 0.8);
        if (sec.tyres) tyres(o, t + six * 8, six * 6, 0.8, bar === 27 ? 0.5 : -0.5);
        if (sec.rewind) { o.sky(t + six * 8, 3000, six * 2); rewind(o, t + six * 8, six * 8, 1); }
      }
      if (sec.lights && st === 12) v8.blip(t, 52, 150 + sec.lights * 25);
      if (sec.corner && bar % 4 === 3) {   // a corner every four bars: off the throttle, three downshifts, back on it
        if (st === 6) v8.rpm(t, 85, 0.05);
        if (st === 7) v8.downshift(t, 3, six, 85);
        if (st === 10) v8.rpm(t, 260, six * 3);
      }
      if (hush) return;   // the tape is rewinding
      if (sec.ost) {
        var on = up[PW.ost[st]], ac = PW.acc[st];
        spic(o, t, on, sec.ost * (ac ? 1 : 0.6), -0.55, sec.sky > 5000 ? 1 : 0.5);
        if (ac) spic(o, t, on - 12, sec.ost * 0.8, 0.55, 0.6);
      }
      if (sec.dr) {
        var dr = sec.dr, tk = PW.taiko[st];
        if (dr >= 0.5) {   // the kit: half-time, the backbeat on three
          if (st === 0) { kick(o, t, dr); taiko(o, t, 0.6 * dr, 0, 70); }
          if (st === 8) { snare(o, t, 0.9 * dr); clap(o, t, 0.4 * dr); }
          if (st === 10 && bar % 2) kick(o, t, 0.6 * dr);
        }
        if (tk) taiko(o, t, tk[0] * Math.max(0.6, dr), tk[1], tk[2]);
        shk(o, t, (st % 2 ? 0.35 : 0.6) * Math.max(0.6, dr), st % 4 < 2 ? -0.45 : 0.45);
      }
      if (sec.roll) rollAt(o, t, st, bar, 93, 1);
      orchAll(o, t, sec, mel, st, 128, 71);   // the theme, in this section's voices
    }
  };
  SONG_PIT.outroBars = 4;
  SONG_PIT.outro = function (o, t, st, k, N) {   // the cars come home: one flyby, the engine winds down, the ignition goes off
    var six = o.six, fade = 1 - k / N, v8 = o.v8;
    if (st === 0) {
      o.sub.set(t, 26, 0.03 * fade + 0.01); o.sky(t, 3000 - k * 600, six * 8);
      if (k === 0) { flyby(o, t, six * 24, 1); v8.level(t, 0.05, 0.3); v8.rpm(t, 70, 0.5); }
      if (k === 1) { v8.blip(t, 60, 200); v8.downshift(t + six * 6, 3, six, 70); tyres(o, t + six * 8, six * 4, 0.6, -0.3); }
      if (k === 2) { v8.rpm(t, 22, 0.5); v8.level(t + six * 2, 0.0001, 0.3); lightsOut(o, t + six * 8, 0.6); }
    }
    if (k >= 1 && k < 3) spic(o, t, [64, 67, 71, 76][PW.ost[st]], (PW.acc[st] ? 0.7 : 0.35) * fade, st % 2 ? 0.5 : -0.5, 0.4);
    if (k >= 1 && k < 3 && (st === 0 || st === 8)) taiko(o, t, 0.5 * fade, st ? 0.5 : -0.5, st ? 110 : 85);
  };

  var BONUS = [
    { si: 6, game: "sidekiq", name: "Sidekiq Rush", song: SONG_QUEUE, titles: { phthalo: "Dead Letter Queue", knight: "Bunker 0x1F", golden: "Gilded Backpressure" } },
    { si: 7, game: "gems", name: "Gem Match", song: SONG_GEMS, titles: { phthalo: "Facets of Light", knight: "Embers Rising", golden: "Prism Anthem" } },
    { si: 8, game: "schema", name: "Schema Stack", song: SONG_STACK, titles: { phthalo: "Stairway to Production", knight: "The Long Migration", golden: "Golden Stairs" } },
    { si: 9, game: "pitwall", name: "Pit Wall", song: SONG_PIT, titles: { phthalo: "Lights Out", knight: "Red Flag Fever", golden: "Chequered Mirage" } },
    // not a game: a hidden gem, unlocked by running bundle install on Samuka's page (the button, or the terminal)
    { si: 10, game: "bundle", name: "bundle install", song: SONG_MONO, hint: "run bundle install on Samuka's page to unlock it in every theme", titles: { phthalo: "The Monologue", knight: "Monologue in the Dark", golden: "Golden Monologue" } }
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
  // the main rotation follows the list: the five songs, every unlocked bonus track, the director's cut once it's
  // unlocked (it used to play only when picked), then round again to Ring Zero
  function nextIdx(th, si) {
    var i = LIST.indexOf(si);
    for (var j = i + 1; j < LIST.length; j++) if (siOpen(th, LIST[j])) return LIST[j];
    return 0;
  }
  function prevIdx(th, si) {
    var i = LIST.indexOf(si);
    for (var j = (i <= 0 ? LIST.length : i) - 1; j >= 0; j--) if (siOpen(th, LIST[j])) return LIST[j];
    return 0;
  }
  // shuffle: what follows a track is a random one from the rotation (the five songs and the open bonus tracks),
  // picked once per track so "Next:", the outro and the handoff agree; ⏮ walks back through what played
  var shuffle = (function () { try { return localStorage.getItem("samuka-shuffle") === "1"; } catch (e) { return false; } })();
  var played = [], lastSi = null, goingBack = false;
  function rotation(th) { return LIST.filter(function (si) { return siOpen(th, si); }); }   // the suite too, once it's open
  function upNext(o, skipLoop) {
    if (!o) return 0;
    if (o.loop && !skipLoop) return o.si;
    if (!shuffle) return nextIdx(o.theme, o.si);
    if (o.pick == null) { var r = rotation(o.theme).filter(function (x) { return x !== o.si; }); o.pick = r[Math.floor(Math.random() * r.length)]; }
    return o.pick;
  }
  // how the tracks are listed: the five songs, the bonus tracks, and the suite last. They're numbered by what's
  // open in that theme, so the numbers run 1, 2, 3... with no gaps or repeats whatever has been unlocked
  // (a locked track gets the number it would take if it opened now)
  var LIST = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 5];
  function posOf(si, th) { var n = 1, at = LIST.indexOf(si); for (var i = 0; i < at; i++) if (siOpen(th, LIST[i])) n++; return n; }
  function lastPos(th) { return LIST.filter(function (si) { return siOpen(th, si); }).length; }

  /* ---------- pre-rendered tracks ----------
   * Live synthesis depends on the listener's machine: when the audio thread misses a deadline, short drum
   * hits come out as clicks. So every track - the five songs, the director's cut and the bonus tracks - plays
   * from files rendered offline by this same engine (SamukaLofi.render, via soundtrack-lab/publish-audio.sh).
   * Each track is cut into 30-second MP3 pieces (assets/audio/<theme>-<n>-<k>.mp3, listed in index.json)
   * that overlap by 0.1 s and crossfade there, so only the piece playing and the next one are in memory
   * and a track starts as soon as its first piece arrives.
   * The step clock keeps running exactly as it does for the synth - position, seeking, theme switches,
   * "heard", outros and handoffs all work the same way - it just doesn't make the sound; the files do.
   * If a file can't be loaded, the track falls back to the synth where it is. */
  var FILE_TRACKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var AUDIO_BASE = (function () { try { return new URL("../audio/", document.currentScript.src).href; } catch (e) { return null; } })();
  var manifest = null, manifestP = null;
  function loadManifest() {
    if (!manifestP) {
      manifestP = fetch(AUDIO_BASE + "index.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (m) { manifest = m; return m; });
      manifestP.catch(function () { manifestP = null; });   // try again next time
    }
    return manifestP;
  }
  var pieces = {}, ready = {}, pieceOrder = [];   // by "theme-n-k": loading (promises) and decoded; the six most recent kept
  function loadPiece(name, k) {
    var key = name + "-" + k, i = pieceOrder.indexOf(key);
    if (i >= 0) pieceOrder.splice(i, 1);
    pieceOrder.push(key);
    if (!pieces[key]) {
      var p = pieces[key] = fetch(AUDIO_BASE + key + ".mp3")
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res, rej) { var q = ctx.decodeAudioData(ab, res, rej); if (q && q.catch) q.catch(rej); }); })
        .then(function (buf) { if (pieces[key] === p) ready[key] = buf; return buf; });
      p.catch(function () { if (pieces[key] === p) delete pieces[key]; });
    }
    while (pieceOrder.length > 6) { var x = pieceOrder.shift(); delete pieces[x]; delete ready[x]; }
    return pieces[key];
  }
  // where each step falls in a track's file: the render's own timing (its tempo map; the outro holds the last tempo).
  // A render has nothing unlocked, so its outro tunes towards the next of the five songs, or Ring Zero: washRef.
  var fileStepCache = {};
  function fileSteps(theme, si) {
    var key = theme + ":" + si; if (fileStepCache[key]) return fileStepCache[key];
    var P = THEMES[theme], song = TRACKS[si], N = song.outroBars, body = song.bars * 16, n = body + N * 16;
    var base = 60 / (song.bpm * P.bpm) / 4, six0 = base;
    var at = new Float64Array(n + 1), dur = new Float64Array(n), t = 0.05;   // a render's first step is at 0.05 s
    for (var s = 0; s < n; s++) {
      var d;
      if (s < body) { d = song.tempo ? 60 / (song.tempo(Math.floor(s / 16) + (s % 16) / 16) * P.bpm) / 4 : base; six0 = d; }
      else d = six0;   // the outro keeps the track's last tempo
      at[s] = t; dur[s] = d; t += d;
    }
    at[n] = t;
    return (fileStepCache[key] = { at: at, dur: dur });
  }
  function washRef(si) { return TRACKS[si < 4 ? si + 1 : 0].ref || 440; }   // the A a track's file ends on
  function useFile(si, sp) { return FILE_TRACKS.indexOf(si) >= 0 && !!AUDIO_BASE && !!window.fetch && !(sp && sp.synth); }
  function createFile(theme, si, fade, loop, sp) {
    var P = THEMES[theme], song = TRACKS[si], t = ctx.currentTime, fs = fileSteps(theme, si), n = fs.dur.length, name = theme + "-" + (si + 1);
    var o = { P: P, song: song, theme: theme, si: si, s: (sp && sp.s) || 0, six: fs.dur[0], dur: fs.dur[0], next: t + 0.08, nodes: [], loop: !!loop,
              ref: song.ref || 440, bpm: Math.round(song.bpm * P.bpm), file: true, T0: null, started: {}, live: [], restart: false };
    o.bus = gain(0.0001); o.bus.gain.linearRampToValueAtTime(1, t + fade); o.bus.connect(mixOut);
    function fail() {   // no file: the synth takes over from this step
      if (cur !== o || o.done) return;
      cur = create(theme, si, 0.3, o.loop, { s: o.s, synth: true }); cur.next = Math.max(cur.next, o.next);
      retire(o, 0.3); nowPlaying();
    }
    function count() { return manifest && manifest.tracks[name]; }
    function pieceAt(ft) { var C = manifest.chunk; return Math.max(0, Math.min(count() - 1, Math.floor(ft / C))); }
    loadManifest().then(function () { if (!count()) fail(); }, fail);
    // the clock waits for this: the piece under the current step is decoded
    o.isReady = function () {
      if (!count()) return false;
      var k = pieceAt(fs.at[Math.min(o.s, n - 1)]);
      if (ready[name + "-" + k]) return true;
      loadPiece(name, k).catch(fail); return false;
    };
    function startPiece(k, tt) {
      var C = manifest.chunk, X = manifest.overlap, last = k === count() - 1;
      var buf = ready[name + "-" + k], when = o.T0 + k * C, src = ctx.createBufferSource(), g = gain(1);
      src.buffer = buf; src.connect(g); g.connect(o.bus);
      if (when >= tt) {   // on time: fade in across the overlap (the previous piece fades out across the same 0.1 s)
        if (k > 0) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + X); }
        src.start(when);
      } else {            // joining mid-piece (a seek, a theme switch, a late download): a short fade in
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1, tt + 0.01);
        src.start(tt, tt - when);
      }
      if (!last) { var e = o.T0 + (k + 1) * C; g.gain.setValueAtTime(1, Math.max(e, tt + 0.01)); g.gain.linearRampToValueAtTime(0, Math.max(e, tt + 0.01) + X); src.stop(Math.max(e, tt + 0.01) + X + 0.02); }
      var entry = { src: src, g: g };
      o.started[k] = true; o.live.push(entry); o.nodes.push(src);
      src.onended = function () { var i = o.live.indexOf(entry); if (i >= 0) o.live.splice(i, 1); };
    }
    o.play = function (tt, s) {
      if (Math.floor(s / 16) >= song.bars && !o.tgt) {   // the outro: decide where it hands over, as the synth does
        o.tgt = { si: upNext(o), six: fs.dur[n - 1], ref: o.ref, six0: fs.dur[0], ref0: o.ref };
      }
      o.six = o.dur = fs.dur[Math.min(s, n - 1)];
      if (!count()) return;
      if (o.T0 == null || o.restart) {   // (re)anchor the file to the clock at this step
        o.live.forEach(function (p) { try { p.g.gain.cancelScheduledValues(tt); p.g.gain.setValueAtTime(p.g.gain.value, tt); p.g.gain.linearRampToValueAtTime(0, tt + 0.015); p.src.stop(tt + 0.03); } catch (e) {} });
        o.live = []; o.started = {}; o.T0 = tt - fs.at[s]; o.restart = false;
      }
      // pieces due in the next second; at the last step, everything left (the tail rings on after the handoff)
      var C = manifest.chunk, ft = tt - o.T0, k0 = pieceAt(ft), k1 = s >= n - 1 ? count() - 1 : pieceAt(ft + 1);
      for (var k = k0; k <= k1; k++) if (!o.started[k] && ready[name + "-" + k]) startPiece(k, tt);
      if (k0 + 1 < count() && ft > (k0 + 1) * C - 20) quiet(loadPiece(name, k0 + 1));   // the next piece, 20 s ahead
      if (ft > fs.at[n] - 20) {   // and the next track's first piece, for the handoff
        var nx = o.tgt ? o.tgt.si : upNext(o);
        if (FILE_TRACKS.indexOf(nx) >= 0 && manifest.tracks[theme + "-" + (nx + 1)]) quiet(loadPiece(theme + "-" + (nx + 1), 0));
      }
    };
    return o;
  }

  /* ---------- the phone player: an <audio> element, so the music keeps playing in the background ----------
   * Phones freeze a backgrounded page's scripts, and iOS suspends Web Audio altogether, so on touch devices each
   * track plays from one full-length file (assets/audio/full/<theme>-<n>.mp3, cut at the track's handoff) through
   * a plain <audio> element. The OS treats that as a media player: it keeps playing when the browser is minimised
   * or the screen locks, with lock-screen controls (Media Session), and the next track starts when the element
   * ends, so the rotation carries on in the background too. Desktop keeps the Web Audio player above (on-the-beat
   * handoffs, crossfades, the visualisers). localStorage "samuka-player" = "web" or "media" overrides the choice. */
  var MEDIA = (function () {
    if (!AUDIO_BASE || !window.Audio) return false;
    try { var o = localStorage.getItem("samuka-player"); if (o === "web") return false; if (o === "media") return true; } catch (e) {}
    return !!(window.matchMedia && matchMedia("(hover: none) and (pointer: coarse)").matches);
  })();
  var mel = null, mTail = null, mLoading = false, mPosAt = 0;
  // The handover on phones: each file runs WASH seconds past its handoff (the ringing chord). At the handoff the next
  // track starts in a second element while this one rings out underneath (mTail). iOS plays one media element at a
  // time, so there the next track starts when the ring has finished (on "ended") - smooth, just not overlapped.
  var LAP = !(/iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  function mEl() { return mel || (mel = mMake()); }
  function mMake() {
    var m = new Audio(); m.preload = "auto"; m.setAttribute("playsinline", "");
    m.addEventListener("ended", function () {   // the track (and its ring) is over: the next one, as the rotation says
      if (m === mTail) { mDropTail(); return; }
      if (m !== mel || !on || !cur || !cur.media || cur.lapped) return;
      mNext(false);
    });
    m.addEventListener("timeupdate", function () {
      if (m !== mel || !cur || !cur.media) return;
      mSync();
      if (LAP && on && !paused && !cur.lapped && !cur.noLap && m.currentTime >= cur.handAt) mNext(true);
      var ms = navigator.mediaSession, now = Date.now();
      if (ms && ms.setPositionState && cur && cur.media && now - mPosAt > 1000) {
        mPosAt = now;
        var d = mTimes().dur;
        try { ms.setPositionState({ duration: d, playbackRate: 1, position: Math.min(m.currentTime, d) }); } catch (e) {}
      }
    });
    // the OS can pause and resume us (a call, headphones unplugged, the lock screen): keep the player in step
    m.addEventListener("pause", function () { if (m !== mel || mLoading || !on || paused || m.ended) return; paused = true; mDropTail(); setMs("paused"); render(); emit(); });
    m.addEventListener("playing", function () { if (m !== mel) return; mLoading = false; if (on && paused) { paused = false; setMs("playing"); render(); emit(); } });
    // a read failed (a flaky mobile connection): try again from the same place once; if that fails too,
    // the Web Audio player takes over for the rest of the visit, at the same track and position
    m.addEventListener("error", function () {
      var o = cur; if (m !== mel || !o || !o.media || !on) return;
      var at = o.lastPos || 0;
      if (!o.retried) { o.retried = true; setTimeout(function () { if (cur === o && on) { mLoad(o.theme, o.si, o.loop, at, !paused); cur.retried = true; } }, 800); return; }
      MEDIA = false; mStop(); on = false; cur = null; paused = false;
      start(o.theme, o.si, o.loop); if (at > 1) seekTime(at);
    });
    return m;
  }
  // hand over to the next track: lap = under this one's ring (a second element), or after it (on "ended")
  function mNext(lap) {
    var o = cur, si = upNext(o);
    if (lap && washRef(o.si) !== (TRACKS[si].ref || 440)) { o.noLap = true; return; }   // tuned for another A: wait for the ring to end
    o.lapped = true;
    if (pinned && !o.loop) pinned.si = si;
    if (lap) { mDropTail(); mTail = mel; mel = null; }   // this element keeps playing its ring; the next track gets a new one
    mLoad(o.theme, si, o.loop, 0, true);
  }
  function mDropTail() { var x = mTail; mTail = null; if (x) try { x.pause(); x.removeAttribute("src"); x.load(); } catch (e) {} }
  function mLoad(theme, si, loop, at, play) {
    var P = THEMES[theme], song = TRACKS[si], fs = fileSteps(theme, si), m = mEl();
    cur = { media: true, file: true, P: P, song: song, theme: theme, si: si, s: 0, six: fs.dur[0], dur: fs.dur[0], loop: !!loop,
            ref: song.ref || 440, bpm: Math.round(song.bpm * P.bpm), fs: fs, heard: false, tgt: null, lastPos: at || 0,
            handAt: fs.at[fs.dur.length] - 0.05 };   // where the outro ends in the file (it starts at the render's 0.05 s)
    mLoading = !!play;
    m.loop = false;   // repeat is a handover to itself, under the ring, like any other
    m.volume = Math.min(1, vol * vol); m.muted = vol === 0;
    m.src = AUDIO_BASE + "full/" + theme + "-" + (si + 1) + ".mp3" + (at > 0 ? "#t=" + at.toFixed(2) : "");
    if (play) { var p = m.play(); if (p && p.catch) p.catch(function () { mLoading = false; paused = true; setMs("paused"); render(); emit(); }); }
    mSync(); nowPlaying();
  }
  // where the element is, in the track's steps: the bar, the outro, "heard"
  function mSync() {
    var o = cur; if (!o || !o.media) return;
    var at = o.fs.at, n = o.fs.dur.length, t = (mel ? mel.currentTime : 0) + 0.05, lo = 0, hi = n - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (at[mid] <= t) lo = mid; else hi = mid - 1; }
    o.s = lo; o.six = o.dur = o.fs.dur[lo];
    if (mel && mel.currentTime > 0) o.lastPos = mel.currentTime;
    if (lo >= o.song.bars * 16) { if (!o.tgt) o.tgt = { si: upNext(o), six0: o.fs.dur[0], ref0: o.ref }; }
    else o.tgt = null;
    if (o.si < 5 && !o.heard && lo >= 64) { o.heard = true; markHeard(o.theme, o.si); }
  }
  function mTimes() { var d = cur.handAt; return { pos: mel ? Math.min(mel.currentTime, d) : 0, dur: d }; }   // the track ends at its handoff; the ring is the next one's
  function mSeek(sec) { if (!mel) return; var d = mTimes().dur; try { mel.currentTime = Math.max(0, Math.min(d - 0.25, sec)); } catch (e) {} mSync(); emit(); }
  function mStop() { mDropTail(); if (mel) { mel.pause(); mel.removeAttribute("src"); try { mel.load(); } catch (e) {} } }

  /* ---------- engine ---------- */
  // si 0–4 are the songs, si 5 the director's cut; sp = { s: step } starts somewhere other than the top
  function create(theme, si, fade, loop, sp) {
    if (useFile(si, sp)) return createFile(theme, si, fade, loop, sp);
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
    // the kit: into its drive softer than before (less saturation, so less density), and out at about half the level:
    // the drums sit under the synths and strings instead of on top of them (KIT, per palette, set by measurement)
    var kitLift = Math.pow(10, ((song.kitLift || {})[P.style] || 0) / 20);   // a song whose drums should drive harder in one palette
    o.drums = gain(KIT[P.style][0]); var dsh = shaper(P.drive), dpost = gain(KIT[P.style][1] * kitLift * BAL.drums); o.drums.connect(dsh); dsh.connect(dpost); dpost.connect(o.bus);
    if (window.__samukaStem === "nodrums") o.drums.gain.value = 0;   // soundtrack-lab: render without the kit, to measure the rest
    o.duck = gain(1); o.duck.connect(o.bus);
    o.vib = osc("sine", 5.2, t, t + 36000); o.vibG = gain(8); o.vib.connect(o.vibG); o.nodes.push(o.vib);
    o.bassLp = filt("lowpass", 400, 5); var bsh = shaper(P.bassDrive), bout = gain(0.9 * BAL.bass); o.bassLp.connect(bsh); bsh.connect(bout); bout.connect(o.duck);
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
        if (st === 0) { o.dl.delayTime.setTargetAtTime(Math.min(1.9, o.six * 3), tt, 0.3); if (o.dl2) o.dl2.delayTime.setTargetAtTime(Math.min(1.9, o.six * 1.5), tt, 0.3); }
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
  // an outro finished: the next track starts on the following downbeat, under the outro's ringing chord (WASH).
  // A file's tail is already a fade, so it plays out; only its last moments are faded, to be sure it ends silent.
  // If the file's last chord was tuned for a different A than the next track's (the epilogue on repeat, say),
  // the next track waits for the ring to finish instead of starting under it.
  function handoff(o, si, loop, sp) {
    cur = create(o.theme, si, 0.05, loop, sp);
    var wait = o.file && washRef(o.si) !== (TRACKS[si].ref || 440) ? WASH - 0.5 : 0;
    cur.next = Math.max(cur.next, o.next + wait);
    if (o.file) retireAt(o, o.next + WASH - 1.2, 1.2); else retireAt(o, o.next, WASH);
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
    // never schedule into the past: a note that starts late begins mid-envelope, and a short drum hit is
    // left as a bare click. If the timer fell behind, slip the timeline a few ms instead.
    if (cur.next < now + 0.005) cur.next = now + 0.03;
    while (cur && cur.next < horizon) {
      if (cur.file && !cur.isReady()) { cur.next = Math.max(cur.next, now + 0.05); break; }   // hold the clock until the file is there
      if (cur.s >= (cur.song.bars + cur.song.outroBars) * 16) {
        var o = cur; handoff(o, o.tgt ? o.tgt.si : upNext(o), o.loop); continue;
      }
      if (cur.si < 5 && cur.s === 64) markHeard(cur.theme, cur.si);   // four bars in counts as "heard"
      cur.play(cur.next, cur.s); cur.s++; cur.next += cur.dur;
    }
  }
  function run() { if (on && !timer) timer = setInterval(tick, TICK); tick(); }
  function halt() { if (timer) clearInterval(timer); timer = null; }
  // volume and fades act after the limiter (levels are given as before, on the MASTER scale)
  function ramp(to, dur) { var t = ctx.currentTime, g = mixOut.gain; to /= MASTER; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + dur); }

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
    if (cur.media) return mTimes();
    var song = cur.song, n = (song.bars + song.outroBars) * 16, s = Math.min(cur.s, n);
    if (song.tempo) { var a = stepTimes(cur.theme, cur.si); return { pos: a[s], dur: a[n] }; }
    var dur = trackSecs(cur.theme, cur.si); return { pos: s / n * dur, dur: dur };
  }
  function seekTime(sec) {
    if (!cur) return;
    if (cur.media) return mSeek(+sec || 0);
    var song = cur.song, n = (song.bars + song.outroBars) * 16, s;
    sec = Math.max(0, +sec || 0);
    if (song.tempo) {
      var a = stepTimes(cur.theme, cur.si), lo = 0, hi = n - 1;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (a[mid] <= sec) lo = mid; else hi = mid - 1; }
      s = lo;
    } else s = Math.min(n - 1, Math.floor(sec / trackSecs(cur.theme, cur.si) * n));
    unTarget(cur); cur.s = s;
    if (cur.file) cur.restart = true; else scheduleDyn(cur, Math.max(ctx.currentTime, cur.next));   // the file, or the level curve, follows the jump
    emit();
  }

  function info() {
    if (!cur) return null;
    if (cur.media) mSync();
    var tm = times();
    var base = { name: cur.P.titles[cur.si], theme: cur.theme, themeName: cur.P.name, no: posOf(cur.si, cur.theme), si: cur.si, of: Math.max(lastPos(cur.theme), posOf(cur.si, cur.theme)), bonus: cur.si >= 6, bpm: Math.round(15 / cur.six), loop: cur.loop, paused: paused, pos: tm.pos, dur: tm.dur };
    var outro = cur.s >= cur.song.bars * 16 && cur.tgt ? " · outro → " + cur.P.titles[cur.tgt.si] : "";
    base.bar = Math.min(cur.song.bars - 1, Math.floor(cur.s / 16)); base.bars = cur.song.bars; base.outro = !!outro;
    base.style = (cur.song.chapter ? "the director's cut · " + cur.song.chapter(base.bar, cur.theme) : cur.song.mood) + outro;
    return base;
  }
  function emit() { try { window.dispatchEvent(new CustomEvent("samuka:lofi", { detail: { on: on, paused: paused, track: on && cur ? info().name : null, info: on && cur ? info() : null } })); } catch (e) {} }
  function nowPlaying() {
    var i = info(); if (!i) return;
    if (btn) btn.title = "♪ " + i.name + " · " + i.themeName + " · " + i.bpm + " bpm" + (cur.file ? "" : " (synthesized live)");
    if (nextBtn) nextBtn.title = "Next: " + cur.P.titles[upNext(cur, true)];
    if (lastSi != null && lastSi !== cur.si && !goingBack) { played.push(lastSi); if (played.length > 30) played.shift(); }
    goingBack = false; lastSi = cur.si;
    var ms = navigator.mediaSession;
    try { if (ms && window.MediaMetadata) ms.metadata = new MediaMetadata({ title: i.name, artist: "Samuka's Arcade", album: i.themeName + " soundtrack" + (cur.file ? "" : " · synthesized live") }); } catch (e) {}
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
    if (MEDIA) {
      if (bc) try { bc.postMessage({ from: tabId }); } catch (e) {}
      on = true;
      if (theme != null) mLoad(theme, si || 0, loop, 0, true);
      else if (!cur) mLoad(themeId(), 0, false, 0, true);
      else { paused = false; quiet(mEl().play()); }
      paused = false; mediaSession(); setMs("playing"); render(); emit(); return;
    }
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
    if (MEDIA && on && !paused && mel) { paused = true; mel.pause(); mDropTail(); setMs("paused"); render(); emit(); return; }
    if (!on || paused || !ctx) return;
    paused = true;
    var my = ++token;
    ramp(0.0001, 0.12);
    setTimeout(function () { if (my !== token || !paused) return; halt(); quiet(ctx.suspend()); }, 160);
    setMs("paused"); render(); emit();
  }
  function resume() {
    if (!on || !paused) return start();
    if (MEDIA) { paused = false; quiet(mEl().play()); setMs("playing"); render(); emit(); return; }
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
    [mel, mTail].forEach(function (m) { if (m) { m.volume = Math.min(1, vol * vol); m.muted = vol === 0; } });   // phones set their own volume (iOS ignores .volume, not .muted)
    emit();
  }
  // ⏮ restarts the track if it's a few seconds in, otherwise goes to the previous one
  function prev() {
    if (!on) return start();
    if (paused) resume();
    if (times().pos > 3) { seekTime(0); return; }
    var si = shuffle && played.length ? played.pop() : prevIdx(cur.theme, cur.si); if (pinned) pinned.si = si;
    goingBack = true;
    if (cur.media) return mLoad(cur.theme, si, cur.loop, 0, true);
    switchTo(cur.theme, si, 1.2, cur.loop);
  }
  function stop() {
    if (!on) return;
    if (cur && cur.media) { on = false; pinned = null; paused = false; mStop(); cur = null; setMs("none"); render(); emit(); return; }
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
    var si = upNext(cur, true); if (pinned) pinned.si = si;
    if (cur.media) return mLoad(cur.theme, si, pinned ? cur.loop : false, 0, true);
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
    // the length comes from the real step timing: an outro that slows into a slower track (4 → 5) runs
    // longer than the track's own tempo says, and its end and its tail must not be cut off
    var song = TRACKS[si], n = (song.bars + song.outroBars) * 16, secs = Math.max(trackSecs(theme, si), fileSteps(theme, si).at[n]) + WASH + 1.5;
    var live = { ctx: ctx, master: master, mixOut: mixOut, analyser: analyser, noiseBuf: noiseBuf, verbBuf: verbBuf, verbBuf2: verbBuf2 };
    var off = new OAC(2, Math.ceil(secs * rate), rate), CH = 4, o;
    function swapIn() { ctx = off; master = rs.master; analyser = rs.analyser; noiseBuf = rs.noiseBuf; verbBuf = rs.verbBuf; verbBuf2 = rs.verbBuf2; }
    function swapOut() { ctx = live.ctx; master = live.master; mixOut = live.mixOut; analyser = live.analyser; noiseBuf = live.noiseBuf; verbBuf = live.verbBuf; verbBuf2 = live.verbBuf2; }
    ctx = off; graph(); mixOut.gain.value = 1;
    var rs = { master: master, analyser: analyser, noiseBuf: noiseBuf, verbBuf: verbBuf, verbBuf2: verbBuf2 };
    o = create(theme, si, 0.02, false, { synth: true }); o.next = 0.05;
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
    setLoop: function (v) { if (cur) { cur.loop = !!v; if (!v && cur.tgt && cur.tgt.si === cur.si) cur.tgt.si = upNext(cur, true); emit(); } },
    volume: function (v) { if (v != null) setVolume(v); return vol; },
    render: renderTrack,   // (theme, si, sampleRate?) → Promise<AudioBuffer>, for saving tracks as files
    // where each bar of a track starts (seconds) and which section it belongs to: for measuring a render section by section
    layout: function (theme, si) {
      theme = THEMES[theme] ? theme : "phthalo"; var song = TRACKS[si]; if (!song) return null;
      var bars = [], per = 240 / (song.bpm * THEMES[theme].bpm), a = song.tempo ? stepTimes(theme, si) : null;
      for (var b = 0; b < song.bars; b++) bars.push({ t: a ? a[b * 16] : b * per, id: song.sec ? song.sec(b).id : song.part ? song.part(b) : null });
      return { bars: bars, end: a ? a[song.bars * 16] : song.bars * per };
    },
    // play a track in the normal rotation (it carries on to the next one when it ends)
    play: function (theme, si) { pinned = null; start(THEMES[theme] ? theme : themeId(), si | 0, false); },
    seek: function (bar) { if (!cur) return; if (cur.media) return mSeek(cur.fs.at[Math.max(0, Math.min(cur.song.bars - 1, bar | 0)) * 16] - 0.05); unTarget(cur); cur.s = Math.max(0, Math.min(cur.song.bars - 1, bar | 0)) * 16; if (cur.file) cur.restart = true; else scheduleDyn(cur, Math.max(ctx.currentTime, cur.next)); },
    track: function () { return on ? info() : null; },
    analyser: function () { return on ? analyser : null; },
    theme: themeId,
    suite: {
      open: suiteOpen, unlock: unlockSuite, heard: heardCount, heardMask: heardMask,
      title: function (th) { return THEMES[th] ? THEMES[th].titles[5] : null; },
      themes: function () { return Object.keys(THEMES).map(function (k) { return { theme: k, name: THEMES[k].name, titles: THEMES[k].titles.slice(0, 5), suite: THEMES[k].titles[5], tr: THEMES[k].tr }; }); },
      // where each chapter of the director's cut starts, in seconds (for markers on a seek bar)
      marks: function (th) { th = THEMES[th] ? th : "phthalo"; var a = stepTimes(th, 5); return CUT.chapters.map(function (c) { return { at: a[c[0] * 16], name: cutName(c[0], THEMES[th].style) }; }); }
    },
    // bonus tracks 7–10: one per arcade game, unlocked in every theme by finishing a run of it
    bonus: {
      open: bonusOpen, unlock: unlockBonus,
      list: function () { return BONUS.map(function (b) { return { si: b.si, game: b.game, name: b.name, titles: b.titles, open: bonusOpen(b.game) }; }); }
    },
    order: { next: nextIdx, prev: prevIdx },
    mode: function () { return MEDIA ? "media" : "web"; },
    shuffle: function (v) {
      if (v != null) { shuffle = !!v; try { localStorage.setItem("samuka-shuffle", shuffle ? "1" : "0"); } catch (e) {} if (cur) { cur.pick = null; if (cur.tgt && !cur.loop) cur.tgt.si = upNext(cur, true); nowPlaying(); } }
      return shuffle;
    },
    // seconds into each rendered file where its track hands over (the full-length phone files end there)
    handoffs: function () { var r = {}; Object.keys(THEMES).forEach(function (th) { FILE_TRACKS.forEach(function (si) { var f = fileSteps(th, si); r[th + "-" + (si + 1)] = f.at[f.dur.length]; }); }); return r; },   // what ⏭ / ⏮ and the outros pick (exposed for the tests)
    catalog: function () {
      return Object.keys(THEMES).map(function (k) {
        var P = THEMES[k];
        var songs = SONGS.map(function (s, i) { return { si: i, no: posOf(i, k), ord: LIST.indexOf(i), title: P.titles[i], mood: s.mood, bpm: Math.round(s.bpm * P.bpm), bars: s.bars, outro: s.outroBars, secs: Math.round((s.bars + s.outroBars) * 4 * 60 / (s.bpm * P.bpm)) }; });
        songs.push({ si: 5, no: posOf(5, k), ord: LIST.indexOf(5), title: P.titles[5], mood: CUT_MOOD, bpm: bpmRange(P), bars: SONG_CUT.bars, outro: SONG_CUT.outroBars, secs: Math.round(trackSecs(k, 5)), suite: true, locked: !suiteOpen(k), heard: heardCount(k) });
        BONUS.forEach(function (b) {
          var s = b.song;
          songs.push({ si: b.si, no: posOf(b.si, k), ord: LIST.indexOf(b.si), title: P.titles[b.si], mood: s.mood, bpm: s.range ? Math.round(s.range[0] * P.bpm) + "–" + Math.round(s.range[1] * P.bpm) : Math.round(s.bpm * P.bpm), bars: s.bars, outro: s.outroBars, secs: Math.round(trackSecs(k, b.si)), bonus: true, game: b.game, gameName: b.name, hint: b.hint || "finish a run of " + b.name + " to unlock it in every theme", locked: !bonusOpen(b.game) });
        });
        return { theme: k, name: P.name, songs: songs };
      });
    }
  };

  // theme change: same song, new palette (unless a track is pinned on the listening page)
  window.addEventListener("samuka:theme", function () {
    if (on && cur && cur.media && !pinned) {   // the phone player: the same place in the new palette's file
      var th = themeId(); if (th === cur.theme) return;
      mSync();
      if (cur.si === 5 && !suiteOpen(th)) return mLoad(th, 0, false, 0, !paused);
      var s = cur.s < cur.song.bars * 16 ? cur.s : 0;
      return mLoad(th, cur.si, cur.loop, fileSteps(th, cur.si).at[s] - 0.05, !paused);
    }
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
