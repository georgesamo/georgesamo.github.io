/* Generated chill cyberpunk lo-fi, Web Audio only (no audio files). Style follows the site skin. */
(function () {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.32, LOOK = 0.12, TICK = 25;
  var ctx = null, master = null, noiseBuf = null, pulseWave = null;
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

  /* ---------- styles: chill cyberpunk synth (no noise, no static) ----------
   * Only tonal sounds: a deep bass that ducks under a soft kick (sidechain pump),
   * wide detuned saw pads through a slowly sweeping filter, a gated synth arp into
   * a dotted-eighth delay, and a slow gliding lead melody. Skins change the key,
   * tempo, brightness and timbre.
   */
  function cyber(cfg) {
    var beat = 60 / cfg.bpm;
    return {
      delay: [beat * 0.75, cfg.fb || 0.42, cfg.delayTone || 2600],
      init: function (o) {
        var b = light() ? 1.2 : 1, i;
        o.dur = beat / 4;
        // sidechain: pads + bass go through a gain that dips on every kick
        var duck = ctx.createGain(); duck.gain.value = 1; duck.connect(o.bus);
        function pump(t, depth) {
          duck.gain.cancelScheduledValues(t);
          duck.gain.setValueAtTime(depth, t);
          duck.gain.setTargetAtTime(1, t + 0.02, beat * 0.28);
        }
        var padLp = filt("lowpass", cfg.padCut * b, 0.9); padLp.connect(duck);
        lfo(o, 1 / (beat * 16), cfg.padCut * 0.5 * b, padLp.frequency);   // one sweep every 4 bars
        var arpLp = filt("lowpass", cfg.arpCut * b, 3); arpLp.connect(o.bus);
        lfo(o, 1 / (beat * 8), cfg.arpCut * 0.4 * b, arpLp.frequency);
        var subLp = filt("lowpass", 180, 0.7); subLp.connect(duck);
        var bassLp = filt("lowpass", cfg.bassCut || 420, 4); bassLp.connect(duck);   // warm, slightly resonant
        lfo(o, 1 / (beat * 4), 120, bassLp.frequency);
        var leadLp = filt("lowpass", (cfg.leadCut || 2200) * b, 1); leadLp.connect(o.bus);
        var vib = lfo(o, 5, 9, null);   // gentle vibrato for the lead
        // optional constant drone (Dark Knight)
        var drones = [];
        if (cfg.drone) {
          var dg = ctx.createGain(); dg.gain.value = cfg.drone; dg.connect(padLp);
          [[-12, -8], [-12, 9], [-5, 3]].forEach(function (p) {
            var os = ctx.createOscillator(); os.type = "sawtooth";
            os.frequency.value = mtof(cfg.prog[0][0] + p[0]); os.detune.value = p[1];
            os.connect(dg); os.start(); o.nodes.push(os); drones.push({ osc: os, off: p[0] });
          });
        }
        var arpPat = cfg.arpPat || [0, 2, 1, 3, 2, 4, 1, 3];
        // lead: a short motif per 2 bars, built from the scale and nudged toward chord tones
        var motif = [], lastNote = cfg.scale[2];
        function newMotif() {
          motif = [];
          var steps = [0, 6, 8, 14, 16, 22, 24, 28];   // 16th-steps within 2 bars where notes may start
          var idx = cfg.scale.indexOf(lastNote); if (idx < 0) idx = 2;
          steps.forEach(function (st) {
            if (!chance(cfg.leadDensity || 0.55)) return;
            idx = Math.max(0, Math.min(cfg.scale.length - 1, idx + pick([-2, -1, -1, 0, 1, 1, 2])));
            motif.push({ st: st, n: cfg.scale[idx], len: pick([2, 3, 4, 6]) });
          });
          if (motif.length) lastNote = motif[motif.length - 1].n;
        }
        function lead(n, t, len) {
          var d = o.dur * len * 1.1;
          var a = voice(o, cfg.leadWave || "triangle", mtof(n), t, 0.06, d, cfg.leadVol || 0.05, leadLp, 0.5);
          var c = voice(o, "sawtooth", mtof(n), t, 0.08, d, (cfg.leadVol || 0.05) * 0.25, leadLp, 0.5, 7);
          [a, c].forEach(function (osc) {
            vib.connect(osc.detune);
            osc.onended = function () { try { vib.disconnect(osc.detune); } catch (e) {} };
          });
        }
        o.play = function (t, s) {
          var st = s % 16, bar = Math.floor(s / 16), ch = cfg.prog[bar % cfg.prog.length], j;
          var sw = st % 2 === 1 ? o.dur * (cfg.swing || 0.12) : 0;   // light shuffle
          // pads, once per bar, slow attack
          if (st === 0) {
            for (j = 0; j < ch.length; j++) {
              voice(o, "sawtooth", mtof(ch[j]), t, beat * 1.2, beat * 5.5, cfg.padVol / ch.length, padLp, 0.18, -9);
              voice(o, "sawtooth", mtof(ch[j]), t, beat * 1.4, beat * 5.5, cfg.padVol / ch.length, padLp, 0.18, 9);
            }
            if (cfg.drone) drones.forEach(function (d) { d.osc.frequency.setTargetAtTime(mtof(ch[0] + d.off), t, beat); });
            if (bar % 2 === 0) newMotif();
          }
          // bass: deep sine sub + warm filtered saw, root on 1, pickups, octave walk
          var root = ch[0] - 12;
          var hit = st === 0 ? [root, 1.7] : st === 6 ? [root, 0.5] : st === 10 && chance(0.7) ? [root + (chance(0.3) ? 7 : 0), 0.9] : st === 14 && chance(0.4) ? [root + 12, 0.35] : null;
          if (hit) {
            voice(o, "sine", mtof(hit[0]), t + sw, 0.008, beat * hit[1], 0.3, subLp, 0);
            voice(o, "sawtooth", mtof(hit[0]), t + sw, 0.01, beat * hit[1] * 0.8, 0.08, bassLp, 0.05);
            voice(o, "sawtooth", mtof(hit[0]), t + sw, 0.01, beat * hit[1] * 0.8, 0.05, bassLp, 0, 12);
          }
          // soft kick on 1 (+ ghost) drives the pump; no snares or hats
          if (st === 0 || (st === 11 && chance(0.4))) { kick(o, t, st ? 0.2 : 0.3, 90, 40, 0.42); pump(t, 0.32); }
          // gated arp: chord tones an octave up, wandering pattern
          if (chance(cfg.arpDensity || 0.7)) {
            var n = ch[arpPat[(st + bar * 3) % arpPat.length] % ch.length] + 12 + (cfg.arpUp && st >= 8 && chance(0.25) ? 12 : 0);
            voice(o, cfg.arpWave || "square", mtof(n), t + sw, 0.004, o.dur * 1.4, cfg.arpVol || 0.024, arpLp, 0.45, rnd(-6, 6));
          }
          // lead melody
          var pos = (bar % 2) * 16 + st;
          motif.forEach(function (m) { if (m.st === pos) lead(m.n, t + sw, m.len); });
        };
      }
    };
  }

  STYLES = {
    // Phthalo: neon-noir night drive, D dorian
    phthalo: cyber({ bpm: 84, prog: [[50, 57, 60, 64, 65], [46, 53, 57, 60, 62], [53, 57, 60, 64], [45, 52, 55, 60, 64]],
      scale: [62, 64, 65, 67, 69, 72, 74, 76], padCut: 1100, padVol: 0.065, arpCut: 1900, arpVol: 0.022, leadVol: 0.05 }),
    // Dark Knight: the original mood — low drone, slow and dark, A minor
    knight: cyber({ bpm: 78, prog: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]],
      scale: [57, 60, 62, 64, 67, 69, 72, 74], padCut: 700, padVol: 0.055, arpCut: 1300, arpVol: 0.02, arpWave: "sawtooth",
      drone: 0.045, leadCut: 1500, leadWave: "sine", leadVol: 0.06, bassCut: 360, fb: 0.5, delayTone: 2000 }),
    // Golden: dreamy synth-pop haze, F lydian, brighter
    golden: cyber({ bpm: 90, prog: [[53, 57, 60, 64], [55, 59, 62, 66], [52, 55, 59, 62], [57, 60, 64, 67]],
      scale: [65, 67, 69, 71, 72, 74, 76, 77], padCut: 1700, padVol: 0.06, arpCut: 3000, arpVol: 0.022, arpWave: "triangle", arpUp: true,
      leadCut: 3000, leadVol: 0.045, leadDensity: 0.65, swing: 0.08 }),
    // CRT: retro terminal synth, pulse arp, C minor
    crt: cyber({ bpm: 92, prog: [[48, 55, 60, 63], [44, 51, 56, 60], [46, 53, 58, 62], [43, 50, 55, 58]],
      scale: [60, 63, 65, 67, 70, 72, 75, 77], padCut: 900, padVol: 0.05, arpCut: 2400, arpVol: 0.028, arpWave: "pulse", arpDensity: 0.8,
      leadWave: "square", leadCut: 1800, leadVol: 0.035, arpPat: [0, 1, 2, 3, 2, 1, 3, 0] })
  };

  /* ---------- instances (one per style, crossfaded) ---------- */
  function create(name, fade) {
    var def = STYLES[name], t = ctx.currentTime;
    var o = { name: name, s: 0, until: Infinity, nodes: [] };
    o.bus = ctx.createGain();
    o.bus.gain.setValueAtTime(0.0001, t);
    o.bus.gain.linearRampToValueAtTime(1, t + fade);
    o.bus.connect(master);
    o.send = ctx.createGain();
    var dl = ctx.createDelay(2), fb = ctx.createGain(), tone = filt("lowpass", def.delay[2], 0.5);
    dl.delayTime.value = def.delay[0]; fb.gain.value = def.delay[1];
    o.send.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(o.bus);
    def.init(o);
    o.next = t + 0.06;
    insts.push(o);
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

  function tick() {
    if (!ctx) return;
    var now = ctx.currentTime, horizon = now + LOOK, i, o;
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
    try { window.dispatchEvent(new CustomEvent("samuka:lofi", { detail: { on: on } })); } catch (e) {}
  }

  function render() {
    if (!btn) return;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.innerHTML = on ? '<span class="lofi-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : "♪";
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
    if (!document.hidden) run();
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

  window.SamukaLofi = { toggle: toggle, start: start, stop: stop, isOn: isOn };

  window.addEventListener("samuka:theme", function (e) {
    if (!on || !ctx) return;
    swap((e && e.detail && e.detail.skin) || skin());
  });

  document.addEventListener("visibilitychange", function () {
    if (!on || !ctx) return;
    if (document.hidden) { halt(); quiet(ctx.suspend()); return; }
    var p = ctx.resume();
    if (p && p.then) p.then(run, run); else run();
  });

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
    var ref = bar.querySelector("[data-toggle-theme]");
    if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref); else bar.appendChild(btn);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
