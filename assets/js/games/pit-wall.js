/* Pit Wall · grand prix race strategy (original game; fictional teams and circuits)
 *
 * You are the race engineer. 10 cars, one of five circuits, varied weather.
 * Call the pit stops, pick tyres, set the driver mode, react to rain, safety
 * cars and incidents. Lap times come from pace + compound + wear (with a
 * cliff) + fuel + weather + mode; pushing, worn tyres and slicks in the wet
 * raise the risk of spins, punctures and crashes.
 * Live 2-player: same seed = same circuit, grid, weather and incidents.
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var SIM_PER_SEC = 13;   // ~7 real seconds per lap at 1x
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
  // five original circuits: shape, laps, base lap, how risky, how hard to pass, pit-lane loss
  var TRACKS = [
    { name: "Phthalo Ring", laps: 20, base: 90, risk: 1, pass: 0.6, pit: 21,
      d: "M70,212 C48,212 36,196 44,176 L86,92 C96,70 122,62 144,76 L196,112 C212,123 232,120 242,104 L270,58 C282,38 312,34 330,50 L366,84 C382,100 378,124 358,134 L268,176 C250,186 250,204 266,212 L314,226 C334,232 330,250 308,250 L92,250 C72,250 60,232 70,212 Z" },
    { name: "Neon Harbour Speedway", laps: 22, base: 78, risk: 0.7, pass: 0.35, pit: 19,
      d: "M80,140 C80,70 150,50 210,50 C290,50 360,70 360,140 C360,210 290,240 210,240 C176,240 166,220 146,226 C110,236 80,210 80,140 Z" },
    { name: "Old Town Street Circuit", laps: 18, base: 96, risk: 1.9, pass: 1.0, pit: 24,
      d: "M60,232 L60,92 L140,92 L140,52 L300,52 L300,122 L360,122 L360,232 L252,232 L252,182 L172,182 L172,232 Z" },
    { name: "Mountain Pass", laps: 18, base: 98, risk: 1.4, pass: 0.8, pit: 22,
      d: "M60,200 C40,140 80,60 140,70 C200,80 190,150 240,150 C290,150 280,60 330,60 C380,60 380,160 350,200 C320,240 250,250 200,230 C150,210 120,250 80,240 C65,236 64,215 60,200 Z" },
    { name: "Desert Night GP", laps: 20, base: 88, risk: 1.1, pass: 0.5, pit: 21,
      d: "M50,150 C50,90 110,60 170,80 L230,100 C260,110 260,60 300,55 C350,50 370,90 350,120 L300,160 C280,175 300,200 330,200 C365,200 370,245 330,250 L120,250 C70,250 50,210 50,150 Z" }
  ];
  var CONDITIONS = ["dry", "dry", "mixed", "mixed", "wet start", "storm"];
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function fmtGap(x) { return x < 60 ? "+" + x.toFixed(1) : "+" + Math.floor(x / 60) + ":" + ("0" + (x % 60).toFixed(1)).slice(-4); }
  function fmtLap(x) { var m = Math.floor(x / 60); return m + ":" + ("0" + (x - m * 60).toFixed(3)).slice(-6); }

  window.SamukaArcade.register("pitwall", {
    title: "pit-wall.rb",
    blurb: "Grand prix race strategy: tyres, pit stops, weather, safety cars and incidents.",
    mount: function (stage, api) {
      var rng = api.rng, race = api.mode === "race" && api.opts.race;
      var rnd = function (a, b) { return a + rng() * (b - a); };
      var track, LAPS, BASE, cars, me, simT, alive = false, paused = false, raf = 0, last = 0, speed = 1, events, cond, weather = "dry", sc = false, scLeft = 0;
      var log = [], fastest = { t: 999, car: null }, best = api.peekBest(), uiT = 0, wasWet = false, startPos = 6, plannedTyre = "M", lastPos = 0, lastLeaderLap = 0;

      stage.innerHTML =
        '<div class="pw">' +
          '<div class="pw__main" data-arena>' +
            '<svg class="pw__track" viewBox="20 20 380 250" aria-label="Circuit map"><path class="pw__kerb" data-kerb/><path class="pw__road" data-road/><path class="pw__line" data-path/>' +
              '<line class="pw__start" data-start/><g data-cars></g></svg>' +
            '<div class="pw__wx" data-wx></div><p class="pw__trackname" data-trackname></p>' +
          '</div>' +
          '<ol class="pw__tower" data-tower aria-label="Timing tower"></ol>' +
          '<div class="pw__ctrl">' +
            '<div class="pw__row"><span class="pw__lbl">next tyre</span><div class="pw__tyres" role="radiogroup" aria-label="Next tyre">' +
              Object.keys(TYRES).map(function (k) { return '<button type="button" class="pw__tyre pw__tyre--' + k + '" data-tyre="' + k + '" aria-pressed="false" title="' + TYRES[k].name + '">' + k + "</button>"; }).join("") +
            '</div><button type="button" class="btn btn--primary pw__box" data-box>BOX THIS LAP</button></div>' +
            '<div class="pw__row"><span class="pw__lbl">driver</span><div class="pw__modes">' +
              '<button type="button" data-mode="save">save tyres</button><button type="button" data-mode="normal" class="is-on">normal</button><button type="button" data-mode="push">push</button>' +
            '</div><span class="pw__risk" data-risk title="Incident risk this lap"></span><button type="button" class="pw__speed" data-speed title="Sim speed (Space)">1×</button></div>' +
            '<div class="pw__radio" data-radio aria-live="polite" tabindex="0" aria-label="Team radio, newest first"></div>' +
          "</div>" +
        "</div>";
      api.foot("<span><kbd>B</kbd> box this lap · <kbd>S</kbd><kbd>M</kbd><kbd>H</kbd><kbd>I</kbd><kbd>W</kbd> next tyre · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> save / normal / push · <kbd>Space</kbd> sim speed. Dry race? Use two dry compounds or take +10 s. Pushing, worn tyres and slicks in the wet raise the crash risk.</span>");
      var $ = function (sel) { return stage.querySelector(sel); };
      var path = $("[data-path]"), carsG = $("[data-cars]"), arena = $("[data-arena]"), plen = 1;

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
      function setTrack(t) {
        track = t; LAPS = t.laps; BASE = t.base;
        ["[data-kerb]", "[data-road]", "[data-path]"].forEach(function (s) { $(s).setAttribute("d", t.d); });
        plen = path.getTotalLength();
        var p0 = path.getPointAtLength(0), p1 = path.getPointAtLength(2), ang = Math.atan2(p1.y - p0.y, p1.x - p0.x) + Math.PI / 2;
        var st = $("[data-start]");
        st.setAttribute("x1", (p0.x + Math.cos(ang) * 9).toFixed(1)); st.setAttribute("y1", (p0.y + Math.sin(ang) * 9).toFixed(1));
        st.setAttribute("x2", (p0.x - Math.cos(ang) * 9).toFixed(1)); st.setAttribute("y2", (p0.y - Math.sin(ang) * 9).toFixed(1));
        $("[data-trackname]").textContent = t.name + " · " + LAPS + " laps";
      }
      function setup() {
        setTrack(TRACKS[Math.floor(rng() * TRACKS.length)]);
        cond = CONDITIONS[Math.floor(rng() * CONDITIONS.length)];
        cars = TEAMS.map(function (t, i) {
          return { i: i, code: t[0], name: t[1], color: t[2], pace: i === 0 ? 0.25 : rnd(-0.6, 1.2), tyre: "M", age: 0, stops: 0, used: {}, lap: 0,
            lapStart: 0, lapTime: BASE, total: 0, pitNext: false, nextTyre: null, mode: "normal", finished: false, out: false, best: 999, pitLossNow: 0, plan: 0, shown: 0 };
        });
        var order = cars.slice(1).sort(function () { return rng() - 0.5; });
        startPos = 4 + Math.floor(rng() * 5);
        order.splice(startPos - 1, 0, cars[0]);
        // weather plan for this race
        events = { rainAt: 99, rainLen: 0, heavy: false, scAt: rng() < 0.45 ? 4 + Math.floor(rng() * (LAPS - 8)) : 99 };
        if (cond === "mixed") { events.rainAt = 4 + Math.floor(rng() * (LAPS - 10)); events.rainLen = 4 + Math.floor(rng() * 5); }
        if (cond === "storm") { events.rainAt = 3 + Math.floor(rng() * 6); events.rainLen = 6 + Math.floor(rng() * 5); events.heavy = true; }
        if (cond === "wet start") { events.rainAt = 0; events.rainLen = 5 + Math.floor(rng() * 5); events.heavy = rng() < 0.4; }
        weather = wxAt(0);
        order.forEach(function (c, gi) {
          c.grid = gi; c.lapStart = -gi * 0.35; c.total = c.lapStart;
          if (c.i) {
            c.tyre = weather === "dry" ? (gi < 4 ? (rng() < 0.6 ? "S" : "M") : pickAI(["M", "H", "S"])) : weather === "wet" && rng() < 0.6 ? "W" : "I";
            c.plan = planStop(c.tyre);
          }
          c.used[c.tyre] = 1;
        });
        me = cars[0];
        simT = 0; sc = false; scLeft = 0; fastest = { t: 999, car: null }; log = []; wasWet = weather !== "dry"; lastLeaderLap = 0;
      }
      function pickAI(arr) { return arr[Math.floor(rng() * arr.length)]; }
      function planStop(tyre) { return Math.max(4, Math.min(LAPS - 3, Math.round(TYRES[tyre].cliff - 2 + rnd(-2, 2)))); }
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
        var ty = TYRES[c.tyre], t = BASE + c.pace + ty.delta;
        var degMul = c.mode === "push" ? 1.6 : c.mode === "save" ? 0.55 : 1;
        if (!ty.dry && weather === "dry") degMul *= 4;
        t += ty.deg * c.age * degMul;
        if (c.age > ty.cliff) t += (c.age - ty.cliff) * 1.5;
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
        if (c.age > ty.cliff) r += 0.03;
        if (ty.dry && weather === "damp") r *= 5; else if (ty.dry && weather === "wet") r *= 9; else if (weather === "wet" && c.tyre === "I") r *= 1.8;
        return Math.min(0.35, r);
      }

      /* ---------- AI strategy ---------- */
      function aiDecide(c) {
        if (c.i === 0 || c.pitNext || c.out) return;
        var wet = weather !== "dry";
        if (wet && TYRES[c.tyre].dry && rng() < 0.55) { c.pitNext = true; c.nextTyre = weather === "wet" && rng() < 0.5 ? "W" : "I"; return; }
        if (weather === "wet" && c.tyre === "I" && rng() < 0.3) { c.pitNext = true; c.nextTyre = "W"; return; }
        if (!wet && !TYRES[c.tyre].dry && rng() < 0.6) { c.pitNext = true; c.nextTyre = LAPS - c.lap > 10 ? "M" : "S"; return; }
        if (sc && c.age > 6 && LAPS - c.lap > 3 && rng() < 0.6) { c.pitNext = true; c.nextTyre = wet ? c.tyre : LAPS - c.lap > 12 ? "H" : "M"; return; }
        var dryUsed = Object.keys(c.used).filter(function (k) { return TYRES[k].dry; }).length;
        if (!wasWet && dryUsed < 2 && LAPS - c.lap <= 3) { c.pitNext = true; c.nextTyre = c.tyre === "S" ? "M" : "S"; return; }
        if (!wet && c.lap + 1 >= c.plan && LAPS - c.lap > 2) {
          var left = LAPS - c.lap;
          c.pitNext = true; c.nextTyre = left > 13 ? "H" : left > 7 ? (c.tyre === "M" ? "H" : "M") : (c.tyre === "S" ? "M" : "S");
        }
        // AI mode: push at the end, save on old tyres
        c.mode = c.age > TYRES[c.tyre].cliff - 3 ? "save" : LAPS - c.lap < 4 ? "push" : "normal";
      }

      /* ---------- simulation ---------- */
      function progress(c) { return c.finished || c.out ? 1 : Math.max(0, Math.min(0.999, (simT - c.lapStart) / c.lapTime)); }
      function order() {
        return cars.slice().sort(function (a, b) {
          if (a.out !== b.out) return a.out ? 1 : -1;
          if (a.out && b.out) return b.outLap - a.outLap;
          if (a.finished !== b.finished) return a.finished ? -1 : 1;
          if (a.finished && b.finished) return a.finishT - b.finishT;
          if (a.lap !== b.lap) return b.lap - a.lap;
          return progress(b) - progress(a);
        });
      }
      function incident(c) {
        var roll = rng(), you = c.i === 0;
        if (roll < 0.62) {
          var lost = rnd(4, 9); c.lapTime += lost; c.age += 3;
          if (you) { radio("SPIN! We lost " + lost.toFixed(1) + " s and flat-spotted the tyres.", "err"); pop("💫 spin · -" + lost.toFixed(1) + " s", "err"); shake(); }
          else radio(c.code + " spins! Opportunity.", "warn");
        } else if (roll < 0.88) {
          c.lapTime += 18; c.pitNext = true; c.nextTyre = c.nextTyre || (TYRES[c.tyre].dry && weather === "dry" ? (c.tyre === "S" ? "M" : "S") : c.tyre);
          if (you) { plannedTyre = c.nextTyre; radio("PUNCTURE! Limping back, we're boxing this lap.", "err"); pop("💥 puncture", "err"); shake(); syncControls(); }
          else radio(c.code + " has a puncture.", "warn");
        } else {
          c.out = true; c.outLap = c.lap; c.finished = false;
          if (you) { radio("CRASH! The car is in the wall. We're out.", "err"); pop("💥 crash: DNF", "err"); shake(); }
          else radio(c.code + " has crashed out!", "warn");
          if (!sc) { sc = true; scLeft = 3; radio("SAFETY CAR after the crash. Cheap pit stops!", "warn"); }
        }
      }
      function completeLap(c) {
        var lt = c.lapTime;
        c.lap++; c.total = c.lapStart + lt; c.age++;
        var clean = lt - c.pitLossNow;
        if (!sc && c.pitLossNow === 0 && clean < c.best) c.best = clean;
        if (!sc && c.pitLossNow === 0 && clean < fastest.t) { fastest = { t: clean, car: c }; if (c.i === 0 && c.lap > 2) { radio("Purple sector! Fastest lap: " + fmtLap(clean) + ".", "ok"); pop("⚡ fastest lap", "ok"); } }
        c.lapStart = c.total; c.pitLossNow = 0;
        if (c.lap >= LAPS) { c.finished = true; c.finishT = c.total; return; }
        aiDecide(c);
        var extra = 0;
        if (c.pitNext) {
          var loss = sc ? Math.round(track.pit / 2) : track.pit;
          extra = loss; c.pitLossNow = loss;
          c.tyre = c.nextTyre || c.tyre; c.age = 0; c.stops++; c.used[c.tyre] = 1; c.pitNext = false; c.nextTyre = null;
          if (c.i === 0) radio("Box box, done. " + TYRES[c.tyre].name + "s on, " + (sc ? "cheap stop under the safety car." : loss + " s in the pit lane."), "ok");
          else c.plan = c.lap + planStop(c.tyre);
        }
        c.lapTime = lapTime(c, extra);
        // dirty air / defending: harder to pass on tight tracks
        var o = order(), ahead = o[o.indexOf(c) - 1];
        if (ahead && !ahead.finished && !ahead.out && Math.abs(c.lapStart - ahead.lapStart) < 1.0 && c.lapTime > ahead.lapTime - track.pass) c.lapTime += 0.3;
        var battle = ahead && !ahead.finished && !ahead.out && Math.abs(c.lapStart - ahead.lapStart) < 0.6 ? 0.012 * track.risk : 0;   // wheel-to-wheel
        if (rng() < risk(c) + battle) incident(c);
      }
      function worldLap() {
        var lap = order()[0].lap, wx = wxAt(lap);
        if (wx !== weather) {
          var prev = weather; weather = wx; if (wx !== "dry") wasWet = true;
          radio(wx === "dry" ? "Track is drying. Slicks are the call when you're ready." : wx === "wet" ? "Heavy rain! Full wets are fastest now." : prev === "dry" ? "Rain! Track is damp: inters are the tyre." : "Rain easing, still damp.", "warn");
          pop(wx === "dry" ? "☀ drying" : wx === "wet" ? "🌧 heavy rain" : "🌦 rain", "warn");
        }
        if (!sc && lap === events.scAt) { sc = true; scLeft = 3; events.scAt = 99; radio("SAFETY CAR deployed. Pit stops are cheap right now.", "warn"); pop("🚨 safety car", "warn"); }
        else if (sc && --scLeft <= 0) { sc = false; radio("Safety car in this lap. Green flag!", "ok"); pop("🟢 green flag", "ok"); }
        if (events.rainAt > lap && events.rainAt - lap <= 3 && events.rainAt < 99) radio("Rain on the radar, about " + (events.rainAt - lap) + " lap" + (events.rainAt - lap > 1 ? "s" : "") + " away.", "warn");
      }
      function step(dt) {
        simT += dt;
        cars.forEach(function (c) { while (!c.finished && !c.out && simT >= c.lapStart + c.lapTime) completeLap(c); });
        var ll = order()[0].lap;
        if (ll !== lastLeaderLap) { lastLeaderLap = ll; worldLap(); engineer(); }
        if (cars.every(function (c) { return c.finished || c.out; })) over();
      }
      function engineer() {
        if (me.finished || me.out) return;
        var o = order(), p = o.indexOf(me), ahead = o[p - 1], ty = TYRES[me.tyre];
        if (me.age === ty.cliff - 2) radio("Tyres are going off soon: about 2 laps left on these " + ty.name + "s.", "warn");
        else if (me.age > ty.cliff && (me.age - ty.cliff) % 3 === 1) radio("We're on the cliff! Losing " + ((me.age - ty.cliff) * 1.5).toFixed(1) + " s a lap. Box?", "err");
        else if (TYRES[me.tyre].dry && weather !== "dry") radio("Slicks in the wet: we're sliding everywhere. Box for inters?", "err");
        else if (ahead && me.lap % 3 === 0) radio("P" + (p + 1) + ". Gap to " + ahead.code + " " + Math.max(0, me.lapStart - ahead.lapStart).toFixed(1) + " s.");
      }

      /* ---------- rendering (smooth: cars ease toward their sim position and face the track) ---------- */
      var dots = {};
      function carShape(c) {
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "pw__car" + (c.i === 0 ? " pw__car--me" : ""));
        g.innerHTML = '<g class="pw__body"><path d="M7,0 L-5,-4.2 L-3,0 L-5,4.2 Z" fill="' + c.color + '"/></g>' + (c.i === 0 ? '<text y="-9" text-anchor="middle">YOU</text>' : "");
        carsG.appendChild(g);
        return { g: g, body: g.firstChild, d: 0 };
      }
      function drawCars() {
        cars.forEach(function (c) {
          var v = dots[c.code] || (dots[c.code] = carShape(c));
          var target = (c.lap + progress(c)) * plen;
          if (!v.d || Math.abs(target - v.d) > plen * 0.5) v.d = target;
          v.d += (target - v.d) * 0.35;   // ease: no jumps when lap times are recalculated
          var l = ((v.d % plen) + plen) % plen, p = path.getPointAtLength(l), q = path.getPointAtLength((l + 1.5) % plen);
          var ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
          v.g.setAttribute("transform", "translate(" + p.x.toFixed(2) + "," + p.y.toFixed(2) + ")");
          v.body.setAttribute("transform", "rotate(" + ang.toFixed(1) + ")");
          var inPit = c.pitLossNow && (simT - c.lapStart) < c.pitLossNow;
          v.g.classList.toggle("is-pit", !!inPit);
          v.g.classList.toggle("is-out", !!c.out);
        });
        if (me && dots[me.code]) carsG.appendChild(dots[me.code].g);
      }
      function riskLabel(r) { return r < 0.009 ? ["low", 1] : r < 0.035 ? ["medium", 2] : ["HIGH", 3]; }
      function drawTower() {
        var o = order(), lead = o[0];
        $("[data-tower]").innerHTML = o.map(function (c, k) {
          var gap;
          if (c.out) gap = '<em class="err">OUT</em>';
          else if (k === 0) gap = c.finished ? "FIN" : "L" + Math.min(LAPS, c.lap + 1) + "/" + LAPS;
          else if (c.lap < lead.lap - (lead.finished ? 0 : 0) && lead.lap - c.lap >= 1 && !c.finished && progress(c) < progress(lead)) gap = "+" + (lead.lap - c.lap) + " lap";
          else gap = fmtGap(Math.max(0, (c.finished ? c.finishT : c.lapStart) - (lead.finished ? lead.finishT : lead.lapStart)));
          var pit = c.pitLossNow && (simT - c.lapStart) < c.pitLossNow;
          return '<li class="' + (c.i === 0 ? "is-me" : "") + (c.out ? " is-out" : "") + '"><b>' + (k + 1) + '</b><i style="background:' + c.color + '"></i><span class="pw__code">' + c.code + '</span><span class="pw__gap">' + (pit ? "<em>PIT</em>" : gap) + '</span><span class="pw__ty pw__ty--' + c.tyre + '">' + c.tyre + '</span><span class="pw__age">' + c.age + "</span></li>";
        }).join("");
        var lap = Math.min(LAPS, o[0].lap + 1), fc = [], icon = { dry: "☀", damp: "🌦", wet: "🌧" };
        for (var k = 0; k < 4; k++) fc.push(wxAt(o[0].lap + k));
        $("[data-wx]").innerHTML = '<span>LAP <b>' + lap + "/" + LAPS + "</b></span>" + (sc ? '<span class="pw__sc">SAFETY CAR</span>' : "") +
          '<span class="pw__fc" title="forecast: now, +1, +2, +3 laps">' + fc.map(function (w) { return icon[w]; }).join(" ") + "</span>" +
          '<span>you <b>' + TYRES[me.tyre].name + "</b> · " + me.age + " laps" + (me.pitNext ? ' · <b class="ok">boxing → ' + (me.nextTyre || plannedTyre) + "</b>" : "") + "</span>";
        var rl = riskLabel(risk(me)), rEl = $("[data-risk]");
        rEl.className = "pw__risk pw__risk--" + rl[1]; rEl.innerHTML = "risk " + "●".repeat(rl[1]) + "○".repeat(3 - rl[1]) + " <b>" + rl[0] + "</b>";
        var p = o.indexOf(me);
        if (lastPos && p !== lastPos && !me.out && !me.finished) pop(p < lastPos ? "▲ P" + (p + 1) + " (+" + (lastPos - p) + ")" : "▼ P" + (p + 1), p < lastPos ? "ok" : "warn");
        lastPos = p;
        api.hud("<span>P<b>" + (p + 1) + "</b></span><span>lap <b>" + lap + "/" + LAPS + "</b></span><span>stops <b>" + me.stops + '</b></span><span class="hide-sm">best <b>' + best + "</b></span>");
        if (race) race.tick(projected(p), lap, 0);
      }
      function projected(p) { return me.out ? 0 : (POINTS[p] || 0) * 100 + Math.max(0, startPos - 1 - p) * 60; }
      function syncControls() {
        stage.querySelectorAll("[data-tyre]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tyre") === plannedTyre)); });
        var box = $("[data-box]"); box.classList.toggle("is-armed", !!(me && me.pitNext)); box.textContent = me && me.pitNext ? "BOXING → " + plannedTyre + " (cancel)" : "BOX THIS LAP";
        stage.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.toggle("is-on", me && b.getAttribute("data-mode") === me.mode); });
        $("[data-speed]").textContent = speed + "×";
      }

      /* ---------- loop ---------- */
      function frame(ts) {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        if (!paused) step(dt * SIM_PER_SEC * speed);
        if (!alive) return;
        drawCars();
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

      /* ---------- screens ---------- */
      function start(tyre) {
        me.tyre = tyre; me.used = {}; me.used[tyre] = 1;
        cars.forEach(function (c) { c.lapTime = lapTime(c, 0); });
        plannedTyre = weather !== "dry" ? (tyre === "I" ? "M" : "I") : tyre === "S" ? "M" : tyre === "M" ? "H" : "M";
        alive = true; paused = false; last = 0; speed = 1; lastPos = 0;
        api.clearOverlay();
        radio("Lights out and away we go! P" + startPos + " on " + TYRES[tyre].name + "s. " + track.name + ", " + cond + ".", "ok");
        syncControls(); drawCars(); drawTower();
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
        if (p === 0 && !me.out) api.emit("win");
        if (p < 3 && wasWet && !me.out) api.emit("rain_podium");
        var table = res.map(function (c, k) {
          return '<li class="' + (c === me ? "is-me" : "") + '"><b>' + (c.out ? "–" : k + 1) + '</b><i style="background:' + c.color + '"></i>' + esc(c.name) + "<span>" + (c.out ? "DNF" : k === 0 ? fmtLap(c.finishT / LAPS) + " avg" : fmtGap(c.finishT - res[0].finishT)) + "</span></li>";
        }).join("");
        var head = '<p class="arcade__kicker">$ chequered flag · ' + esc(track.name) + " · " + esc(cond) + "</p><h3>" + (me.out ? "DNF. Into the wall. 💥" : p === 0 ? "P1. What a call! 🏆" : p < 3 ? "P" + (p + 1) + ". Podium!" : "P" + (p + 1)) + "</h3>" +
          (penalty ? '<p class="err">+10 s penalty: only one dry compound used.</p>' : "") +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>started</dt><dd>P" + startPos + "</dd><dt>stops</dt><dd>" + me.stops + "</dd><dt>fastest lap</dt><dd>" + (fastest.car ? esc(fastest.car.code) + " " + fmtLap(fastest.t) : "-") + "</dd></dl>" +
          '<ol class="pw__results">' + table + "</ol>";
        if (race) {
          race.over(score, p + 1);
          api.overlay(head + '<div class="race-result" data-race-result><p class="muted">waiting for the other strategist…</p></div>');
          return;
        }
        api.overlay(head + '<div class="lb-mini" data-lb-mini="pitwall"></div><button class="btn btn--primary" type="button" data-pw-again>↻ next race</button>');
      }
      function intro() {
        setup();
        Object.keys(dots).forEach(function (k) { dots[k].g.remove(); }); dots = {};
        drawCars(); syncControls();
        $("[data-radio]").innerHTML = '<p class="pw__msg"><span>--</span>Radio check… loud and clear.</p>';
        api.hud('<span>best <b>' + best + "</b></span>");
        var wetNow = weather !== "dry";
        var condText = { dry: "☀ dry all race (probably)", mixed: "🌦 rain expected mid-race", "wet start": "🌧 wet start, drying later", storm: "⛈ storm coming" }[cond];
        api.overlay('<p class="arcade__kicker">$ bin/race --track "' + esc(track.name) + '" --laps ' + LAPS + "</p><h3>Pit Wall</h3>" +
          '<p class="pw__brief"><b>' + esc(track.name) + "</b> · " + LAPS + " laps · " + condText + " · you start <b>P" + startPos + "</b>" +
          (track.risk > 1.3 ? " · ⚠ tight walls, crashes are likely" : track.pass < 0.45 ? " · easy overtaking" : "") + "</p>" +
          "<p>You're the race engineer for the <b>gold car</b>: call the pit stops, choose tyres and set the driver mode.</p>" +
          '<ul class="sr__legend"><li><b class="pw__ty pw__ty--S">S</b> soft: fastest, wears quickly</li><li><b class="pw__ty pw__ty--M">M</b> medium</li><li><b class="pw__ty pw__ty--H">H</b> hard: slow, lasts</li><li><b class="pw__ty pw__ty--I">I</b> inter / <b class="pw__ty pw__ty--W">W</b> wet: for rain</li></ul>' +
          '<p class="muted">Pushing, worn tyres and slicks in the wet raise the risk of spins, punctures and crashes. Dry race: use two dry compounds or take +10 s.</p>' +
          '<p class="pw__lbl">start on</p><div class="pw__start-tyres">' +
          (wetNow ? '<button class="btn btn--primary" type="button" data-pw-start="I">inters</button><button class="btn" type="button" data-pw-start="W">wets</button><button class="btn" type="button" data-pw-start="M">gamble: slicks</button>'
                  : '<button class="btn btn--primary" type="button" data-pw-start="S">softs</button><button class="btn" type="button" data-pw-start="M">mediums</button><button class="btn" type="button" data-pw-start="H">hards</button>') +
          "</div>");
      }
      function onClick(e) {
        var t;
        if ((t = e.target.closest("[data-pw-start]"))) return start(t.getAttribute("data-pw-start"));
        if (e.target.closest("[data-pw-again]")) return intro();
        if (!alive) return;
        if ((t = e.target.closest("[data-tyre]"))) return setTyre(t.getAttribute("data-tyre"));
        if (e.target.closest("[data-box]")) return toggleBox();
        if ((t = e.target.closest("[data-mode]"))) return setMode(t.getAttribute("data-mode"));
        if (e.target.closest("[data-speed]")) { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; syncControls(); }
      }
      stage.addEventListener("click", onClick);
      intro();
      if (race) start(weather !== "dry" ? "I" : "M");
      return {
        key: function (e) {
          if (!alive) return;
          var k = e.key.toUpperCase();
          if (k === "B") { e.preventDefault(); toggleBox(); }
          else if (TYRES[k]) { e.preventDefault(); setTyre(k); }
          else if (k === "1") setMode("save"); else if (k === "2") setMode("normal"); else if (k === "3") setMode("push");
          else if (e.key === " ") { e.preventDefault(); speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; syncControls(); }
          else if (k === "P" && !race) { paused = !paused; api.toast(paused ? "paused (P to resume)" : "resumed"); }
        },
        pause: function () { if (alive && !paused && !race) { paused = true; api.toast("paused (P to resume)"); } },
        destroy: function () {
          if (race && alive) race.over(0, 10, true);
          alive = false; cancelAnimationFrame(raf); stage.removeEventListener("click", onClick);
        }
      };
    }
  });
})();
