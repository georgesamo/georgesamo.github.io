/* Generated chill cyberpunk lo-fi, Web Audio only (no audio files). Style follows the site skin. */
(function () {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.32, LOOK = 0.12, TICK = 25;
  var ctx = null, master = null, noiseBuf = null, pulseWave = null, analyser = null;
  var on = false, timer = null, insts = [], cur = null, token = 0, btn = null;
  var STYLES;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function chance(p) { return Math.random() < p; }
  function quiet(p) { if (p && p.catch) p.catch(function () {}); }
  function skinName(s) { return STYLES[s] ? s : "phthalo"; }
  function skin() { return skinName(document.documentElement.dataset.skin); }
  function light() { return document.documentElement.dataset.theme === "light"; }

  function ensureCtx() {
    if (ctx) return true;
    try {
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0;
      master.connect(comp); comp.connect(ctx.destination);
      analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8; comp.connect(analyser);
      var len = ctx.sampleRate * 2, d, i;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      d = noiseBuf.getChannelData(0);
      for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (i = 1; i < n; i++) re[i] = 2 / (i * Math.PI) * Math.sin(i * Math.PI * 0.25);
      pulseWave = ctx.createPeriodicWave(re, im);
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  /* ---------- building blocks ---------- */
  function filt(type, f, q) {
    var b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }

  function sendTo(o, g, amt) {
    if (!amt) return;
    var s = ctx.createGain();
    s.gain.value = amt; g.connect(s); s.connect(o.send);
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function voice(o, type, freq, t, a, d, peak, dest, send, detune) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    if (type === "pulse") osc.setPeriodicWave(pulseWave); else osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.setValueAtTime(detune, t);
    a = Math.max(a, 0.002);
    env(g, t, a, d, peak);
    osc.connect(g); g.connect(dest || o.bus); sendTo(o, g, send);
    osc.start(t); osc.stop(t + a + d + 0.05);
    return osc;
  }

  function noise(o, t, ftype, freq, q, peak, d, send, a) {
    var src = ctx.createBufferSource(), f = filt(ftype, freq, q), g = ctx.createGain();
    a = a || 0.002;
    src.buffer = noiseBuf;
    env(g, t, a, d, peak);
    src.connect(f); f.connect(g); g.connect(o.bus); sendTo(o, g, send);
    src.start(t, Math.random() * 1.5); src.stop(t + a + d + 0.05);
  }

  function kick(o, t, peak, f0, f1, d) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    env(g, t, 0.005, d, peak);
    osc.connect(g); g.connect(o.bus);
    osc.start(t); osc.stop(t + d + 0.06);
  }

  function loopNoise(o, chain, gain) {
    var src = ctx.createBufferSource(), g = ctx.createGain(), last = src, i;
    src.buffer = noiseBuf; src.loop = true;
    for (i = 0; i < chain.length; i++) { last.connect(chain[i]); last = chain[i]; }
    g.gain.value = gain; last.connect(g); g.connect(o.bus);
    src.start(); o.nodes.push(src);
    return g;
  }

  function lfo(o, rate, depth, param) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.value = rate; g.gain.value = depth;
    osc.connect(g); if (param) g.connect(param);
    osc.start(); o.nodes.push(osc);
    return g;
  }

  /* ---------- generated playlist: chill cyberpunk synth (no noise, no static) ----------
   * Every track is composed on the fly: a key, two chord progressions (verse and
   * chorus), tempo, arp pattern, bass groove and sounds are picked from the skin's
   * mood. A track runs ~64 bars (about 3 minutes) through intro → verse → chorus →
   * breakdown → verse → outro, then crossfades into the next one. Only tonal sounds:
   * deep bass ducking under a soft kick, wide detuned saw pads, a gated arp into a
   * dotted-eighth delay and a slow gliding lead.
   */
  var CHORD = { min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], sus2: [0, 2, 7, 12], add9: [0, 4, 7, 14], m11: [0, 3, 7, 10, 17] };
  var PROGS = {
    minor: [
      [[0, "min9"], [8, "maj7"], [3, "maj7"], [10, "add9"]],
      [[0, "min7"], [5, "min9"], [10, "dom7"], [3, "maj9"]],
      [[0, "min9"], [10, "add9"], [8, "maj7"], [10, "sus2"]],
      [[0, "m11"], [7, "min7"], [8, "maj7"], [5, "min9"]],
      [[0, "min9"], [3, "maj7"], [5, "min7"], [7, "min7"]],
      [[0, "min7"], [8, "maj9"], [5, "min7"], [7, "sus2"]],
      [[0, "min9"], [5, "min9"], [8, "maj7"], [7, "dom7"]]
    ],
    dorian: [
      [[0, "min9"], [5, "dom7"], [0, "min9"], [5, "sus2"]],
      [[0, "m11"], [2, "min7"], [3, "maj7"], [5, "dom7"]],
      [[0, "min9"], [10, "maj7"], [5, "dom7"], [0, "m11"]]
    ],
    major: [
      [[0, "maj9"], [4, "min7"], [9, "min9"], [5, "maj7"]],
      [[5, "maj7"], [7, "dom7"], [4, "min7"], [9, "min9"]],
      [[2, "min9"], [7, "dom7"], [0, "maj9"], [9, "min7"]],
      [[0, "maj9"], [7, "add9"], [9, "min7"], [5, "maj9"]],
      [[5, "maj9"], [0, "maj7"], [2, "min9"], [7, "sus2"]]
    ]
  };
  var SCALES = { minor: [0, 2, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], major: [0, 2, 4, 7, 9, 11] };
  var ARP_PATS = [[0, 2, 1, 3, 2, 4, 1, 3], [0, 1, 2, 3, 2, 1, 3, 0], [0, 2, 4, 2, 1, 3, 4, 3], [0, 3, 1, 4, 2, 3, 1, 2], [4, 3, 2, 1, 2, 3, 0, 1], [0, 0, 2, 1, 3, 3, 2, 4]];
  // bass grooves: step -> [interval, length in beats, chance]
  var GROOVES = [
    { 0: [0, 1.7, 1], 6: [0, 0.5, 1], 10: [0, 0.9, 0.7], 14: [12, 0.35, 0.4] },
    { 0: [0, 1.2, 1], 3: [0, 0.4, 0.6], 8: [7, 0.8, 0.9], 12: [0, 0.6, 0.8] },
    { 0: [0, 2.6, 1], 10: [0, 0.9, 0.6], 14: [-5, 0.4, 0.5] },
    { 0: [0, 0.9, 1], 4: [12, 0.3, 0.5], 6: [0, 0.6, 0.9], 11: [7, 0.4, 0.6], 14: [10, 0.4, 0.4] }
  ];
  var MOODS = {
    phthalo: { modes: ["minor", "dorian", "minor"], bpm: [78, 90], keys: [45, 47, 48, 50, 52], pad: [900, 1400], arp: [1500, 2400], arpWaves: ["square", "triangle", "sawtooth"], leadWaves: ["triangle", "sine"],
      words: [["Neon", "Phthalo", "Midnight", "Glass", "Velvet", "Subway", "Rooftop", "Emerald", "Afterglow"], ["Drive", "Signal", "Grid", "Avenue", "Afterhours", "Overpass", "Transit", "Circuit", "District"]] },
    knight: { modes: ["minor"], bpm: [68, 80], keys: [43, 45, 46, 48], pad: [550, 900], arp: [1000, 1600], arpWaves: ["sawtooth", "square"], leadWaves: ["sine", "triangle"], drone: 0.045, fb: 0.5, tone: 2000, bassCut: 360,
      words: [["Crimson", "Iron", "Shadow", "Midnight", "Gargoyle", "Steel", "Harbor", "Cold", "Silent"], ["Watch", "Patrol", "Signal", "Alley", "Vigil", "Lantern", "Skyline", "Rooftops", "Precinct"]] },
    golden: { modes: ["major"], bpm: [84, 98], keys: [48, 50, 52, 53, 55], pad: [1400, 2000], arp: [2400, 3400], arpWaves: ["triangle", "square"], leadWaves: ["triangle", "sine"], arpUp: true, swing: 0.08,
      words: [["Lavender", "Golden", "Starlight", "Candy", "Moonlit", "Sugar", "Cloud", "Purple", "Sunset"], ["Hour", "Dream", "Parade", "Bloom", "Glow", "Letters", "Stage", "Confetti", "Daydream"]] },
    crt: { modes: ["minor", "dorian"], bpm: [86, 100], keys: [45, 48, 50], pad: [800, 1100], arp: [2000, 2800], arpWaves: ["pulse"], leadWaves: ["square", "pulse"], arpDensity: 0.82,
      words: [["8-bit", "Phosphor", "Cathode", "Pixel", "Scanline", "Terminal", "Bitwise", "Raster", "Amber"], ["Boot", "Loop", "Dreams", "Prompt", "Cursor", "Kernel", "Daemon", "Cache", "Uplink"]] }
  };
  STYLES = MOODS;
  var BARS = 64, trackNo = 0, lastName = "";

  function irand(a, b) { return Math.floor(rnd(a, b + 1)); }
  function voicing(key, deg, q) {
    var base = key + deg; while (base > key + 6) base -= 12; while (base < key - 5) base += 12;
    return CHORD[q].map(function (i) { return base + i; });
  }
  function makeTrack(skinId) {
    var m = MOODS[skinName(skinId)], mode = pick(m.modes), key = pick(m.keys);
    var pa = pick(PROGS[mode]), pb = pick(PROGS[mode]);
    for (var guard = 0; pb === pa && guard < 5; guard++) pb = pick(PROGS[mode]);
    var scale = [], sc = SCALES[mode];
    [12, 24].forEach(function (oct) { sc.forEach(function (i) { scale.push(key + oct + i); }); });
    var name;
    do { name = pick(m.words[0]) + " " + pick(m.words[1]); } while (name === lastName);
    lastName = name; trackNo++;
    return {
      name: name, no: trackNo, mode: mode, skin: skinName(skinId),
      bpm: irand(m.bpm[0], m.bpm[1]),
      progA: pa.map(function (c) { return voicing(key, c[0], c[1]); }),
      progB: pb.map(function (c) { return voicing(key, c[0], c[1]); }),
      scale: scale,
      padCut: rnd(m.pad[0], m.pad[1]), padVol: rnd(0.052, 0.068),
      arpCut: rnd(m.arp[0], m.arp[1]), arpVol: rnd(0.018, 0.026), arpWave: pick(m.arpWaves), arpPat: pick(ARP_PATS), arpUp: !!m.arpUp, arpDensity: m.arpDensity || rnd(0.6, 0.78),
      groove: pick(GROOVES), leadWave: pick(m.leadWaves), leadVol: rnd(0.042, 0.058), leadDensity: rnd(0.45, 0.68), leadCut: rnd(1500, 2600),
      swing: m.swing != null ? m.swing : rnd(0.06, 0.16), drone: m.drone || 0, fb: m.fb || rnd(0.36, 0.46), tone: m.tone || rnd(2200, 3000), bassCut: m.bassCut || rnd(380, 480)
    };
  }
  // song form: which layers play in which bar
  function section(bar) {
    if (bar < 4) return { prog: "A", pads: 1, bass: bar >= 2, kick: 0, arp: 0, lead: 0 };
    if (bar < 20) return { prog: "A", pads: 1, bass: 1, kick: 1, arp: 0.7, lead: bar >= 12 ? 0.5 : 0 };
    if (bar < 36) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
    if (bar < 44) return { prog: "A", pads: 1, bass: bar % 2 === 0, kick: 0, arp: 0.25, lead: 0.8 };
    if (bar < 60) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
    return { prog: "A", pads: 1, bass: bar < 62, kick: 0, arp: 0, lead: 0 };
  }

  function init(o, cfg) {
    var beat = 60 / cfg.bpm, b = light() ? 1.2 : 1;
    o.dur = beat / 4;
    var duck = ctx.createGain(); duck.gain.value = 1; duck.connect(o.bus);
    function pump(t, depth) {
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(depth, t);
      duck.gain.setTargetAtTime(1, t + 0.02, beat * 0.28);
    }
    var padLp = filt("lowpass", cfg.padCut * b, 0.9); padLp.connect(duck);
    lfo(o, 1 / (beat * 16), cfg.padCut * 0.5 * b, padLp.frequency);
    var arpLp = filt("lowpass", cfg.arpCut * b, 3); arpLp.connect(o.bus);
    lfo(o, 1 / (beat * 8), cfg.arpCut * 0.4 * b, arpLp.frequency);
    var subLp = filt("lowpass", 180, 0.7); subLp.connect(duck);
    var bassLp = filt("lowpass", cfg.bassCut, 4); bassLp.connect(duck);
    lfo(o, 1 / (beat * 4), 120, bassLp.frequency);
    var leadLp = filt("lowpass", cfg.leadCut * b, 1); leadLp.connect(o.bus);
    var vib = lfo(o, 5, 9, null);
    var drones = [];
    if (cfg.drone) {
      var dg = ctx.createGain(); dg.gain.value = cfg.drone; dg.connect(padLp);
      [[-12, -8], [-12, 9], [-5, 3]].forEach(function (p) {
        var os = ctx.createOscillator(); os.type = "sawtooth";
        os.frequency.value = mtof(cfg.progA[0][0] + p[0]); os.detune.value = p[1];
        os.connect(dg); os.start(); o.nodes.push(os); drones.push({ osc: os, off: p[0] });
      });
    }
    var motif = [], lastNote = cfg.scale[3];
    function newMotif(density) {
      motif = [];
      var steps = [0, 6, 8, 14, 16, 22, 24, 28];
      var idx = cfg.scale.indexOf(lastNote); if (idx < 0) idx = 3;
      steps.forEach(function (st) {
        if (!chance(cfg.leadDensity * density)) return;
        idx = Math.max(0, Math.min(cfg.scale.length - 1, idx + pick([-2, -1, -1, 0, 1, 1, 2])));
        motif.push({ st: st, n: cfg.scale[idx], len: pick([2, 3, 4, 6]) });
      });
      if (motif.length) lastNote = motif[motif.length - 1].n;
    }
    function lead(n, t, len) {
      var d = o.dur * len * 1.1;
      var a = voice(o, cfg.leadWave, mtof(n), t, 0.06, d, cfg.leadVol, leadLp, 0.5);
      var c = voice(o, "sawtooth", mtof(n), t, 0.08, d, cfg.leadVol * 0.25, leadLp, 0.5, 7);
      [a, c].forEach(function (osc) {
        vib.connect(osc.detune);
        osc.onended = function () { try { vib.disconnect(osc.detune); } catch (e) {} };
      });
    }
    o.play = function (t, s) {
      var st = s % 16, bar = Math.floor(s / 16);
      if (bar >= BARS) { if (!o.ended) { o.ended = true; setTimeout(function () { if (o === cur) next(4); }, 0); } return; }
      var sec = section(bar), prog = sec.prog === "B" ? cfg.progB : cfg.progA, ch = prog[bar % prog.length], j;
      var sw = st % 2 === 1 ? o.dur * cfg.swing : 0;
      if (st === 0) {
        for (j = 0; j < ch.length; j++) {
          voice(o, "sawtooth", mtof(ch[j]), t, beat * 1.2, beat * 5.5, cfg.padVol / ch.length, padLp, 0.18, -9);
          voice(o, "sawtooth", mtof(ch[j]), t, beat * 1.4, beat * 5.5, cfg.padVol / ch.length, padLp, 0.18, 9);
        }
        if (cfg.drone) drones.forEach(function (d) { d.osc.frequency.setTargetAtTime(mtof(ch[0] + d.off), t, beat); });
        if (bar % 2 === 0) newMotif(sec.lead || 0);
      }
      var root = ch[0] - 12, g = cfg.groove[st];
      if (sec.bass && g && chance(g[2])) {
        voice(o, "sine", mtof(root + g[0]), t + sw, 0.008, beat * g[1], 0.3, subLp, 0);
        voice(o, "sawtooth", mtof(root + g[0]), t + sw, 0.01, beat * g[1] * 0.8, 0.08, bassLp, 0.05);
        voice(o, "sawtooth", mtof(root + g[0]), t + sw, 0.01, beat * g[1] * 0.8, 0.05, bassLp, 0, 12);
      }
      if (sec.kick && (st === 0 || (st === 11 && chance(0.4)))) { kick(o, t, st ? 0.2 : 0.3, 90, 40, 0.42); pump(t, 0.32); }
      if (sec.arp && chance(cfg.arpDensity * sec.arp)) {
        var n = ch[cfg.arpPat[(st + bar * 3) % cfg.arpPat.length] % ch.length] + 12 + ((cfg.arpUp || sec.up) && st >= 8 && chance(0.22) ? 12 : 0);
        voice(o, cfg.arpWave, mtof(n), t + sw, 0.004, o.dur * 1.4, cfg.arpVol, arpLp, 0.45, rnd(-6, 6));
      }
      if (sec.lead) {
        var pos = (bar % 2) * 16 + st;
        motif.forEach(function (m) { if (m.st === pos) lead(m.n, t + sw, m.len); });
      }
    };
  }

  /* ---------- instances (one per track, crossfaded) ---------- */
  function create(skinId, fade) {
    var cfg = makeTrack(skinId), t = ctx.currentTime, beat = 60 / cfg.bpm;
    var o = { name: cfg.skin, track: cfg, s: 0, until: Infinity, nodes: [] };
    o.bus = ctx.createGain();
    o.bus.gain.setValueAtTime(0.0001, t);
    o.bus.gain.linearRampToValueAtTime(1, t + fade);
    o.bus.connect(master);
    o.send = ctx.createGain();
    var dl = ctx.createDelay(2), fb = ctx.createGain(), tone = filt("lowpass", cfg.tone, 0.5);
    dl.delayTime.value = beat * 0.75; fb.gain.value = cfg.fb;
    o.send.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(o.bus);
    init(o, cfg);
    o.next = t + 0.06;
    insts.push(o);
    nowPlaying(cfg);
    return o;
  }

  function kill(o) {
    var i = insts.indexOf(o);
    if (i < 0) return;
    insts.splice(i, 1);
    for (i = 0; i < o.nodes.length; i++) { try { o.nodes[i].stop(); } catch (e) {} }
    try { o.bus.disconnect(); o.send.disconnect(); } catch (e) {}
  }

  function retire(o, fade) {
    var t = ctx.currentTime, g = o.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(0.0001, t + fade);
    o.until = t + fade;
    setTimeout(function () { kill(o); }, fade * 1000 + 300);
  }

  function swap(name) {
    name = skinName(name);
    if (cur && cur.name === name) return;
    if (cur) retire(cur, 2);
    cur = create(name, 2);
  }
  function next(fade) {
    if (!on || !ctx) return;
    if (cur) retire(cur, fade || 2.5);
    cur = create(skin(), fade || 2.5);
  }

  function tick() {
    if (!ctx) return;
    // background tabs get timers far less often, so schedule further ahead while hidden
    var now = ctx.currentTime, horizon = now + (document.hidden ? 3 : LOOK), i, o;
    for (i = 0; i < insts.length; i++) {
      o = insts[i];
      if (o.next < now - 0.25) o.next = now + 0.02;
      while (o.next < horizon && o.next < o.until) {
        o.play(o.next, o.s);
        o.s++;
        o.next += o.dur;
      }
    }
  }

  function run() { if (on && !timer) timer = setInterval(tick, TICK); tick(); }
  function halt() { if (timer) clearInterval(timer); timer = null; }

  function ramp(to, dur) {
    var t = ctx.currentTime, g = master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + dur);
  }

  function emit() {
    try { window.dispatchEvent(new CustomEvent("samuka:lofi", { detail: { on: on, track: on && cur ? cur.track.name : null } })); } catch (e) {}
  }
  function nowPlaying(cfg) {
    if (btn) btn.title = "♪ " + cfg.name + " · " + cfg.bpm + " bpm (generated live)";
    if (nextBtn) nextBtn.title = "Skip: " + cfg.name;
    var ms = navigator.mediaSession;
    try { if (ms && window.MediaMetadata) ms.metadata = new MediaMetadata({ title: cfg.name, artist: "Samuka's Arcade", album: "night-city lo-fi · generated live · #" + cfg.no }); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent("samuka:lofi", { detail: { on: on, track: cfg.name, bpm: cfg.bpm, no: cfg.no } })); } catch (e) {}
  }

  var nextBtn = null;
  function render() {
    if (!btn) return;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.innerHTML = on ? '<span class="lofi-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : "♪";
    if (!on) btn.title = "night-city lo-fi (generated live)";
    if (nextBtn) nextBtn.hidden = !on;
  }

  /* ---------- public API ---------- */
  function start() {
    if (on) return;
    if (!AC || !ensureCtx()) { if (btn) btn.hidden = true; return; }
    on = true; token++;
    quiet(ctx.resume());
    ramp(MASTER, 1.5);
    if (!cur || insts.indexOf(cur) < 0) cur = create(skin(), 0.05);
    else swap(skin());
    run(); mediaSession();
    render(); emit();
  }

  function stop() {
    if (!on) return;
    on = false;
    var my = ++token;
    ramp(0, 0.8);
    render(); emit();
    setTimeout(function () {
      if (my !== token || on) return;
      halt();
      while (insts.length) kill(insts[0]);
      cur = null;
      quiet(ctx.suspend());
    }, 900);
  }

  function toggle() { if (on) stop(); else start(); }
  function isOn() { return on; }

  window.SamukaLofi = {
    toggle: toggle, start: start, stop: stop, isOn: isOn, next: function () { next(2); },
    track: function () { return on && cur ? { name: cur.track.name, bpm: cur.track.bpm, no: cur.track.no, bar: Math.floor(cur.s / 16), bars: BARS } : null; },
    analyser: function () { return on ? analyser : null; }
  };

  window.addEventListener("samuka:theme", function (e) {
    if (!on || !ctx) return;
    swap((e && e.detail && e.detail.skin) || skin());
  });

  // keep playing while the tab is hidden or the window minimised
  document.addEventListener("visibilitychange", function () {
    if (!on || !ctx) return;
    tick();   // fill the longer lookahead right away
    if (!document.hidden && ctx.state !== "running") { var p = ctx.resume(); if (p && p.then) p.then(run, run); else run(); }
  });

  // OS media controls (lock screen, media keys) where supported
  function mediaSession() {
    var ms = navigator.mediaSession; if (!ms) return;
    try {
      ms.setActionHandler("pause", function () { stop(); ms.playbackState = "paused"; });
      ms.setActionHandler("play", function () { start(); ms.playbackState = "playing"; });
      ms.setActionHandler("stop", function () { stop(); });
      ms.setActionHandler("nexttrack", function () { next(2); });
      ms.playbackState = "playing";
    } catch (e) {}
  }

  function mount() {
    var bar = document.querySelector(".tabs__actions");
    if (!bar || !AC || bar.querySelector(".lofi-btn")) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn lofi-btn";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Play generated cyberpunk lo-fi music");
    btn.title = "night-city lo-fi (generated live)";
    btn.textContent = "♪";
    btn.addEventListener("click", toggle);
    nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "icon-btn lofi-btn lofi-next";
    nextBtn.setAttribute("aria-label", "Next generated track");
    nextBtn.textContent = "⏭";
    nextBtn.hidden = true;
    nextBtn.addEventListener("click", function () { next(2); });
    var ref = bar.querySelector("[data-toggle-theme]");
    if (ref && ref.parentNode) { ref.parentNode.insertBefore(btn, ref); ref.parentNode.insertBefore(nextBtn, ref); }
    else { bar.appendChild(btn); bar.appendChild(nextBtn); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
