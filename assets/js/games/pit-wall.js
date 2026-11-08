/* Pit Wall · grand prix race strategy (original game; fictional teams and circuits)
 *
 * You are the race engineer. 10 cars, ten circuits, varied weather.
 * Modes: Quick race · Grand Prix (pick the circuit and weather) · World Championship (10 rounds, saved).
 * Call the pit stops, pick tyres, set the driver mode, deploy ERS, react to rain, safety cars and incidents.
 * Lap times come from pace + compound + wear (with a cliff) + fuel + weather + mode; pushing, worn tyres
 * and slicks in the wet raise the risk of spins, punctures and crashes.
 *
 * Motion: every lap is a time→distance plan (pit stops and spins are real stops at a spot on track),
 * and distance maps to the circuit through a speed profile built from its curvature, so cars brake into
 * corners and accelerate out. Rendering reads that plan exactly each frame: no easing lag, no jumps.
 * Live 2-player: same seed = same circuit, grid, weather and incidents.
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var SIM_PER_SEC = 13;   // ~7 real seconds per lap at 1x
  var PIT_U = 0.014, LUT_N = 1600;
  var TYRES = {
    S: { name: "soft", delta: -1.2, deg: 0.11, cliff: 10, dry: true },
    M: { name: "medium", delta: -0.6, deg: 0.065, cliff: 18, dry: true },
    H: { name: "hard", delta: 0, deg: 0.035, cliff: 28, dry: true },
    I: { name: "inter", delta: 0, deg: 0.08, cliff: 15, dry: false },
    W: { name: "wet", delta: 0, deg: 0.05, cliff: 20, dry: false }
  };
  var WX = { dry: { S: 0, M: 0, H: 0, I: 4, W: 7 }, damp: { S: 5, M: 5, H: 5.5, I: 0, W: 2 }, wet: { S: 10, M: 10, H: 10.5, I: 3, W: 0 } };
  var TEAMS = [
    ["PHT", "Phthalo (you)", "#f4c95d"], ["RBY", "Ruby Racing", "#ff4d5e"], ["SKQ", "Sidekiq", "#c46ad8"], ["PGR", "Postgres GP", "#5b8def"],
    ["RDS", "Redis Rossa", "#e5383b"], ["DKR", "Docker Blue", "#4aa3f0"], ["RLS", "Rails Works", "#ff8a3d"], ["ELX", "Elixir", "#9b6bd6"],
    ["NGX", "Nginx Verde", "#3ad08f"], ["KFK", "Kafka Corse", "#9aa3ad"]
  ];
  var POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  // ten original circuits: laps, base lap, crash risk, how hard to pass, pit-lane loss, tyre wear, rain chance, safety-car chance
  var TRACKS = [
    { name: "Phthalo Ring", tag: "balanced classic", laps: 20, base: 90, risk: 1, pass: 0.6, pit: 21, wear: 1, rain: 0.35, sc: 0.45,
      d: "M70,212 C48,212 36,196 44,176 L86,92 C96,70 122,62 144,76 L196,112 C212,123 232,120 242,104 L270,58 C282,38 312,34 330,50 L366,84 C382,100 378,124 358,134 L268,176 C250,186 250,204 266,212 L314,226 C334,232 330,250 308,250 L92,250 C72,250 60,232 70,212 Z" },
    { name: "Neon Harbour Speedway", tag: "flat out, easy passing", laps: 22, base: 78, risk: 0.7, pass: 0.35, pit: 19, wear: 0.85, rain: 0.3, sc: 0.35,
      d: "M80,140 C80,70 150,50 210,50 C290,50 360,70 360,140 C360,210 290,240 210,240 C176,240 166,220 146,226 C110,236 80,210 80,140 Z" },
    { name: "Old Town Street Circuit", tag: "walls everywhere", laps: 18, base: 96, risk: 1.9, pass: 1.0, pit: 24, wear: 0.8, rain: 0.35, sc: 0.7,
      d: "M110,232 L72,232 Q60,232 60,220 L60,104 Q60,92 72,92 L128,92 Q140,92 140,80 L140,64 Q140,52 152,52 L288,52 Q300,52 300,64 L300,110 Q300,122 312,122 L348,122 Q360,122 360,134 L360,220 Q360,232 348,232 L264,232 Q252,232 252,220 L252,194 Q252,182 240,182 L184,182 Q172,182 172,194 L172,220 Q172,232 160,232 Z" },
    { name: "Mountain Pass", tag: "fast sweepers, mountain rain", laps: 18, base: 98, risk: 1.4, pass: 0.8, pit: 22, wear: 1.1, rain: 0.55, sc: 0.5,
      d: "M60,200 C40,140 80,60 140,70 C200,80 190,150 240,150 C290,150 280,60 330,60 C380,60 380,160 350,200 C320,240 250,250 200,230 C150,210 120,250 80,240 C65,236 64,215 60,200 Z" },
    { name: "Desert Night GP", tag: "abrasive, almost never rains", laps: 20, base: 88, risk: 1.1, pass: 0.5, pit: 21, wear: 1.35, rain: 0.05, sc: 0.4,
      d: "M50,150 C50,90 110,60 170,80 L230,100 C260,110 260,60 300,55 C350,50 370,90 350,120 L300,160 C280,175 300,200 330,200 C365,200 370,245 330,250 L120,250 C70,250 50,210 50,150 Z" },
    { name: "Kaido Figure-Eight", tag: "crossover, tyre-hungry", laps: 19, base: 92, risk: 1.2, pass: 0.7, pit: 22, wear: 1.15, rain: 0.45, sc: 0.45,
      d: "M60,150 C60,60 170,50 210,150 C250,250 360,240 360,150 C360,60 250,50 210,150 C170,250 60,240 60,150 Z" },
    { name: "Lakeside Park", tag: "flowing, showers likely", laps: 21, base: 84, risk: 0.9, pass: 0.45, pit: 20, wear: 1, rain: 0.6, sc: 0.35,
      d: "M70,180 C50,120 90,60 160,60 C220,60 230,110 280,100 C340,90 370,130 360,180 C350,230 290,250 220,240 C160,232 150,200 120,215 C95,228 78,205 70,180 Z" },
    { name: "Harbour Hairpins", tag: "slow hairpins, chaos", laps: 18, base: 100, risk: 1.6, pass: 0.9, pit: 23, wear: 0.9, rain: 0.4, sc: 0.65,
      d: "M60,230 L60,80 C60,50 100,50 100,80 L100,180 C100,200 130,200 130,180 L130,70 C130,45 170,45 175,70 L200,190 C205,210 235,210 240,190 L270,70 C276,45 320,45 330,70 L360,200 C366,240 340,250 310,250 L90,250 C70,250 60,245 60,230 Z" },
    { name: "Skyline Tri-Oval", tag: "slipstream, high wear", laps: 24, base: 72, risk: 0.8, pass: 0.3, pit: 18, wear: 1.2, rain: 0.2, sc: 0.4,
      d: "M70,200 C50,170 120,60 200,50 C280,40 370,160 350,200 C335,230 300,240 210,240 C120,240 85,225 70,200 Z" },
    { name: "Rainforest Circuit", tag: "monsoon season", laps: 20, base: 94, risk: 1.0, pass: 0.55, pit: 21, wear: 1.05, rain: 0.8, sc: 0.45,
      d: "M50,120 C50,70 90,50 140,55 L330,55 C370,55 375,100 345,115 L310,130 C295,138 305,150 320,152 C360,158 370,200 340,225 C310,250 250,245 220,225 C195,208 175,215 160,232 C140,255 90,255 70,235 C50,215 50,170 50,120 Z" }
  ];
  var SEASON = [0, 4, 2, 6, 3, 8, 1, 7, 5, 9];   // championship calendar
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  };
  function fmtGap(x) { return x < 60 ? "+" + x.toFixed(1) : "+" + Math.floor(x / 60) + ":" + ("0" + (x % 60).toFixed(1)).slice(-4); }
  function fmtLap(x) { var m = Math.floor(x / 60); return m + ":" + ("0" + (x - m * 60).toFixed(3)).slice(-6); }
  function champKey() { var A = window.SamukaAuth, u = A && A.user && A.user(); return "samuka-pw-champ-" + (u && u.id ? u.id : "anon"); }

  window.SamukaArcade.register("pitwall", {
    title: "pit-wall.rb",
    blurb: "Grand prix race strategy: quick race, grand prix or a 10-round championship.",
    mount: function (stage, api) {
      var race = api.mode === "race" && api.opts.race;
      var rng = api.rng, rnd = function (a, b) { return a + rng() * (b - a); };
      var track, LAPS, BASE, WEAR = 1, cars, me, simT, alive = false, paused = false, raf = 0, last = 0, speed = 1, events, cond, weather = "dry", sc = false, scLeft = 0;
      var log = [], fastest = { t: 999, car: null }, best = api.peekBest(), uiT = 0, wasWet = false, startPos = 6, plannedTyre = "M", lastPos = 0, lastLeaderLap = 0;
      var session = { kind: "quick", length: store.get("samuka-pw-length") === "sprint" ? "sprint" : "full", pick: 0, wx: "random" };
      var season = null;

      stage.innerHTML =
        '<div class="pw">' +
          '<div class="pw__main" data-arena>' +
            '<svg class="pw__track" viewBox="20 20 380 250" aria-label="Circuit map"><path class="pw__kerb" data-kerb/><path class="pw__road" data-road/><path class="pw__pitlane" data-pitlane/><path class="pw__line" data-path/>' +
              '<line class="pw__start" data-start/><g data-cars></g></svg>' +
            '<div class="pw__rain" aria-hidden="true"></div>' +
            '<div class="pw__wx" data-wx></div><p class="pw__trackname" data-trackname></p>' +
          '</div>' +
          '<ol class="pw__tower" data-tower aria-label="Timing tower"></ol>' +
          '<div class="pw__ctrl">' +
            '<div class="pw__row"><span class="pw__lbl">next tyre</span><div class="pw__tyres" role="radiogroup" aria-label="Next tyre">' +
              Object.keys(TYRES).map(function (k) { return '<button type="button" class="pw__tyre pw__tyre--' + k + '" data-tyre="' + k + '" aria-pressed="false" title="' + TYRES[k].name + '">' + k + "</button>"; }).join("") +
            '</div><button type="button" class="btn btn--primary pw__box" data-box>BOX THIS LAP</button></div>' +
            '<div class="pw__row"><span class="pw__lbl">driver</span><div class="pw__modes">' +
              '<button type="button" data-mode="save">save tyres</button><button type="button" data-mode="normal" class="is-on">normal</button><button type="button" data-mode="push">push</button>' +
            '</div><button type="button" class="pw__ers" data-ers title="ERS overtake boost: about 0.8 s this lap, costs a lap of tyre life (E)">⚡ ERS</button>' +
            '<span class="pw__risk" data-risk title="Incident risk this lap"></span><button type="button" class="pw__speed" data-speed title="Sim speed (Space)">1×</button></div>' +
            '<div class="pw__radio" data-radio aria-live="polite" tabindex="0" aria-label="Team radio, newest first"></div>' +
          "</div>" +
        "</div>";
      api.foot("<span><kbd>B</kbd> box · <kbd>S</kbd><kbd>M</kbd><kbd>H</kbd><kbd>I</kbd><kbd>W</kbd> next tyre · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> save / normal / push · <kbd>E</kbd> ERS boost · <kbd>Space</kbd> sim speed · <kbd>P</kbd> pause. Dry race? Use two dry compounds or take +10 s.</span>");
      var $ = function (sel) { return stage.querySelector(sel); };
      var path = $("[data-path]"), carsG = $("[data-cars]"), arena = $("[data-arena]"), tower = $("[data-tower]");
      var GX, GY, GH, INV, plen = 1;

      /* ---------- circuit geometry: positions, headings and a curvature speed profile ---------- */
      function setTrack(t) {
        track = t;
        ["[data-kerb]", "[data-road]", "[data-path]"].forEach(function (s) { $(s).setAttribute("d", t.d); });
        plen = path.getTotalLength();
        var N = LUT_N, i, ds = plen / N;
        GX = new Float32Array(N + 1); GY = new Float32Array(N + 1); GH = new Float32Array(N + 1);
        for (i = 0; i < N; i++) { var p = path.getPointAtLength(i * ds); GX[i] = p.x; GY[i] = p.y; }
        GX[N] = GX[0]; GY[N] = GY[0];
        var w = Math.max(2, Math.round(3 / ds));
        for (i = 0; i < N; i++) { var a = (i - w + N) % N, b = (i + w) % N; GH[i] = Math.atan2(GY[b] - GY[a], GX[b] - GX[a]); }
        GH[N] = GH[0];
        // curvature → target speed (1 = straight, ~0.36 = hairpin)
        var V = new Float32Array(N), kw = Math.max(2, Math.round(9 / ds));
        for (i = 0; i < N; i++) {
          var dh = GH[(i + kw) % N] - GH[(i - kw + N) % N]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          V[i] = Math.max(0.36, 1 / (1 + 20 * Math.abs(dh) / (2 * kw * ds)));
        }
        // limit acceleration and braking (two passes so the start/finish wrap is right)
        var acc = 0.0065 * ds, brk = 0.013 * ds, pass;
        for (pass = 0; pass < 2; pass++) for (i = 0; i < N; i++) { var pv = V[(i - 1 + N) % N] + acc; if (V[i] > pv) V[i] = pv; }
        for (pass = 0; pass < 2; pass++) for (i = N - 1; i >= 0; i--) { var nv = V[(i + 1) % N] + brk; if (V[i] > nv) V[i] = nv; }
        // time along the lap, then its inverse: lap-time fraction → distance fraction
        var T = new Float64Array(N + 1);
        for (i = 0; i < N; i++) T[i + 1] = T[i] + ds / ((V[i] + V[(i + 1) % N]) / 2);
        var tot = T[N], j = 0;
        INV = new Float32Array(N + 1);
        for (i = 0; i <= N; i++) {
          var u = i / N * tot;
          while (j < N - 1 && T[j + 1] < u) j++;
          var seg = T[j + 1] - T[j];
          INV[i] = (j + (seg > 0 ? Math.min(1, (u - T[j]) / seg) : 0)) / N;
        }
        INV[N] = 1;
        // start line + pit lane drawn beside the main straight
        var p0 = posAt(0), ang = p0.h + Math.PI / 2, st = $("[data-start]");
        st.setAttribute("x1", (p0.x + Math.cos(ang) * 9).toFixed(1)); st.setAttribute("y1", (p0.y + Math.sin(ang) * 9).toFixed(1));
        st.setAttribute("x2", (p0.x - Math.cos(ang) * 9).toFixed(1)); st.setAttribute("y2", (p0.y - Math.sin(ang) * 9).toFixed(1));
        var pl = [], s0 = spaceAt(0.975) - 1, s1 = spaceAt(PIT_U + 0.03);
        for (var k = 0; k <= 24; k++) { var q = posAt(s0 + (s1 - s0) * k / 24), off = 11 * Math.min(1, Math.min(k, 24 - k) / 5); pl.push((q.x - Math.sin(q.h) * off).toFixed(1) + "," + (q.y + Math.cos(q.h) * off).toFixed(1)); }
        $("[data-pitlane]").setAttribute("d", "M" + pl.join(" L"));
        $("[data-trackname]").textContent = t.name + " · " + LAPS + " laps";
      }
      function spaceAt(u) { u = ((u % 1) + 1) % 1; var f = u * LUT_N, i = f | 0, t = f - i; return INV[i] + (INV[i + 1] - INV[i]) * t; }
      function posAt(s) {
        s = ((s % 1) + 1) % 1;
        var f = s * LUT_N, i = f | 0, t = f - i, dh = GH[i + 1] - GH[i];
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        return { x: GX[i] + (GX[i + 1] - GX[i]) * t, y: GY[i] + (GY[i + 1] - GY[i]) * t, h: GH[i] + dh * t };
      }

      /* ---------- radio: newest on top, scrollable history ---------- */
      function radio(msg, cls) {
        var lap = me && LAPS ? Math.min(LAPS, me.lap + 1) : 0;
        log.unshift('<p class="pw__msg' + (cls ? " pw__msg--" + cls : "") + '"><span>L' + lap + "</span>" + msg + "</p>");
        if (log.length > 60) log.pop();
        var box = $("[data-radio]"); box.innerHTML = log.join(""); box.scrollTop = 0;
      }
      function pop(text, cls) { api.toast(text, cls); }
      function shake() { arena.classList.remove("is-shake"); void arena.offsetWidth; arena.classList.add("is-shake"); }

      /* ---------- race setup ---------- */
      function cliffOf(k) { return Math.max(4, Math.round(TYRES[k].cliff / WEAR)); }
      function pickCond(t, want) {
        if (want === "dry") return "dry";
        if (want === "wet") { var w = rng(); return w < 0.4 ? "wet start" : w < 0.7 ? "storm" : "mixed"; }
        if (rng() > t.rain) return "dry";
        var q = rng(); return q < 0.45 ? "mixed" : q < 0.75 ? "wet start" : "storm";
      }
      function setup(t, opts) {
        opts = opts || {};
        var sprint = opts.length === "sprint";
        LAPS = sprint ? Math.max(9, Math.round(t.laps * 0.5)) : t.laps; BASE = t.base;
        WEAR = t.wear * (sprint ? 1.8 : 1);
        setTrack(t);
        cond = pickCond(t, opts.wx);
        var paces = opts.paces || {};
        cars = TEAMS.map(function (tm, i) {
          var pace = i === 0 ? 0.25 : paces[tm[0]] != null ? paces[tm[0]] + rnd(-0.25, 0.25) : rnd(-0.6, 1.2);
          return { i: i, code: tm[0], name: tm[1], color: tm[2], pace: pace, tyre: "M", age: 0, stops: 0, used: {}, lap: 0,
            lapStart: 0, lapTime: BASE, total: 0, pitNext: false, nextTyre: null, mode: "normal", finished: false, out: false, best: 999,
            pitLossNow: 0, stopLap: 0, holds: [], evts: [], plan: [0, 0, BASE, 1], limpU: null, limpX: 0, dirty: false, ers: sprint ? 2 : 3, ersWear: 0 };
        });
        var order;
        if (opts.qualify) {   // grid from a qualifying lap: pace plus a bit of luck
          order = cars.slice().map(function (c) { return { c: c, q: c.pace + rnd(-0.55, 0.55) }; }).sort(function (a, b) { return a.q - b.q; }).map(function (x) { return x.c; });
          startPos = order.indexOf(cars[0]) + 1;
        } else {
          order = cars.slice(1).sort(function () { return rng() - 0.5; });
          startPos = 4 + Math.floor(rng() * 5);
          order.splice(startPos - 1, 0, cars[0]);
        }
        // weather plan for this race (scaled to the race distance)
        events = { rainAt: 99, rainLen: 0, heavy: false, scAt: rng() < t.sc ? 3 + Math.floor(rng() * Math.max(1, LAPS - 6)) : 99 };
        if (cond === "mixed") { events.rainAt = Math.floor(LAPS * (0.2 + rng() * 0.4)); events.rainLen = Math.max(3, Math.floor(LAPS * (0.2 + rng() * 0.25))); }
        if (cond === "storm") { events.rainAt = Math.max(2, Math.floor(LAPS * (0.15 + rng() * 0.25))); events.rainLen = Math.max(4, Math.floor(LAPS * (0.3 + rng() * 0.2))); events.heavy = true; }
        if (cond === "wet start") { events.rainAt = 0; events.rainLen = Math.max(3, Math.floor(LAPS * (0.25 + rng() * 0.25))); events.heavy = rng() < 0.4; }
        weather = wxAt(0);
        order.forEach(function (c, gi) {
          // the back of the grid crosses the line later and starts a little behind it
          c.grid = gi; c.gridU = -gi * 0.007; c.lapStart = gi * 0.35; c.total = c.lapStart;
          if (c.i) {
            c.tyre = weather === "dry" ? (gi < 4 ? (rng() < 0.6 ? "S" : "M") : pickAI(["M", "H", "S"])) : weather === "wet" && rng() < 0.6 ? "W" : "I";
            c.stopLap = planStop(c.tyre);
          }
          c.used[c.tyre] = 1;
          c.plan = [0, 0, BASE, 1];
        });
        me = cars[0];
        simT = 0; sc = false; scLeft = 0; fastest = { t: 999, car: null }; log = []; wasWet = weather !== "dry"; lastLeaderLap = 0;
        arena.setAttribute("data-weather", weather);
      }
      function pickAI(arr) { return arr[Math.floor(rng() * arr.length)]; }
      function planStop(tyre) { return Math.max(3, Math.min(LAPS - 2, Math.round(cliffOf(tyre) - 2 + rnd(-2, 2)))); }
      function wxAt(lap) {
        if (lap >= events.rainAt && lap < events.rainAt + events.rainLen) {
          if (events.heavy && lap >= events.rainAt + 1 && lap < events.rainAt + events.rainLen - 1) return "wet";
          return "damp";
        }
        return "dry";
      }

      /* ---------- lap time + risk model ---------- */
      function lapTime(c, extra) {
        if (sc) return BASE + 14 + rnd(-0.2, 0.2) + (extra || 0);
        var ty = TYRES[c.tyre], t = BASE + c.pace + ty.delta, cliff = cliffOf(c.tyre);
        var degMul = c.mode === "push" ? 1.6 : c.mode === "save" ? 0.55 : 1;
        if (!ty.dry && weather === "dry") degMul *= 4;
        t += ty.deg * WEAR * c.age * degMul;
        if (c.age > cliff) t += (c.age - cliff) * 1.5;
        t += WX[weather][c.tyre];
        t += 0.06 * (LAPS - c.lap);
        t += c.mode === "push" ? -0.45 : c.mode === "save" ? 0.45 : 0;
        t += rnd(-0.25, 0.25);
        return t + (extra || 0);
      }
      function risk(c) {
        if (sc) return 0.001;
        var ty = TYRES[c.tyre], r = 0.0075 * track.risk;
        r *= c.mode === "push" ? 2.4 : c.mode === "save" ? 0.5 : 1;
        if (c.age > cliffOf(c.tyre)) r += 0.03;
        if (ty.dry && weather === "damp") r *= 5; else if (ty.dry && weather === "wet") r *= 9; else if (weather === "wet" && c.tyre === "I") r *= 1.8;
        return Math.min(0.35, r);
      }

      /* ---------- the lap plan: piecewise time → lap-fraction, with stops (pit, spin) and limping ---------- */
      function replan(c, e0, u0) {
        var holds = c.holds.filter(function (h) { return h.u >= u0; }).sort(function (a, b) { return a.u - b.u; });
        var holdSum = holds.reduce(function (s, h) { return s + h.d; }, 0);
        var limpU = c.limpU != null && c.limpU >= u0 ? c.limpU : null, limpX = limpU != null ? c.limpX : 0;
        var k = Math.max(0.3, c.lapTime - e0 - holdSum - limpX) / Math.max(1e-6, 1 - u0);
        var lr = limpU != null ? limpX / Math.max(1e-6, 1 - limpU) : 0, limping = false;
        var marks = holds.map(function (h) { return { u: h.u, d: h.d }; });
        if (limpU != null) marks.push({ u: limpU, limp: true });
        marks.sort(function (a, b) { return a.u - b.u; });
        marks.push({ u: 1 });
        var pts = [e0, u0], t = e0, u = u0;
        marks.forEach(function (m) {
          t += (m.u - u) * (k + (limping ? lr : 0)); u = m.u; pts.push(t, u);
          if (m.d) { t += m.d; pts.push(t, u); }
          if (m.limp) limping = true;
        });
        c.plan = pts;
      }
      function lapU(c) {   // fraction of the current lap covered right now
        var e = simT - c.lapStart, p = c.plan;
        if (e <= p[0]) return p[1];
        for (var i = 0; i + 2 < p.length; i += 2) {
          if (e < p[i + 2]) { var dt = p[i + 2] - p[i]; return dt > 0 ? p[i + 1] + (p[i + 3] - p[i + 1]) * (e - p[i]) / dt : p[i + 3]; }
        }
        return 0.9999;
      }
      function progress(c) { return c.finished ? 1 : c.out ? c.outU : Math.max(0, Math.min(0.9999, lapU(c))); }
      function addEvt(c, u, fn) { c.evts.push({ u: u, fn: fn }); c.evts.sort(function (a, b) { return a.u - b.u; }); }

      /* ---------- AI strategy ---------- */
      function aiDecide(c) {
        if (c.i === 0 || c.pitNext || c.out) return;
        var wet = weather !== "dry";
        if (wet && TYRES[c.tyre].dry && rng() < 0.55) { c.pitNext = true; c.nextTyre = weather === "wet" && rng() < 0.5 ? "W" : "I"; return; }
        if (weather === "wet" && c.tyre === "I" && rng() < 0.3) { c.pitNext = true; c.nextTyre = "W"; return; }
        if (!wet && !TYRES[c.tyre].dry && rng() < 0.6) { c.pitNext = true; c.nextTyre = LAPS - c.lap > 10 ? "M" : "S"; return; }
        if (sc && c.age > cliffOf(c.tyre) * 0.4 && LAPS - c.lap > 3 && rng() < 0.6) { c.pitNext = true; c.nextTyre = wet ? c.tyre : LAPS - c.lap > 12 ? "H" : "M"; return; }
        var dryUsed = Object.keys(c.used).filter(function (k) { return TYRES[k].dry; }).length;
        if (!wasWet && dryUsed < 2 && LAPS - c.lap <= 3) { c.pitNext = true; c.nextTyre = c.tyre === "S" ? "M" : "S"; return; }
        if (!wet && c.lap + 1 >= c.stopLap && LAPS - c.lap > 2) {
          var left = LAPS - c.lap;
          c.pitNext = true; c.nextTyre = left > cliffOf("M") ? "H" : left > cliffOf("S") ? (c.tyre === "M" ? "H" : "M") : (c.tyre === "S" ? "M" : "S");
        }
        // AI mode: push at the end, save on old tyres
        c.mode = c.age > cliffOf(c.tyre) - 3 ? "save" : LAPS - c.lap < 4 ? "push" : "normal";
      }

      /* ---------- simulation ---------- */
      function order() {
        return cars.slice().sort(function (a, b) {
          if (a.out !== b.out) return a.out ? 1 : -1;
          if (a.out && b.out) return b.outLap + b.outU - a.outLap - a.outU;
          if (a.finished !== b.finished) return a.finished ? -1 : 1;
          if (a.finished && b.finished) return a.finishT - b.finishT;
          if (a.lap !== b.lap) return b.lap - a.lap;
          return progress(b) - progress(a) || a.grid - b.grid;
        });
      }
      // an incident somewhere ahead on this lap; it happens when the car gets there
      function incident(c, e0, u0) {
        var roll = rng(), you = c.i === 0, at = Math.min(0.95, u0 + (1 - u0) * rnd(0.1, 0.85));
        if (roll < 0.62) {
          var lost = rnd(4, 9);
          c.lapTime += lost; c.holds.push({ u: at, d: lost, kind: "spin" }); c.dirty = true;
          addEvt(c, at, function () {
            c.spinT = simT; c.spinD = lost; c.age += 3;
            if (you) { radio("SPIN! We lost " + lost.toFixed(1) + " s and flat-spotted the tyres.", "err"); pop("💫 spin · -" + lost.toFixed(1) + " s", "err"); shake(); }
            else radio(c.code + " spins! Opportunity.", "warn");
          });
        } else if (roll < 0.88) {
          c.limpU = at; c.limpX = 30 * (1 - at); c.lapTime += c.limpX; c.dirty = true;
          addEvt(c, at, function () {
            c.pitNext = true; c.nextTyre = c.nextTyre || (TYRES[c.tyre].dry && weather === "dry" ? (c.tyre === "S" ? "M" : "S") : c.tyre);
            if (you) { plannedTyre = c.nextTyre; radio("PUNCTURE! Limping back, we're boxing this lap.", "err"); pop("💥 puncture", "err"); shake(); syncControls(); }
            else radio(c.code + " has a puncture.", "warn");
          });
        } else {
          addEvt(c, at, function () {
            c.out = true; c.outLap = c.lap; c.outU = at; c.finished = false;
            if (you) { radio("CRASH! The car is in the wall. We're out.", "err"); pop("💥 crash: DNF", "err"); shake(); syncControls(); }
            else radio(c.code + " has crashed out!", "warn");
            if (!sc) { sc = true; scLeft = 3; radio("SAFETY CAR after the crash. Cheap pit stops!", "warn"); pop("🚨 safety car", "warn"); }
          });
        }
        replan(c, e0, u0);
      }
      function fireEvts(c) {
        if (!c.evts.length) return;
        var u = lapU(c);
        while (c.evts.length && !c.out && c.evts[0].u <= u) c.evts.shift().fn();
      }
      function completeLap(c) {
        while (c.evts.length && !c.out) c.evts.shift().fn();   // anything due on this lap has happened
        if (c.out) return;
        var lt = c.lapTime;
        c.lap++; c.total = c.lapStart + lt; c.age += 1 + c.ersWear; c.ersWear = 0;
        if (!sc && !c.dirty && lt < c.best) c.best = lt;
        if (!sc && !c.dirty && lt < fastest.t) { fastest = { t: lt, car: c }; if (c.i === 0 && c.lap > 2) { radio("Purple sector! Fastest lap: " + fmtLap(lt) + ".", "ok"); pop("⚡ fastest lap", "ok"); } }
        c.lapStart = c.total; c.pitLossNow = 0; c.holds = []; c.evts = []; c.limpU = null; c.limpX = 0; c.dirty = false;
        if (c.lap >= LAPS) { c.finished = true; c.finishT = c.total; return; }
        aiDecide(c);
        var extra = 0;
        if (c.pitNext) {
          var loss = sc ? Math.round(track.pit / 2) : track.pit;
          extra = loss; c.pitLossNow = loss; c.dirty = true;
          c.holds.push({ u: PIT_U, d: loss, kind: "pit" });
          c.tyre = c.nextTyre || c.tyre; c.age = 0; c.stops++; c.used[c.tyre] = 1; c.pitNext = false; c.nextTyre = null;
          if (c.i === 0) { radio("Box box, done. " + TYRES[c.tyre].name + "s on, " + (sc ? "cheap stop under the safety car." : loss + " s in the pit lane."), "ok"); syncControls(); }
          else c.stopLap = c.lap + planStop(c.tyre);
        }
        c.lapTime = lapTime(c, extra);
        // dirty air / defending: harder to pass on tight tracks; AI deploys ERS to attack
        var o = order(), ahead = o[o.indexOf(c) - 1];
        var close = ahead && !ahead.finished && !ahead.out && Math.abs(c.lapStart - ahead.lapStart) < 1.0;
        if (close && c.lapTime > ahead.lapTime - track.pass) c.lapTime += 0.3;
        if (c.i && close && c.ers > 0 && !sc && rng() < 0.35) { c.ers--; c.lapTime -= 0.8; c.ersWear = 1; }
        if (sc) c.dirty = true;
        replan(c, 0, 0);
        var battle = ahead && !ahead.finished && !ahead.out && Math.abs(c.lapStart - ahead.lapStart) < 0.6 ? 0.012 * track.risk : 0;   // wheel-to-wheel
        if (rng() < risk(c) + battle) incident(c, 0, 0);
      }
      function worldLap() {
        var lap = order()[0].lap, wx = wxAt(lap);
        if (wx !== weather) {
          var prev = weather; weather = wx; if (wx !== "dry") wasWet = true;
          arena.setAttribute("data-weather", wx);
          radio(wx === "dry" ? "Track is drying. Slicks are the call when you're ready." : wx === "wet" ? "Heavy rain! Full wets are fastest now." : prev === "dry" ? "Rain! Track is damp: inters are the tyre." : "Rain easing, still damp.", "warn");
          pop(wx === "dry" ? "☀ drying" : wx === "wet" ? "🌧 heavy rain" : "🌦 rain", "warn");
        }
        if (!sc && lap === events.scAt) { sc = true; scLeft = 3; events.scAt = 99; radio("SAFETY CAR deployed. Pit stops are cheap right now.", "warn"); pop("🚨 safety car", "warn"); }
        else if (sc && --scLeft <= 0) { sc = false; radio("Safety car in this lap. Green flag!", "ok"); pop("🟢 green flag", "ok"); }
        if (events.rainAt > lap && events.rainAt - lap <= 3 && events.rainAt < 99) radio("Rain on the radar, about " + (events.rainAt - lap) + " lap" + (events.rainAt - lap > 1 ? "s" : "") + " away.", "warn");
      }
      function step(dt) {
        simT += dt;
        cars.forEach(function (c) {
          if (c.finished || c.out) return;
          fireEvts(c);
          while (!c.finished && !c.out && simT >= c.lapStart + c.lapTime) completeLap(c);
        });
        var ll = order()[0].lap;
        if (ll !== lastLeaderLap) { lastLeaderLap = ll; worldLap(); engineer(); }
        if (cars.every(function (c) { return c.finished || c.out; })) over();
      }
      function engineer() {
        if (me.finished || me.out) return;
        var o = order(), p = o.indexOf(me), ahead = o[p - 1], ty = TYRES[me.tyre], cliff = cliffOf(me.tyre);
        if (me.age === cliff - 2) radio("Tyres are going off soon: about 2 laps left on these " + ty.name + "s.", "warn");
        else if (me.age > cliff && (me.age - cliff) % 3 === 1) radio("We're on the cliff! Losing " + ((me.age - cliff) * 1.5).toFixed(1) + " s a lap. Box?", "err");
        else if (TYRES[me.tyre].dry && weather !== "dry") radio("Slicks in the wet: we're sliding everywhere. Box for inters?", "err");
        else if (ahead && me.lap % 3 === 0) radio("P" + (p + 1) + ". Gap to " + ahead.code + " " + Math.max(0, me.lapStart - ahead.lapStart).toFixed(1) + " s." + (me.ers && me.lapStart - ahead.lapStart < 1.2 ? " ERS is available." : ""));
      }

      /* ---------- rendering: exact positions from the plan; only the side offsets are eased ---------- */
      var dots = {}, scDot = null;
      function carShape(c) {
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "pw__car" + (c.i === 0 ? " pw__car--me" : ""));
        g.innerHTML = '<g class="pw__body"><path d="M7,0 L-5,-4.2 L-3,0 L-5,4.2 Z" fill="' + c.color + '"/></g>' + (c.i === 0 ? '<text y="-9" text-anchor="middle">YOU</text>' : "");
        carsG.appendChild(g);
        return { g: g, body: g.firstChild, lat: 0, tx: "", rx: "" };
      }
      function displayS(c) {
        if (c.out) return spaceAt(c.outU);
        if (c.finished) return spaceAt(Math.min(0.3, (simT - c.finishT) / (BASE * 1.8)));   // cool-down lap, no pile-up on the line
        var u = progress(c);
        return spaceAt(c.lap === 0 ? c.gridU + (1 - c.gridU) * u : u);
      }
      function drawCars(dt) {
        if (!GX) return;
        var o = order(), ease = 1 - Math.exp(-dt * 7), list = [];
        cars.forEach(function (c) { var v = dots[c.code] || (dots[c.code] = carShape(c)); v.s = displayS(c); v.c = c; list.push(v); });
        // cars side by side: give close pairs their own line
        var run = list.filter(function (v) { return !v.c.out && !v.c.finished; }).sort(function (a, b) { return a.s - b.s; });
        run.forEach(function (v) { v.lane = 0; });
        for (var k = 1; k < run.length; k++) {
          var gap = run[k].s - run[k - 1].s;
          if (gap < 0.007) { var a = run[k - 1], b = run[k]; if (!a.lane) a.lane = o.indexOf(a.c) % 2 ? 3.2 : -3.2; b.lane = -a.lane; }
        }
        list.forEach(function (v) {
          var c = v.c, u = progress(c);
          var inPit = !c.out && !c.finished && ((c.pitLossNow && u < PIT_U + 0.03) || (c.pitNext && u > 0.975));
          var target = c.out ? 12 : inPit ? 11 : c.finished ? 0 : v.lane || 0;
          v.lat += (target - v.lat) * ease;
          var p = posAt(v.s), h = p.h, deg = h * 180 / Math.PI;
          if (c.spinT != null) { var sp = (simT - c.spinT) / c.spinD; if (sp < 1) deg += 540 * (1 - Math.pow(1 - sp, 3)); else c.spinT = null; }
          var x = p.x - Math.sin(h) * v.lat, y = p.y + Math.cos(h) * v.lat;
          var tx = "translate(" + x.toFixed(2) + "," + y.toFixed(2) + ")", rx = "rotate(" + deg.toFixed(1) + ")";
          if (tx !== v.tx) { v.g.setAttribute("transform", tx); v.tx = tx; }
          if (rx !== v.rx) { v.body.setAttribute("transform", rx); v.rx = rx; }
          var pitNow = c.pitLossNow && u <= PIT_U + 1e-6 && simT - c.lapStart > 0.05;
          if (v.pit !== !!pitNow) { v.pit = !!pitNow; v.g.classList.toggle("is-pit", v.pit); }
          if (v.out !== !!c.out) { v.out = !!c.out; v.g.classList.toggle("is-out", v.out); }
        });
        if (me && dots[me.code] && carsG.lastChild !== dots[me.code].g) carsG.appendChild(dots[me.code].g);
        // safety car leads the pack
        var lead = o[0];
        if (sc && lead && !lead.finished && !lead.out) {
          if (!scDot) { scDot = document.createElementNS("http://www.w3.org/2000/svg", "g"); scDot.setAttribute("class", "pw__sccar"); scDot.innerHTML = '<rect x="-6" y="-3.5" width="12" height="7" rx="2"/><text y="-7" text-anchor="middle">SC</text>'; carsG.appendChild(scDot); }
          var q = posAt(dots[lead.code].s + 0.014);
          scDot.setAttribute("transform", "translate(" + q.x.toFixed(2) + "," + q.y.toFixed(2) + ")");
          scDot.style.display = "";
        } else if (scDot) scDot.style.display = "none";
      }
      function riskLabel(r) { return r < 0.009 ? ["low", 1] : r < 0.035 ? ["medium", 2] : ["HIGH", 3]; }
      var rows = {}, rowH = 0;
      function drawTower() {
        var o = order(), lead = o[0];
        o.forEach(function (c, k) {
          var gap;
          if (c.out) gap = '<em class="err">OUT</em>';
          else if (k === 0) gap = c.finished ? "FIN" : "L" + Math.min(LAPS, c.lap + 1) + "/" + LAPS;
          else if (!c.finished && lead.lap - c.lap >= 1 && progress(c) < progress(lead)) gap = "+" + (lead.lap - c.lap) + " lap";
          else gap = fmtGap(Math.max(0, (c.finished ? c.finishT : c.lapStart) - (lead.finished ? lead.finishT : lead.lapStart)));
          var pit = c.pitLossNow && progress(c) < PIT_U + 0.03 && !c.finished;
          var html = "<b>" + (k + 1) + '</b><i style="background:' + c.color + '"></i><span class="pw__code">' + c.code + '</span><span class="pw__gap">' + (pit ? "<em>PIT</em>" : gap) + '</span><span class="pw__ty pw__ty--' + c.tyre + '">' + c.tyre + '</span><span class="pw__age">' + c.age + "</span>";
          var li = rows[c.code];
          if (!li) { li = rows[c.code] = document.createElement("li"); tower.appendChild(li); }
          if (li.__h !== html) { li.innerHTML = html; li.__h = html; }
          var cls = (c.i === 0 ? "is-me" : "") + (c.out ? " is-out" : "") + (k % 2 ? "" : " is-odd");
          if (li.className !== cls) li.className = cls;
          if (!rowH && li.offsetHeight) rowH = li.offsetHeight + 2;
          var tf = "translateY(" + k * (rowH || 28) + "px)";
          if (li.style.transform !== tf) li.style.transform = tf;   // rows glide to their new place
        });
        tower.style.height = ((rowH || 28) * o.length + 12) + "px";
        var lap = Math.min(LAPS, o[0].lap + 1), fc = [], icon = { dry: "☀", damp: "🌦", wet: "🌧" };
        for (var k = 0; k < 4; k++) fc.push(wxAt(o[0].lap + k));
        $("[data-wx]").innerHTML = '<span>LAP <b>' + lap + "/" + LAPS + "</b></span>" + (sc ? '<span class="pw__sc">SAFETY CAR</span>' : "") +
          '<span class="pw__fc" title="forecast: now, +1, +2, +3 laps">' + fc.map(function (w) { return icon[w]; }).join(" ") + "</span>" +
          '<span>you <b>' + TYRES[me.tyre].name + "</b> · " + me.age + "/" + cliffOf(me.tyre) + " laps" + (me.pitNext ? ' · <b class="ok">boxing → ' + (me.nextTyre || plannedTyre) + "</b>" : "") + "</span>";
        var rl = riskLabel(risk(me)), rEl = $("[data-risk]");
        rEl.className = "pw__risk pw__risk--" + rl[1]; rEl.innerHTML = "risk " + "●".repeat(rl[1]) + "○".repeat(3 - rl[1]) + " <b>" + rl[0] + "</b>";
        var p = o.indexOf(me);
        if (lastPos && p !== lastPos && !me.out && !me.finished) pop(p < lastPos ? "▲ P" + (p + 1) + " (+" + (lastPos - p) + ")" : "▼ P" + (p + 1), p < lastPos ? "ok" : "warn");
        lastPos = p;
        api.hud("<span>P<b>" + (p + 1) + "</b></span><span>lap <b>" + lap + "/" + LAPS + "</b></span><span>stops <b>" + me.stops + '</b></span><span class="hide-sm">' + (season ? "round <b>" + (season.round + 1) + "/10</b>" : "best <b>" + best + "</b>") + "</span>");
        if (race) race.tick(projected(p), lap, 0);
      }
      function projected(p) { return me.out ? 0 : (POINTS[p] || 0) * 100 + Math.max(0, startPos - 1 - p) * 60; }
      function syncControls() {
        stage.querySelectorAll("[data-tyre]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tyre") === plannedTyre)); });
        var box = $("[data-box]"); box.classList.toggle("is-armed", !!(me && me.pitNext)); box.textContent = me && me.pitNext ? "BOXING → " + plannedTyre + " (cancel)" : "BOX THIS LAP";
        stage.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.toggle("is-on", me && b.getAttribute("data-mode") === me.mode); });
        var ers = $("[data-ers]"); ers.textContent = "⚡ ERS ×" + (me ? me.ers : 0); ers.disabled = !me || !me.ers || me.out || me.finished;
        $("[data-speed]").textContent = speed + "×";
      }

      /* ---------- loop ---------- */
      function frame(ts) {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        var dt = Math.min(0.05, Math.max(0, (ts - last) / 1000)); last = ts;
        if (!paused) step(dt * SIM_PER_SEC * speed);
        if (!alive) return;
        drawCars(dt);
        uiT += dt; if (uiT > 0.25) { uiT = 0; drawTower(); }
      }

      /* ---------- player actions ---------- */
      function setTyre(k) { plannedTyre = k; if (me.pitNext) me.nextTyre = k; syncControls(); }
      function toggleBox() {
        if (!alive || me.finished || me.out) return;
        me.pitNext = !me.pitNext; me.nextTyre = me.pitNext ? plannedTyre : null;
        radio(me.pitNext ? "Copy, box this lap for " + TYRES[plannedTyre].name + "s." : "Stay out, stay out.", me.pitNext ? "ok" : "");
        syncControls(); drawTower();
      }
      function setMode(m) {
        if (!me || me.out) return;
        me.mode = m; radio(m === "push" ? "Push now, push! Tyres will suffer and the risk goes up." : m === "save" ? "Lift and coast, look after the tyres." : "Normal mode.");
        syncControls(); drawTower();
      }
      // ERS overtake boost: instant, limited, costs tyre life and a little risk
      function deployErs() {
        if (!alive || paused || !me.ers || me.out || me.finished) return;
        if (sc) { radio("Not under the safety car. Save it for the restart.", "warn"); return; }
        if (me.limpU != null) { radio("No boost on a puncture, just bring it home.", "warn"); return; }
        var u = lapU(me), e = simT - me.lapStart;
        if (u > 0.85) { radio("Too late in the lap for ERS. Try it on the straight.", "warn"); return; }
        me.ers--; me.lapTime -= 0.8; me.ersWear = 1; me.dirty = true;
        replan(me, e, u);
        radio("ERS deployed! Overtake mode. " + me.ers + " left.", "ok"); pop("⚡ ERS boost", "ok");
        if (rng() < risk(me) * 0.6) incident(me, e, u);
        syncControls();
      }

      /* ---------- screens ---------- */
      function start(tyre) {
        me.tyre = tyre; me.used = {}; me.used[tyre] = 1;
        cars.forEach(function (c) { c.lapTime = lapTime(c, 0); replan(c, 0, 0); });
        plannedTyre = weather !== "dry" ? (tyre === "I" ? "M" : "I") : tyre === "S" ? "M" : tyre === "M" ? "H" : "M";
        alive = true; paused = false; last = 0; speed = 1; lastPos = 0;
        api.clearOverlay();
        radio("Lights out and away we go! P" + startPos + " on " + TYRES[tyre].name + "s. " + track.name + ", " + cond + ".", "ok");
        syncControls(); drawCars(0); drawTower();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      }
      function over() {
        alive = false; cancelAnimationFrame(raf);
        var dryUsed = Object.keys(me.used).filter(function (k) { return TYRES[k].dry; }).length, penalty = !wasWet && dryUsed < 2 && !me.out;
        if (penalty) me.finishT += 10;
        var res = cars.filter(function (c) { return !c.out; }).sort(function (a, b) { return a.finishT - b.finishT; }).concat(cars.filter(function (c) { return c.out; }));
        var p = res.indexOf(me);
        var score = me.out ? 0 : (POINTS[p] || 0) * 100 + Math.max(0, startPos - 1 - p) * 60 + (fastest.car === me ? 200 : 0);
        var b = api.best(score, { position: p + 1, rain: wasWet });
        best = b.best;
        if (p === 0 && !me.out) api.emit("win");
        if (p < 3 && wasWet && !me.out) api.emit("rain_podium");
        var table = res.map(function (c, k) {
          return '<li class="' + (c === me ? "is-me" : "") + '"><b>' + (c.out ? "–" : k + 1) + '</b><i style="background:' + c.color + '"></i>' + esc(c.name) + "<span>" + (c.out ? "DNF" : k === 0 ? fmtLap(c.finishT / LAPS) + " avg" : fmtGap(c.finishT - res[0].finishT)) + "</span></li>";
        }).join("");
        var head = '<p class="arcade__kicker">$ chequered flag · ' + esc(track.name) + " · " + esc(cond) + (season ? " · round " + (season.round + 1) + "/10" : "") + "</p><h3>" + (me.out ? "DNF. Into the wall. 💥" : p === 0 ? "P1. What a call! 🏆" : p < 3 ? "P" + (p + 1) + ". Podium!" : "P" + (p + 1)) + "</h3>" +
          (penalty ? '<p class="err">+10 s penalty: only one dry compound used.</p>' : "") +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>started</dt><dd>P" + startPos + "</dd><dt>stops</dt><dd>" + me.stops + "</dd><dt>fastest lap</dt><dd>" + (fastest.car ? esc(fastest.car.code) + " " + fmtLap(fastest.t) : "-") + "</dd></dl>";
        if (race) {
          race.over(score, p + 1);
          api.overlay(head + '<ol class="pw__results">' + table + '</ol><div class="race-result" data-race-result><p class="muted">waiting for the other strategist…</p></div>');
          return;
        }
        if (season) return api.overlay(head + champAfter(res));
        api.overlay(head + '<ol class="pw__results">' + table + "</ol>" + '<div class="lb-mini" data-lb-mini="pitwall"></div>' +
          '<div class="pw__menu-row"><button class="btn btn--primary" type="button" data-pw-again>↻ race again</button><button class="btn" type="button" data-pw-menu>☰ menu</button></div>');
      }

      /* ---------- championship ---------- */
      function loadSeason() { try { var s = JSON.parse(store.get(champKey()) || "null"); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
      function saveSeason(s) { store.set(champKey(), s ? JSON.stringify(s) : null); }
      function newSeason() {
        var paces = {};
        TEAMS.forEach(function (tm, i) { if (i) paces[tm[0]] = Math.round((Math.random() * 1.8 - 0.6) * 100) / 100; });
        var pts = {}; TEAMS.forEach(function (tm) { pts[tm[0]] = 0; });
        return { v: 1, round: 0, length: session.length, paces: paces, pts: pts, wins: {}, log: [], done: false };
      }
      function standings(s) {
        return TEAMS.map(function (tm) { return { code: tm[0], name: tm[1], color: tm[2], pts: s.pts[tm[0]] || 0, wins: s.wins[tm[0]] || 0 }; })
          .sort(function (a, b) { return b.pts - a.pts || b.wins - a.wins; });
      }
      function standingsHtml(s, gained) {
        return '<ol class="pw__results pw__standings">' + standings(s).map(function (r, k) {
          return '<li class="' + (r.code === "PHT" ? "is-me" : "") + '"><b>' + (k + 1) + '</b><i style="background:' + r.color + '"></i>' + esc(r.name) +
            "<span>" + (gained && gained[r.code] ? '<em class="ok">+' + gained[r.code] + "</em> " : "") + "<b>" + r.pts + "</b> pts</span></li>";
        }).join("") + "</ol>";
      }
      function champAfter(res) {
        var s = season, gained = {};
        res.forEach(function (c, k) {
          if (c.out) return;
          var g = (POINTS[k] || 0) + (fastest.car === c && k < 10 ? 1 : 0);
          if (g) { s.pts[c.code] = (s.pts[c.code] || 0) + g; gained[c.code] = g; }
          if (k === 0) s.wins[c.code] = (s.wins[c.code] || 0) + 1;
        });
        var myPos = res.indexOf(me);
        s.log.push({ t: SEASON[s.round], p: me.out ? 0 : myPos + 1 });
        s.round++;
        var table = standings(s), mine = table.map(function (r) { return r.code; }).indexOf("PHT") + 1;
        if (s.round >= 10) {
          s.done = true; saveSeason(s);
          if (mine === 1) api.emit("champion");
          api.emit("season", { position: mine });
          return '<p class="pw__brief">' + (mine === 1 ? "🏆 <b>WORLD CHAMPIONS!</b> " + esc(TEAMS[0][1].replace(" (you)", "")) + " takes the title with " + s.pts.PHT + " points." : "Season over. You finish <b>P" + mine + "</b> in the championship with " + s.pts.PHT + " points.") + "</p>" +
            standingsHtml(s, gained) + '<div class="pw__menu-row"><button class="btn btn--primary" type="button" data-pw-champ-new>↻ new season</button><button class="btn" type="button" data-pw-menu>☰ menu</button></div>';
        }
        saveSeason(s);
        var nt = TRACKS[SEASON[s.round]];
        return '<p class="pw__lbl">championship after round ' + s.round + " · you are <b>P" + mine + "</b></p>" + standingsHtml(s, gained) +
          '<div class="pw__menu-row"><button class="btn btn--primary" type="button" data-pw-champ-next>▶ round ' + (s.round + 1) + ": " + esc(nt.name) + '</button><button class="btn" type="button" data-pw-menu>☰ menu</button></div>';
      }

      /* ---------- menus ---------- */
      function thumb(t) { return '<svg class="pw__thumb" viewBox="20 20 380 250" aria-hidden="true"><path d="' + t.d + '"/></svg>'; }
      function lengthToggle() {
        return '<div class="pw__seg" role="radiogroup" aria-label="Race distance"><span class="pw__lbl">distance</span>' +
          ["sprint", "full"].map(function (l) { return '<button type="button" data-pw-len="' + l + '" aria-pressed="' + (session.length === l) + '">' + (l === "sprint" ? "sprint · ~50%" : "full") + "</button>"; }).join("") + "</div>";
      }
      function clearCars() { Object.keys(dots).forEach(function (k) { dots[k].g.remove(); }); dots = {}; if (scDot) { scDot.remove(); scDot = null; } tower.innerHTML = ""; rows = {}; rowH = 0; tower.style.height = ""; }
      function menu() {
        alive = false; cancelAnimationFrame(raf); season = null; session.kind = "quick";
        clearCars();
        if (!track) { LAPS = TRACKS[0].laps; setTrack(TRACKS[0]); }
        $("[data-radio]").innerHTML = '<p class="pw__msg"><span>--</span>Radio check… loud and clear.</p>';
        api.hud('<span>best <b>' + best + "</b></span>");
        var s = loadSeason(), champLine = s && !s.done ? "round " + (s.round + 1) + "/10 · you're P" + (standings(s).map(function (r) { return r.code; }).indexOf("PHT") + 1) + " with " + s.pts.PHT + " pts" : s && s.done ? "last season: P" + (standings(s).map(function (r) { return r.code; }).indexOf("PHT") + 1) : "10 rounds, points and standings, saved as you go";
        api.overlay('<p class="arcade__kicker">$ bin/race --menu</p><h3>Pit Wall</h3>' +
          "<p>You're the race engineer for the <b>gold car</b>: call the pit stops, choose tyres, set the driver mode and use ERS.</p>" +
          '<div class="pw__modes-menu">' +
            '<button class="pw__pick" type="button" data-pw-quick><b>▶ Quick race</b><span>random circuit and weather</span></button>' +
            '<button class="pw__pick" type="button" data-pw-gp><b>🏁 Grand Prix</b><span>pick the circuit and the weather</span></button>' +
            '<button class="pw__pick" type="button" data-pw-champ><b>🏆 World Championship</b><span>' + esc(champLine) + "</span></button>" +
          "</div>" + lengthToggle());
      }
      function gpMenu() {
        api.overlay('<p class="arcade__kicker">$ bin/race --grand-prix</p><h3>Grand Prix</h3>' +
          '<div class="pw__circuits">' + TRACKS.map(function (t, i) {
            return '<button type="button" class="pw__circuit" data-pw-pick="' + i + '" aria-pressed="' + (session.pick === i) + '">' + thumb(t) + "<b>" + esc(t.name) + "</b><span>" + t.laps + " laps · " + esc(t.tag) + "</span></button>";
          }).join("") + "</div>" +
          '<div class="pw__seg" role="radiogroup" aria-label="Weather"><span class="pw__lbl">weather</span>' +
            [["random", "🎲 forecast"], ["dry", "☀ dry"], ["wet", "🌧 rain"]].map(function (w) { return '<button type="button" data-pw-wx="' + w[0] + '" aria-pressed="' + (session.wx === w[0]) + '">' + w[1] + "</button>"; }).join("") + "</div>" +
          lengthToggle() +
          '<div class="pw__menu-row"><button class="btn btn--primary" type="button" data-pw-gp-go>▶ to the grid</button><button class="btn" type="button" data-pw-menu>← back</button></div>');
      }
      function champMenu() {
        var s = loadSeason();
        if (!s || s.done) { season = newSeason(); saveSeason(season); }
        else season = s;
        var rt = TRACKS[SEASON[season.round]];
        api.overlay('<p class="arcade__kicker">$ bin/race --championship · round ' + (season.round + 1) + "/10</p><h3>World Championship</h3>" +
          '<ol class="pw__calendar">' + SEASON.map(function (ti, r) {
            var lg = season.log[r];
            return '<li class="' + (r === season.round ? "is-next" : r < season.round ? "is-done" : "") + '"><span>R' + (r + 1) + "</span>" + esc(TRACKS[ti].name) + "<em>" + (lg ? (lg.p ? "P" + lg.p : "DNF") : r === season.round ? "next" : "") + "</em></li>";
          }).join("") + "</ol>" +
          (season.round ? standingsHtml(season) : "<p class=\"muted\">Same rival teams all season, each with its own pace. Points: 25-18-15-12-10-8-6-4-2-1, +1 for the fastest lap.</p>") +
          '<p class="muted">Distance: <b>' + (season.length === "sprint" ? "sprint" : "full") + "</b> · leaving mid-race lets you rerun the round.</p>" +
          '<div class="pw__menu-row"><button class="btn btn--primary" type="button" data-pw-champ-go>▶ round ' + (season.round + 1) + ": " + esc(rt.name) + '</button><button class="btn" type="button" data-pw-champ-new>↻ new season</button><button class="btn" type="button" data-pw-menu>← back</button></div>');
      }
      function brief() {
        clearCars();
        drawCars(0); syncControls();
        $("[data-radio]").innerHTML = '<p class="pw__msg"><span>--</span>Radio check… loud and clear.</p>';
        api.hud('<span>best <b>' + best + "</b></span>");
        var wetNow = weather !== "dry";
        var condText = { dry: "☀ dry all race (probably)", mixed: "🌦 rain expected mid-race", "wet start": "🌧 wet start, drying later", storm: "⛈ storm coming" }[cond];
        api.overlay('<p class="arcade__kicker">$ bin/race --track "' + esc(track.name) + '" --laps ' + LAPS + (season ? " --round " + (season.round + 1) : "") + "</p><h3>" + esc(track.name) + "</h3>" +
          '<p class="pw__brief">' + LAPS + " laps · " + condText + " · " + (session.kind === "quick" ? "you start" : "qualified") + " <b>P" + startPos + "</b>" +
          (track.risk > 1.3 ? " · ⚠ tight walls, crashes are likely" : track.pass < 0.45 ? " · easy overtaking" : "") + (track.wear > 1.1 ? " · 🔥 high tyre wear" : track.wear < 0.9 ? " · gentle on tyres" : "") + "</p>" +
          '<ul class="sr__legend"><li><b class="pw__ty pw__ty--S">S</b> soft: fastest, ~' + cliffOf("S") + ' laps</li><li><b class="pw__ty pw__ty--M">M</b> medium: ~' + cliffOf("M") + ' laps</li><li><b class="pw__ty pw__ty--H">H</b> hard: slow, ~' + cliffOf("H") + ' laps</li><li><b class="pw__ty pw__ty--I">I</b> inter / <b class="pw__ty pw__ty--W">W</b> wet: for rain</li></ul>' +
          '<p class="muted">⚡ ERS: ' + me.ers + " boosts per race, about 0.8 s each, cost a lap of tyre life. Pushing, worn tyres and slicks in the wet raise the crash risk. Dry race: use two dry compounds or take +10 s.</p>" +
          '<p class="pw__lbl">start on</p><div class="pw__start-tyres">' +
          (wetNow ? '<button class="btn btn--primary" type="button" data-pw-start="I">inters</button><button class="btn" type="button" data-pw-start="W">wets</button><button class="btn" type="button" data-pw-start="M">gamble: slicks</button>'
                  : '<button class="btn btn--primary" type="button" data-pw-start="S">softs</button><button class="btn" type="button" data-pw-start="M">mediums</button><button class="btn" type="button" data-pw-start="H">hards</button>') +
          "</div>");
      }
      function quickRace() { session.kind = "quick"; season = null; setup(TRACKS[Math.floor(rng() * TRACKS.length)], { length: session.length }); brief(); }
      function gpRace() { session.kind = "gp"; season = null; setup(TRACKS[session.pick], { length: session.length, wx: session.wx, qualify: true }); brief(); }
      function champRace() { session.kind = "champ"; setup(TRACKS[SEASON[season.round]], { length: season.length, qualify: true, paces: season.paces }); brief(); }
      function again() { if (session.kind === "gp") gpRace(); else quickRace(); }

      function onClick(e) {
        var t;
        if ((t = e.target.closest("[data-pw-start]"))) return start(t.getAttribute("data-pw-start"));
        if (e.target.closest("[data-pw-again]")) return again();
        if (e.target.closest("[data-pw-menu]")) return menu();
        if (e.target.closest("[data-pw-quick]")) return quickRace();
        if (e.target.closest("[data-pw-gp]")) return gpMenu();
        if ((t = e.target.closest("[data-pw-pick]"))) { session.pick = +t.getAttribute("data-pw-pick"); stage.querySelectorAll("[data-pw-pick]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
        if ((t = e.target.closest("[data-pw-wx]"))) { session.wx = t.getAttribute("data-pw-wx"); stage.querySelectorAll("[data-pw-wx]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
        if ((t = e.target.closest("[data-pw-len]"))) { session.length = t.getAttribute("data-pw-len"); store.set("samuka-pw-length", session.length); stage.querySelectorAll("[data-pw-len]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
        if (e.target.closest("[data-pw-gp-go]")) return gpRace();
        if (e.target.closest("[data-pw-champ]")) return champMenu();
        if (e.target.closest("[data-pw-champ-go]") || e.target.closest("[data-pw-champ-next]")) { if (!season) season = loadSeason() || newSeason(); return champRace(); }
        if (e.target.closest("[data-pw-champ-new]")) { season = newSeason(); saveSeason(season); return champMenu(); }
        if (!alive) return;
        if ((t = e.target.closest("[data-tyre]"))) return setTyre(t.getAttribute("data-tyre"));
        if (e.target.closest("[data-box]")) return toggleBox();
        if ((t = e.target.closest("[data-mode]"))) return setMode(t.getAttribute("data-mode"));
        if (e.target.closest("[data-ers]")) return deployErs();
        if (e.target.closest("[data-speed]")) { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; syncControls(); }
      }
      stage.addEventListener("click", onClick);
      if (race) { setup(TRACKS[Math.floor(rng() * TRACKS.length)], { length: "full" }); brief(); start(weather !== "dry" ? "I" : "M"); }
      else menu();
      return {
        key: function (e) {
          if (!alive) return;
          var k = e.key.toUpperCase();
          if (k === "B") { e.preventDefault(); toggleBox(); }
          else if (k === "E") { e.preventDefault(); deployErs(); }
          else if (TYRES[k]) { e.preventDefault(); setTyre(k); }
          else if (k === "1") setMode("save"); else if (k === "2") setMode("normal"); else if (k === "3") setMode("push");
          else if (e.key === " ") { e.preventDefault(); speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; syncControls(); }
          else if (k === "P" && !race) { paused = !paused; last = 0; api.toast(paused ? "paused (P to resume)" : "resumed"); }
        },
        pause: function () { if (alive && !paused && !race) { paused = true; api.toast("paused (P to resume)"); } },
        _debug: { cars: function () { return cars; }, step: function (s) { step(s); }, session: function () { return { season: season, track: track && track.name, LAPS: LAPS }; } },
        destroy: function () {
          if (race && alive) race.over(0, 10, true);
          alive = false; cancelAnimationFrame(raf); stage.removeEventListener("click", onClick);
        }
      };
    }
  });
})();
