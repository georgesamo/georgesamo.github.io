/* Generated ambient "lo-fi" music, Web Audio only. Style follows the site skin. */
(function () {
  "use strict";

  var AC = window.AudioContext || window.webkitAudioContext;
  var MASTER = 0.18, LOOK = 0.12, TICK = 25;
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

  /* ---------- styles ---------- */
  STYLES = {
    phthalo: { delay: [0.42, 0.32, 1600], init: function (o) {
      var b = light() ? 1.15 : 1;
      o.dur = 60 / 72 / 4;
      var keys = filt("lowpass", 1800 * b, 0.5); keys.connect(o.bus);
      var wow = lfo(o, 0.35, 7, null);
      loopNoise(o, [filt("highpass", 2500, 0.7), filt("lowpass", 9000, 0.7)], 0.006);
      var prog = [[50, 53, 57, 60, 64], [55, 59, 62, 65, 69], [48, 52, 55, 59, 62], [45, 48, 52, 55, 59]];
      var turn = [52, 56, 59, 62, 65];
      var mel = [62, 64, 67, 69, 72, 74, 76];
      var useTurn = false;
      function wob(osc) {
        wow.connect(osc.detune);
        osc.onended = function () { try { wow.disconnect(osc.detune); } catch (e) {} };
      }
      function rhodes(m, t, v, len) {
        wob(voice(o, "sine", mtof(m), t, 0.03, len, v, keys, 0.25, rnd(-4, 4)));
        wob(voice(o, "triangle", mtof(m + 12), t, 0.02, len * 0.5, v * 0.18, keys, 0.2));
      }
      o.play = function (t, s) {
        var st = s % 16, bar = Math.floor(s / 16), i;
        if (st === 0 && bar % 4 === 3) useTurn = chance(0.3);
        var ch = (bar % 4 === 3 && useTurn) ? turn : prog[bar % 4];
        if (st % 4 === 2) t += o.dur * 0.22; /* swing */
        if (st === 0 || (st === 10 && chance(0.35))) {
          var v = st === 0 ? 0.07 : 0.04;
          for (i = 0; i < ch.length; i++) {
            if (i === 0 || chance(0.9)) rhodes(ch[i], t + i * rnd(0.008, 0.025), v * rnd(0.8, 1.1), st === 0 ? 3.2 : 1.6);
          }
        }
        if (st === 0 || (st === 8 && chance(0.7))) voice(o, "sine", mtof(ch[0] - 12), t, 0.01, 0.9, 0.16, null, 0);
        if (st === 0 || st === 10 || (st === 7 && chance(0.4))) kick(o, t, 0.32, 110, 45, 0.4);
        if (st === 4 || st === 12) noise(o, t, "bandpass", 1800, 0.8, 0.05, 0.18, 0.15, 0.01);
        if (st % 2 === 0 && chance(0.85)) noise(o, t, "highpass", 6000, 0.7, st % 4 ? 0.012 : 0.02, 0.05);
        if (st % 4 === 2 && chance(0.12)) rhodes(pick(mel), t, 0.035, 1.2);
        if (chance(0.22)) noise(o, t + rnd(0, o.dur), "highpass", 2000, 1, rnd(0.03, 0.12), 0.006);
      };
    } },

    knight: { delay: [0.45, 0.55, 2200], init: function (o) {
      var b = light() ? 1.2 : 1, i;
      o.dur = 0.25;
      var lp = filt("lowpass", 380 * b, 2); lp.connect(o.bus);
      lfo(o, 0.04, 220 * b, lp.frequency);
      var dg = ctx.createGain(); dg.gain.value = 0.11; dg.connect(lp);
      var parts = [[0, -9], [0, 8], [7, 4], [12, -5]], roots = [33, 29, 31, 28], drones = [];
      for (i = 0; i < parts.length; i++) {
        var os = ctx.createOscillator();
        os.type = "sawtooth";
        os.frequency.value = mtof(roots[0] + parts[i][0]);
        os.detune.value = parts[i][1];
        os.connect(dg); os.start();
        o.nodes.push(os); drones.push(os);
      }
      var rainG = loopNoise(o, [filt("bandpass", 1400, 0.4), filt("lowpass", 6000, 0.5)], 0.05);
      loopNoise(o, [filt("highpass", 5000, 0.5)], 0.008);
      var scale = [57, 60, 62, 64, 65, 67, 69, 72, 74, 76];
      o.play = function (t, s) {
        var st = s % 16, bar = Math.floor(s / 16), j;
        if (st === 0 && bar % 2 === 0) {
          var r = roots[(bar / 2) % 4];
          for (j = 0; j < drones.length; j++) drones[j].frequency.setTargetAtTime(mtof(r + parts[j][0]), t, 1.2);
          rainG.gain.setTargetAtTime(rnd(0.03, 0.07), t, 2);
        }
        if (st === 0 && bar % 2 === 1 && chance(0.6)) {
          kick(o, t, 0.28, 70, 38, 0.35);
          kick(o, t + 0.27, 0.2, 65, 36, 0.4);
        }
        if (st % 4 === 0 && chance(0.13)) {
          var m = pick(scale);
          voice(o, "triangle", mtof(m), t, 0.005, 2.8, 0.05, null, 0.6);
          voice(o, "sine", mtof(m + 12), t, 0.005, 1.2, 0.02, null, 0.5);
        }
        if (st % 8 === 4 && chance(0.15)) rainG.gain.setTargetAtTime(rnd(0.02, 0.08), t, 1.5);
      };
    } },

    golden: { delay: [0.45, 0.3, 3500], init: function (o) {
      var b = light() ? 1.1 : 1;
      o.dur = 60 / 100 / 4;
      var prog = [[60, 64, 67, 71], [55, 59, 62, 67], [57, 60, 64, 67], [53, 57, 60, 64]];
      var pad = filt("lowpass", 1400 * b, 0.6); pad.connect(o.bus);
      var pat = [0, 1, 2, 3, 2, 1, 0, 2];
      o.play = function (t, s) {
        var st = s % 16, bar = Math.floor(s / 16), ch = prog[bar % 4], i;
        if (st === 0) {
          for (i = 0; i < ch.length; i++) {
            voice(o, "triangle", mtof(ch[i]), t, 0.4, o.dur * 16, 0.025, pad, 0.2, -6);
            voice(o, "sawtooth", mtof(ch[i]), t, 0.5, o.dur * 16, 0.008, pad, 0, 7);
          }
        }
        if (chance(0.88)) {
          var n = ch[pat[(st + (bar % 2) * 3) % 8]] + 12 + ((st >= 12 && chance(0.3)) ? 12 : 0);
          voice(o, st % 2 ? "triangle" : "square", mtof(n), t, 0.004, 0.16, st % 2 ? 0.05 : 0.025, null, 0.25);
        }
        if (st === 0 || st === 6 || st === 8 || (st === 14 && chance(0.5))) voice(o, "triangle", mtof(ch[0] - 24), t, 0.01, 0.3, 0.2);
        if (st === 0 || st === 8 || (st === 10 && chance(0.3))) kick(o, t, 0.3, 140, 50, 0.28);
        if (st === 4 || st === 12) {
          for (i = 0; i < 3; i++) noise(o, t + i * 0.011, "bandpass", 1500, 1.2, 0.07, 0.06, 0.2);
        }
        if (st % 2 === 0) noise(o, t, "highpass", 8000, 0.7, 0.015, 0.04);
        if (st === 0 && chance(0.5)) voice(o, "sine", mtof(ch[1 + Math.floor(Math.random() * 3)] + 24), t, 0.01, 1.6, 0.025, null, 0.6);
      };
    } },

    crt: { delay: [0.375, 0.25, 3000], init: function (o) {
      o.dur = 60 / 120 / 4;
      var prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      var lp = filt("lowpass", light() ? 5200 : 4200, 0.5); lp.connect(o.bus);
      o.play = function (t, s) {
        var st = s % 16, bar = Math.floor(s / 16), ch = prog[bar % 4];
        var n = ch[st % 3] + 12 + (Math.floor(st / 4) % 2) * 12;
        if (!(st === 15 && chance(0.5))) voice(o, "pulse", mtof(n), t, 0.002, o.dur * 0.85, 0.035, lp, 0.15);
        if (st % 2 === 0) {
          voice(o, "triangle", mtof(ch[0] - 12 + (st % 4 === 2 ? 12 : 0)), t, 0.003, o.dur * 1.6, 0.12, lp);
          noise(o, t, "highpass", 7000, 0.7, st % 4 ? 0.015 : 0.025, 0.03);
        }
        if (st === 0 || st === 8 || (st === 11 && chance(0.4))) kick(o, t, 0.25, 180, 55, 0.15);
        if (st === 4 || st === 12) noise(o, t, "bandpass", 2500, 0.7, 0.05, 0.09);
        if (bar % 4 === 3 && st >= 12 && chance(0.5)) voice(o, "square", mtof(ch[2] + 24), t, 0.002, 0.08, 0.02, lp);
      };
    } }
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
    btn.setAttribute("aria-label", "Play generated lo-fi music");
    btn.title = "lo-fi (generated)";
    btn.textContent = "♪";
    btn.addEventListener("click", toggle);
    var ref = bar.querySelector("[data-toggle-theme]");
    if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref); else bar.appendChild(btn);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
