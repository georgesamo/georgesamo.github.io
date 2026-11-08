/* Generated chill cyberpunk lo-fi, Web Audio only (no audio files). Style follows the site skin. */
(function () {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.5, LOOK = 0.12, TICK = 25;
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
  var CHORD = { min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], sus2: [0, 2, 7, 12], add9: [0, 4, 7, 14], m11: [0, 3, 7, 10, 17], sus4: [0, 5, 7, 12], maj7s11: [0, 4, 7, 11, 18], min6: [0, 3, 7, 9], six9: [0, 4, 9, 14] };
  var PROGS = {
    minor: [
      [[0, "min9"], [8, "maj7"], [3, "maj7"], [10, "add9"]],
      [[0, "min7"], [5, "min9"], [10, "dom7"], [3, "maj9"]],
      [[0, "min9"], [10, "add9"], [8, "maj7"], [10, "sus2"]],
      [[0, "m11"], [7, "min7"], [8, "maj7"], [5, "min9"]],
      [[0, "min9"], [3, "maj7"], [5, "min7"], [7, "min7"]],
      [[0, "min7"], [8, "maj9"], [5, "min7"], [7, "sus2"]],
      [[0, "min9"], [5, "min9"], [8, "maj7"], [7, "dom7"]],
      // added
      [[0, "min9"], [8, "maj9"], [10, "sus4"], [10, "add9"]],
      [[0, "min6"], [5, "min9"], [3, "six9"], [7, "sus4"]],
      [[8, "maj9"], [10, "add9"], [0, "min9"], [0, "m11"]],
      [[0, "m11"], [3, "maj7s11"], [8, "maj7"], [7, "min7"]],
      [[5, "min9"], [8, "maj7"], [0, "min7"], [10, "sus2"]]
    ],
    dorian: [
      [[0, "min9"], [5, "dom7"], [0, "min9"], [5, "sus2"]],
      [[0, "m11"], [2, "min7"], [3, "maj7"], [5, "dom7"]],
      [[0, "min9"], [10, "maj7"], [5, "dom7"], [0, "m11"]],
      // added
      [[0, "min9"], [3, "six9"], [5, "dom7"], [10, "add9"]],
      [[0, "m11"], [5, "sus4"], [5, "dom7"], [2, "min9"]]
    ],
    major: [
      [[0, "maj9"], [4, "min7"], [9, "min9"], [5, "maj7"]],
      [[5, "maj7"], [7, "dom7"], [4, "min7"], [9, "min9"]],
      [[2, "min9"], [7, "dom7"], [0, "maj9"], [9, "min7"]],
      [[0, "maj9"], [7, "add9"], [9, "min7"], [5, "maj9"]],
      [[5, "maj9"], [0, "maj7"], [2, "min9"], [7, "sus2"]],
      // added
      [[0, "six9"], [9, "min9"], [2, "min9"], [7, "sus4"]],
      [[5, "maj7s11"], [4, "min7"], [2, "min9"], [0, "maj9"]],
      [[0, "add9"], [7, "add9"], [9, "min7"], [4, "min7"]]
    ],
    lydian: [
      [[0, "maj7s11"], [2, "add9"], [0, "maj9"], [2, "sus2"]],
      [[0, "maj9"], [2, "dom7"], [7, "maj7"], [9, "min9"]],
      [[0, "maj7s11"], [11, "min7"], [9, "min9"], [2, "add9"]]
    ]
  };
  var SCALES = { minor: [0, 2, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], major: [0, 2, 4, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11] };
  var ARP_PATS = [[0, 2, 1, 3, 2, 4, 1, 3], [0, 1, 2, 3, 2, 1, 3, 0], [0, 2, 4, 2, 1, 3, 4, 3], [0, 3, 1, 4, 2, 3, 1, 2], [4, 3, 2, 1, 2, 3, 0, 1], [0, 0, 2, 1, 3, 3, 2, 4], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 0, 3, 0, 4, 0, 3]];
  // bass grooves: step -> [interval, length in beats, chance]
  var GROOVES = [
    { 0: [0, 1.7, 1], 6: [0, 0.5, 1], 10: [0, 0.9, 0.7], 14: [12, 0.35, 0.4] },
    { 0: [0, 1.2, 1], 3: [0, 0.4, 0.6], 8: [7, 0.8, 0.9], 12: [0, 0.6, 0.8] },
    { 0: [0, 2.6, 1], 10: [0, 0.9, 0.6], 14: [-5, 0.4, 0.5] },
    { 0: [0, 0.9, 1], 4: [12, 0.3, 0.5], 6: [0, 0.6, 0.9], 11: [7, 0.4, 0.6], 14: [10, 0.4, 0.4] },
    // synthwave: driving eighth-note octaves
    { 0: [0, 0.4, 1], 2: [12, 0.3, 1], 4: [0, 0.4, 1], 6: [12, 0.3, 1], 8: [0, 0.4, 1], 10: [12, 0.3, 1], 12: [0, 0.4, 1], 14: [12, 0.3, 1] },
    // syncopated night-drive
    { 0: [0, 0.45, 1], 2: [12, 0.3, 0.9], 3: [0, 0.3, 0.7], 6: [0, 0.45, 1], 8: [0, 0.45, 1], 10: [12, 0.3, 0.9], 11: [0, 0.3, 0.7], 14: [7, 0.4, 0.8] },
    // added: lo-fi hop walk, outrun sixteenths, vapor long notes, chiptune bounce
    { 0: [0, 0.8, 1], 7: [0, 0.4, 0.8], 10: [3, 0.5, 0.7], 12: [5, 0.5, 0.6], 14: [7, 0.4, 0.5] },
    { 0: [0, 0.22, 1], 1: [0, 0.2, 1], 2: [12, 0.2, 1], 3: [0, 0.2, 1], 4: [0, 0.22, 1], 5: [0, 0.2, 1], 6: [12, 0.2, 1], 7: [0, 0.2, 1], 8: [0, 0.22, 1], 9: [0, 0.2, 1], 10: [12, 0.2, 1], 11: [0, 0.2, 1], 12: [0, 0.22, 1], 13: [0, 0.2, 1], 14: [12, 0.2, 1], 15: [7, 0.2, 1] },
    { 0: [0, 3.5, 1], 12: [-2, 0.8, 0.5] },
    { 0: [0, 0.3, 1], 2: [7, 0.3, 1], 4: [12, 0.3, 1], 6: [7, 0.3, 1], 8: [0, 0.3, 1], 10: [7, 0.3, 1], 12: [12, 0.3, 1], 14: [10, 0.3, 1] }
  ];
  // per-track flavours, shared by every skin (each skin weights them differently)
  // pad: saw | tri | ep (electric piano) | choir | wob (vapor wobble)   melody: lead | piano | bells
  var FLAVORS = {
    drive: { grooves: [4, 5, 4], supersaw: 1, stabs: 0.9, leadEarly: 1, bassVol: 0.6, bpm: 6, lead: [0.62, 0.8], drums: "drive", piano: 0.2 },
    noir: { grooves: [5, 1, 3], supersaw: 0.6, stabs: 0.7, leadEarly: 0.8, bassVol: 0.65, bpm: 0, lead: [0.55, 0.72], drums: "noir", piano: 0.35 },
    dream: { grooves: [0, 2, 1], supersaw: 0.25, stabs: 0.2, leadEarly: 0.5, bassVol: 0.75, bpm: -3, lead: [0.48, 0.65], drums: "dream", piano: 0.55 },
    // calm: slow, mostly a soft piano wandering over pads, lots of space (ambient-game feel)
    calm: { grooves: [2], supersaw: 0, stabs: 0, leadEarly: 0, bassVol: 0.45, bpm: -16, lead: [0.3, 0.45], drums: "calm", piano: 1, calm: true },
    // added flavours
    hop: { grooves: [6, 0, 6], supersaw: 0, stabs: 0, leadEarly: 0.4, bassVol: 0.7, bpm: -8, lead: [0.4, 0.55], drums: "hop", piano: 0.3, pad: "ep", swing: 0.24, arpMul: 0.4 },
    outrun: { grooves: [7, 4], supersaw: 1, stabs: 0.5, leadEarly: 1, bassVol: 0.55, bpm: 16, lead: [0.6, 0.78], drums: "outrun", piano: 0, arp16: true, swing: 0.02 },
    vapor: { grooves: [8, 2], supersaw: 0, stabs: 0, leadEarly: 0.6, bassVol: 0.6, bpm: -18, lead: [0.4, 0.55], drums: "vapor", piano: 0.4, pad: "wob", melody: "bells" },
    chip: { grooves: [9, 4], supersaw: 0, stabs: 0, leadEarly: 1, bassVol: 0.5, bpm: 8, lead: [0.6, 0.78], drums: "chip", piano: 0, chip: true, arp16: true, swing: 0 },
    musicbox: { grooves: [2, 0], supersaw: 0, stabs: 0, leadEarly: 0.9, bassVol: 0.5, bpm: -10, lead: [0.5, 0.68], drums: "dream", piano: 0.2, pad: "tri", melody: "bells" },
    choir: { grooves: [2, 1], supersaw: 0.4, stabs: 0, leadEarly: 0.5, bassVol: 0.6, bpm: -6, lead: [0.45, 0.6], drums: "noir", piano: 0.3, pad: "choir" }
  };
  var MOODS = {
    phthalo: { flavors: ["drive", "noir", "dream", "calm", "calm", "hop", "hop", "outrun", "vapor", "musicbox", "choir"], modes: ["minor", "dorian", "minor"], bpm: [78, 90], keys: [45, 47, 48, 50, 52], pad: [900, 1400], arp: [1500, 2400], arpWaves: ["square", "triangle", "sawtooth"], leadWaves: ["triangle", "sine"],
      words: [["Neon", "Phthalo", "Midnight", "Glass", "Velvet", "Subway", "Rooftop", "Emerald", "Afterglow", "Jade", "Chrome", "Low-light", "Holo", "Mint", "Ivy", "Hologram"], ["Drive", "Signal", "Grid", "Avenue", "Afterhours", "Overpass", "Transit", "Circuit", "District", "Arcade", "Monorail", "Terrace", "Garden", "Frequency", "Boulevard", "Tunnel"]] },
    knight: { flavors: ["drive", "noir", "drive", "noir", "dream", "calm", "outrun", "outrun", "choir", "choir", "hop"], modes: ["minor", "minor", "dorian"], bpm: [80, 92], keys: [45, 46, 48, 50], pad: [900, 1400], arp: [1800, 2800], arpWaves: ["sawtooth", "square"], leadWaves: ["sawtooth", "square", "triangle"], fb: 0.46, tone: 2600, bassCut: 420,
      words: [["Crimson", "Iron", "Shadow", "Midnight", "Gargoyle", "Steel", "Harbor", "Cold", "Silent", "Obsidian", "Ashen", "Scarlet", "Rain-slick", "Last", "Hollow"], ["Watch", "Patrol", "Signal", "Alley", "Vigil", "Lantern", "Skyline", "Rooftops", "Precinct", "Searchlight", "Pursuit", "Bridge", "Cathedral", "Oath", "Night Shift", "Ledger"]] },
    golden: { flavors: ["dream", "calm", "drive", "calm", "vapor", "vapor", "musicbox", "musicbox", "hop", "choir"], modes: ["major", "major", "lydian"], bpm: [84, 98], keys: [48, 50, 52, 53, 55], pad: [1400, 2000], arp: [2400, 3400], arpWaves: ["triangle", "square"], leadWaves: ["triangle", "sine"], arpUp: true, swing: 0.08,
      words: [["Lavender", "Golden", "Starlight", "Candy", "Moonlit", "Sugar", "Cloud", "Purple", "Sunset", "Bunny", "Lilac", "Glitter", "Ribbon", "Peach", "Velvet", "Cotton"], ["Hour", "Dream", "Parade", "Bloom", "Glow", "Letters", "Stage", "Confetti", "Daydream", "Encore", "Postcard", "Carousel", "Lightstick", "Promise", "Diary", "Balloon"]] },
    crt: { flavors: ["noir", "drive", "calm", "chip", "chip", "chip", "outrun", "hop"], modes: ["minor", "dorian"], bpm: [86, 100], keys: [45, 48, 50], pad: [800, 1100], arp: [2000, 2800], arpWaves: ["pulse"], leadWaves: ["square", "pulse"], arpDensity: 0.82,
      words: [["8-bit", "Phosphor", "Cathode", "Pixel", "Scanline", "Terminal", "Bitwise", "Raster", "Amber", "Floppy", "Modem", "Sprite", "Vector", "Sector", "Overflow", "Null"], ["Boot", "Loop", "Dreams", "Prompt", "Cursor", "Kernel", "Daemon", "Cache", "Uplink", "Checksum", "Level 2", "High Score", "Interrupt", "Handshake", "Buffer", "Sector"]] }
  };
  STYLES = MOODS;
  // song shapes: classic (as before), slow build, short, and a key-change lift for the last choruses
  function classic(bar) {
    if (bar < 4) return { prog: "A", pads: 1, bass: bar >= 2, kick: 0, arp: 0, lead: 0 };
    if (bar < 20) return { prog: "A", pads: 1, bass: 1, kick: 1, arp: 0.7, lead: bar >= 12 ? 0.5 : 0 };
    if (bar < 36) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
    if (bar < 44) return { prog: "A", pads: 1, bass: bar % 2 === 0, kick: 0, arp: 0.25, lead: 0.8 };
    if (bar < 60) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
    return { prog: "A", pads: 1, bass: bar < 62, kick: 0, arp: 0, lead: 0 };
  }
  var FORMS = [
    { id: "classic", len: 64, at: classic },
    { id: "classic", len: 64, at: classic },
    { id: "lift", len: 64, at: classic, lift: 44 },
    { id: "build", len: 64, at: function (bar) {
      if (bar < 8) return { prog: "A", pads: 1, bass: 0, kick: 0, arp: 0, lead: 0 };
      if (bar < 16) return { prog: "A", pads: 1, bass: 1, kick: 0, arp: 0.4, lead: 0.5 };
      if (bar < 32) return { prog: "A", pads: 1, bass: 1, kick: 1, arp: 0.8, lead: 0.7 };
      if (bar < 48) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
      if (bar < 56) return { prog: "A", pads: 1, bass: bar % 2 === 0, kick: 0, arp: 0.3, lead: 0.8 };
      return { prog: "A", pads: 1, bass: bar < 60, kick: 0, arp: 0, lead: 0 };
    } },
    { id: "short", len: 48, at: function (bar) {
      if (bar < 2) return { prog: "A", pads: 1, bass: 0, kick: 0, arp: 0, lead: 0 };
      if (bar < 14) return { prog: "A", pads: 1, bass: 1, kick: 1, arp: 0.7, lead: 0.5 };
      if (bar < 30) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
      if (bar < 38) return { prog: "A", pads: 1, bass: 1, kick: 0, arp: 0.3, lead: 0.8 };
      if (bar < 46) return { prog: "B", pads: 1, bass: 1, kick: 1, arp: 1, lead: 1, up: 1 };
      return { prog: "A", pads: 1, bass: 0, kick: 0, arp: 0, lead: 0 };
    } }
  ];
  var trackNo = 0, lastName = "", lastFlavor = "";

  function irand(a, b) { return Math.floor(rnd(a, b + 1)); }
  function voicing(key, deg, q) {
    var base = key + deg; while (base > key + 6) base -= 12; while (base < key - 5) base += 12;
    return CHORD[q].map(function (i) { return base + i; });
  }
  function makeTrack(skinId) {
    var m = MOODS[skinName(skinId)];
    var flName; do { flName = pick(m.flavors || ["dream"]); } while (flName === lastFlavor && m.flavors.length > 2 && chance(0.7));
    lastFlavor = flName;
    var fl = FLAVORS[flName];
    var mode = pick(m.modes); if (!PROGS[mode]) mode = "minor";
    var key = pick(m.keys);
    var pa = pick(PROGS[mode]), pb = pick(PROGS[mode]);
    for (var guard = 0; pb === pa && guard < 5; guard++) pb = pick(PROGS[mode]);
    var scale = [], sc = SCALES[mode];
    [12, 24].forEach(function (oct) { sc.forEach(function (i) { scale.push(key + oct + i); }); });
    var name;
    do { name = pick(m.words[0]) + " " + pick(m.words[1]); } while (name === lastName);
    lastName = name; trackNo++;
    var form = pick(FORMS);
    return {
      flavor: fl, flavorName: flName, form: form, liftBy: mode === "major" || mode === "lydian" ? 2 : pick([2, 3]),
      drums: fl.drums, piano: chance(fl.piano), calm: !!fl.calm, chip: !!fl.chip, pad: fl.pad || (fl.calm ? "tri" : "saw"), melody: fl.melody || "lead", arp16: !!fl.arp16, arpMul: fl.arpMul || 1,
      supersaw: chance(fl.supersaw), stabs: chance(fl.stabs), leadEarly: chance(fl.leadEarly), bassVol: fl.bassVol,
      name: name, no: trackNo, mode: mode, skin: skinName(skinId),
      bpm: Math.max(56, irand(m.bpm[0], m.bpm[1]) + fl.bpm),
      progA: pa.map(function (c) { return voicing(key, c[0], c[1]); }),
      progB: pb.map(function (c) { return voicing(key, c[0], c[1]); }),
      scale: scale,
      padCut: rnd(m.pad[0], m.pad[1]), padVol: rnd(0.06, 0.076),
      arpCut: rnd(m.arp[0], m.arp[1]), arpVol: rnd(0.026, 0.034), arpWave: fl.chip ? "pulse" : pick(m.arpWaves), arpPat: pick(ARP_PATS), arpUp: !!m.arpUp, arpDensity: m.arpDensity || rnd(0.6, 0.78),
      groove: GROOVES[pick(fl.grooves)], leadWave: fl.chip ? pick(["square", "pulse"]) : pick(m.leadWaves), leadVol: rnd(0.062, 0.078), leadDensity: rnd(fl.lead[0], fl.lead[1]), leadCut: rnd(1800, 3000),
      swing: fl.swing != null ? fl.swing : m.swing != null ? m.swing : rnd(0.06, 0.16), drone: m.drone || 0, fb: m.fb || rnd(0.36, 0.46), tone: m.tone || rnd(2200, 3000), bassCut: m.bassCut || rnd(380, 480)
    };
  }

  function init(o, cfg) {
    var beat = 60 / cfg.bpm, b = light() ? 1.2 : 1, form = cfg.form;
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
    var bassLp = filt("lowpass", cfg.chip ? 1400 : cfg.bassCut, cfg.chip ? 1 : 4); bassLp.connect(duck);
    lfo(o, 1 / (beat * 4), 120, bassLp.frequency);
    var leadLp = filt("lowpass", cfg.leadCut * b, 1); leadLp.connect(o.bus);
    var vib = lfo(o, 5, cfg.chip ? 4 : 9, null);
    var wob = cfg.pad === "wob" ? lfo(o, 0.33, 16, null) : null;   // vapor: slow tape-like wobble
    // choir: saws through three vowel formants
    var choirIn = null;
    if (cfg.pad === "choir") {
      choirIn = ctx.createGain(); choirIn.gain.value = 1;
      var cg = ctx.createGain(); cg.gain.value = 2.2; cg.connect(duck);
      [[700, 5, 1], [1150, 6, 0.7], [2600, 7, 0.35]].forEach(function (fm) {
        var bp = filt("bandpass", fm[0], fm[1]), fg = ctx.createGain(); fg.gain.value = fm[2];
        choirIn.connect(bp); bp.connect(fg); fg.connect(cg);
      });
    }
    var epLp = filt("lowpass", 2600 * b, 0.6); epLp.connect(duck);
    function epiano(n, t, v, d) {
      var f = mtof(n), c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      c.frequency.value = f; mo.frequency.value = f;
      mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.04, t + 0.6);
      mo.connect(mg); mg.connect(c.frequency);
      env(g, t, 0.004, d, 0.045 * v); c.connect(g); g.connect(epLp); sendTo(o, g, 0.25);
      c.start(t); mo.start(t); c.stop(t + d + 0.1); mo.stop(t + d + 0.1);
    }
    var bellLp = filt("lowpass", 6000, 0.5); bellLp.connect(o.bus);
    function bell(n, t, v) {
      var f = mtof(n);
      voice(o, "sine", f, t, 0.002, 1.8, 0.05 * v, bellLp, 0.5);
      voice(o, "sine", f * 2.76, t, 0.001, 0.6, 0.018 * v, bellLp, 0.4);
      voice(o, "sine", f * 5.4, t, 0.001, 0.22, 0.008 * v, bellLp, 0.3);
    }
    function wobbly(osc) { if (!wob) return; wob.connect(osc.detune); osc.onended = function () { try { wob.disconnect(osc.detune); } catch (e) {} }; }
    function padChord(ch, t) {
      var j, n = ch.length;
      if (cfg.pad === "ep") { for (j = 0; j < n; j++) epiano(ch[j], t + j * 0.012, 0.9, beat * 3.2); return; }
      if (cfg.pad === "choir") {
        for (j = 0; j < n; j++) [-6, 6].forEach(function (dt) { voice(o, "sawtooth", mtof(ch[j]), t, beat * 1.6, beat * 5.5, cfg.padVol / n * 0.9, choirIn, 0.25, dt); });
        return;
      }
      var pv = cfg.padVol / n * (cfg.calm ? 0.55 : 1), pw = cfg.pad === "tri" ? "triangle" : "sawtooth";
      for (j = 0; j < n; j++) {
        wobbly(voice(o, pw, mtof(ch[j]), t, beat * 1.2, beat * 5.5, pv, padLp, 0.18, -9));
        wobbly(voice(o, pw, mtof(ch[j]), t, beat * 1.4, beat * 5.5, pv, padLp, 0.18, 9));
      }
    }
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
      var steps = cfg.chip ? [0, 2, 4, 6, 8, 12, 16, 18, 20, 24, 28] : [0, 6, 8, 14, 16, 22, 24, 28];
      var idx = cfg.scale.indexOf(lastNote); if (idx < 0) idx = 3;
      steps.forEach(function (st) {
        if (!chance(cfg.leadDensity * density)) return;
        idx = Math.max(0, Math.min(cfg.scale.length - 1, idx + pick([-2, -1, -1, 0, 1, 1, 2])));
        motif.push({ st: st, n: cfg.scale[idx], len: cfg.chip ? pick([1, 2, 2, 3]) : pick([2, 3, 4, 6]) });
      });
      if (motif.length) lastNote = motif[motif.length - 1].n;
    }
    var prevLead = 0;
    function lead(n, t, len) {
      if (cfg.melody === "bells") { bell(n + 12, t, 0.9); return; }
      var d = o.dur * len * 1.1, f = mtof(n), oscs = [];
      if (cfg.supersaw) {
        // synthwave supersaw: three detuned saws that glide in from the previous note
        [-14, 0, 14].forEach(function (dt) {
          var osc = voice(o, "sawtooth", f, t, 0.03, d, cfg.leadVol * 0.42, leadLp, 0.55, dt);
          if (prevLead) { osc.frequency.setValueAtTime(prevLead, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.06); }
          oscs.push(osc);
        });
        oscs.push(voice(o, "square", f / 2, t, 0.03, d, cfg.leadVol * 0.12, leadLp, 0.3));
      } else if (cfg.chip) {
        oscs.push(voice(o, cfg.leadWave, f, t, 0.002, d * 0.8, cfg.leadVol * 0.7, leadLp, 0.3));
      } else {
        oscs.push(voice(o, cfg.leadWave, f, t, 0.06, d, cfg.leadVol, leadLp, 0.5));
        oscs.push(voice(o, "sawtooth", f, t, 0.08, d, cfg.leadVol * 0.25, leadLp, 0.5, 7));
      }
      prevLead = f;
      oscs.forEach(function (osc) {
        vib.connect(osc.detune);
        osc.onended = function () { try { vib.disconnect(osc.detune); } catch (e) {} };
      });
    }
    var stabLp = filt("lowpass", 2400 * b, 2); stabLp.connect(o.bus);
    // drums: tonal where possible (no hiss); hats are short metallic tones
    var drumBus = ctx.createGain(); drumBus.gain.value = 1; drumBus.connect(o.bus);
    var hatHp = filt("highpass", 6500, 0.7); hatHp.connect(drumBus);
    function snare(t, v) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "triangle"; osc.frequency.setValueAtTime(210, t); osc.frequency.exponentialRampToValueAtTime(130, t + 0.09);
      env(g, t, 0.002, 0.14, 0.11 * v); osc.connect(g); g.connect(drumBus); osc.start(t); osc.stop(t + 0.2);
      noise(o, t, "bandpass", 2200, 0.9, 0.035 * v, 0.07, 0.25, 0.002);
    }
    function chipSnare(t, v) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "square"; osc.frequency.setValueAtTime(520, t); osc.frequency.exponentialRampToValueAtTime(140, t + 0.07);
      env(g, t, 0.001, 0.08, 0.03 * v); osc.connect(g); g.connect(drumBus); osc.start(t); osc.stop(t + 0.12);
    }
    function hat(t, v, long) {
      [6150, 8270].forEach(function (f) { voice(o, "square", f, t, 0.001, long ? 0.09 : 0.035, 0.006 * v, hatHp, 0); });
    }
    function rim(t, v) { voice(o, "triangle", 1650, t, 0.001, 0.05, 0.03 * v, drumBus, 0.2); voice(o, "sine", 820, t, 0.001, 0.04, 0.03 * v, drumBus, 0); }
    function drums(t, st, bar, sw) {
      var d = cfg.drums;
      if (d === "drive") {
        if (st % 2 === 0) hat(t + sw, st % 4 === 2 ? 1 : 0.6);
        if (st === 4 || st === 12) snare(t, 1);
      } else if (d === "noir") {
        if (chance(st % 2 ? 0.45 : 0.9)) hat(t + sw, st % 4 === 2 ? 1 : 0.5);
        if (st === 8) snare(t, 0.9);
        if (st === 15 && chance(0.25)) snare(t, 0.35);
      } else if (d === "dream") {
        if (st % 4 === 2 && chance(0.8)) hat(t + sw, 0.6);
        if (st === 8 || (st === 14 && chance(0.3))) rim(t + sw, 0.8);
      } else if (d === "calm") {
        if (bar % 2 === 1 && st === 8 && chance(0.6)) rim(t, 0.45);
      } else if (d === "hop") {
        if (st % 2 === 0) hat(t + sw, st % 4 === 0 ? 0.9 : 0.55);
        if (st === 4 || st === 12) snare(t + sw * 0.3, 0.8);
        if (st === 15 && chance(0.3)) rim(t + sw, 0.4);
      } else if (d === "outrun") {
        if (st % 4 === 2) hat(t, 1, true);
        else if (st % 2 === 1 && chance(0.5)) hat(t, 0.4);
        if (st === 4 || st === 12) snare(t, 1.15);
      } else if (d === "vapor") {
        if (st === 8) snare(t, 0.55);
        if (st % 4 === 2 && chance(0.5)) hat(t + sw, 0.45);
      } else if (d === "chip") {
        if (st % 2 === 0) hat(t, st % 4 === 0 ? 0.7 : 0.45);
        if (st === 4 || st === 12) chipSnare(t, 1);
      }
    }
    function kickHere(st, bar) {
      switch (cfg.drums) {
        case "drive": return st === 0 || st === 8 || (st === 10 && chance(0.3));
        case "calm": return st === 0 && bar % 2 === 0 && chance(0.5);
        case "hop": return st === 0 || st === 10 || (st === 7 && chance(0.35));
        case "outrun": return st % 4 === 0;
        case "vapor": return st === 0 || (st === 9 && chance(0.5));
        case "chip": return st === 0 || st === 8;
        default: return st === 0 || (st === 11 && chance(0.4));
      }
    }
    // soft synthesized piano: fundamental + gentle overtones, fast attack, long decay
    var pianoLp = filt("lowpass", 2800 * b, 0.5); pianoLp.connect(o.bus);
    function piano(n, t, v, len) {
      var f = mtof(n), d = Math.max(1.4, len || 2.6);
      voice(o, "sine", f, t, 0.004, d, 0.07 * v, pianoLp, 0.4, rnd(-3, 3));
      voice(o, "sine", f * 2, t, 0.003, d * 0.45, 0.022 * v, pianoLp, 0.3);
      voice(o, "triangle", f * 3, t, 0.002, d * 0.2, 0.008 * v, pianoLp, 0.2);
    }
    // piano phrases: slow, sparse, stepwise; broken chords on calm tracks
    var pPhrase = [], pLast = cfg.scale[4] || cfg.scale[2];
    function newPhrase(ch, dense) {
      pPhrase = [];
      var spots = dense ? [0, 4, 8, 12, 16, 20, 24, 28] : [0, 6, 12, 18, 24];
      var idx = cfg.scale.indexOf(pLast); if (idx < 0) idx = 4;
      spots.forEach(function (sp) {
        if (!chance(dense ? 0.55 : 0.4)) return;
        idx = Math.max(0, Math.min(cfg.scale.length - 1, idx + pick([-2, -1, 1, 1, 2, -1, 0])));
        pPhrase.push({ st: sp, n: cfg.scale[idx] + (cfg.calm ? 0 : 12), v: rnd(0.6, 1) });
      });
      if (pPhrase.length) pLast = pPhrase[pPhrase.length - 1].n - (cfg.calm ? 0 : 12);
    }
    o.play = function (t, s) {
      var st = s % 16, bar = Math.floor(s / 16);
      if (bar >= form.len) { if (!o.ended) { o.ended = true; setTimeout(function () { if (o === cur) next(4); }, 0); } return; }
      var sec = form.at(bar), shift = form.lift && bar >= form.lift ? cfg.liftBy : 0;
      var prog = sec.prog === "B" ? cfg.progB : cfg.progA, ch = prog[bar % prog.length].map(function (x) { return x + shift; }), j;
      var sw = st % 2 === 1 ? o.dur * cfg.swing : 0;
      if (st === 0) {
        padChord(ch, t);
        if (cfg.drone) drones.forEach(function (d) { d.osc.frequency.setTargetAtTime(mtof(ch[0] + d.off), t, beat); });
        if (bar % 2 === 0) newMotif(sec.lead || 0);
      }
      var root = ch[0] - 12, g = cfg.groove[st];
      if (sec.bass && g && chance(g[2])) {
        var bv = cfg.bassVol;
        if (cfg.chip) {
          voice(o, "triangle", mtof(root + g[0]), t, 0.002, beat * g[1], 0.16 * bv, bassLp, 0);
        } else {
          voice(o, "sine", mtof(root + g[0]), t + sw, 0.008, beat * g[1], 0.17 * bv, subLp, 0);
          voice(o, "sawtooth", mtof(root + g[0]), t + sw, 0.01, beat * g[1] * 0.8, 0.08 * bv, bassLp, 0.05);
          voice(o, "sawtooth", mtof(root + g[0]), t + sw, 0.01, beat * g[1] * 0.8, 0.05 * bv, bassLp, 0, 12);
        }
      }
      if (sec.kick && kickHere(st, bar)) { kick(o, t, cfg.calm ? 0.09 : cfg.drums === "outrun" ? 0.17 : st ? 0.13 : 0.2, 95, 45, 0.32); if (!cfg.calm) pump(t, 0.45); }
      if (sec.kick || (bar >= 2 && bar < 4 && cfg.drums !== "calm")) drums(t, st, bar, sw);
      // piano: the voice of calm tracks, a quiet counter-melody elsewhere
      if (cfg.piano) {
        if (st === 0 && bar % 2 === 0) newPhrase(ch, !cfg.calm);
        if (cfg.calm && st === 0 && bar % 4 === 0) {
          // slow broken chord, like someone resting their hands on the keys
          for (j = 0; j < Math.min(4, ch.length); j++) piano(ch[j] + 12, t + j * o.dur * 1.5, 0.55 - j * 0.08, 3.5);
        }
        var pp = (bar % 2) * 16 + st;
        pPhrase.forEach(function (p) { if (p.st === pp && (cfg.calm || sec.lead || bar >= 8)) piano(p.n + shift, t + sw * 0.5, p.v * (cfg.calm ? 1 : 0.55), cfg.calm ? 3.2 : 2); });
      }
      var arpChance = cfg.arp16 ? (sec.arp ? 0.95 : 0) : cfg.arpDensity * sec.arp * cfg.arpMul;
      if (sec.arp && !cfg.calm && chance(arpChance)) {
        var n = ch[cfg.arpPat[(st + bar * 3) % cfg.arpPat.length] % ch.length] + 12 + ((cfg.arpUp || sec.up) && st >= 8 && chance(0.22) ? 12 : 0);
        voice(o, cfg.arpWave, mtof(n), t + sw, 0.004, o.dur * (cfg.arp16 ? 0.9 : 1.4), cfg.arpVol * (cfg.arp16 ? 0.8 : 1), arpLp, 0.45, rnd(-6, 6));
      }
      // synthwave chord stabs on the off-beats
      if (cfg.stabs && sec.kick && (st === 4 || st === 12 || (st === 14 && chance(0.3)))) {
        for (j = 1; j < ch.length; j++) voice(o, "sawtooth", mtof(ch[j] + 12), t + sw, 0.004, beat * 0.32, 0.022, stabLp, 0.35, (j % 2 ? -8 : 8));
      }
      var leadAmt = cfg.calm ? 0 : (sec.lead || (cfg.leadEarly && bar >= 6 && bar < form.len - 4 ? 0.75 : 0));
      if (st === 0 && bar % 2 === 0 && !sec.lead && leadAmt) newMotif(leadAmt);
      if (leadAmt) {
        var pos = (bar % 2) * 16 + st;
        motif.forEach(function (m) { if (m.st === pos) lead(m.n + shift, t + sw, m.len); });
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
    track: function () { return on && cur ? { name: cur.track.name, bpm: cur.track.bpm, no: cur.track.no, bar: Math.floor(cur.s / 16), bars: cur.track.form.len, style: cur.track.flavorName } : null; },
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
