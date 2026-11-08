/* Pit Wall · grand prix race strategy (original game; fictional teams and circuit)
 *
 * You are the race engineer. 10 cars, 20 laps, ~3 minutes. Call the pit stops,
 * pick tyres, set the driver mode, react to rain and safety cars. Lap times come
 * from pace + tyre compound + tyre wear (with a cliff) + fuel + weather + mode.
 * Live 2-player: same seed = same grid, weather and safety car for both players.
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var LAPS = 20, BASE = 90, SIM_PER_SEC = 13;   // ~7 real seconds per lap at 1x
  var TYRES = {
    S: { name: "soft", short: "S", delta: -1.2, deg: 0.11, cliff: 10, dry: true },
    M: { name: "medium", short: "M", delta: -0.6, deg: 0.065, cliff: 18, dry: true },
    H: { name: "hard", short: "H", delta: 0, deg: 0.035, cliff: 28, dry: true },
    I: { name: "inter", short: "I", delta: 0, deg: 0.08, cliff: 15, dry: false },
    W: { name: "wet", short: "W", delta: 0, deg: 0.05, cliff: 20, dry: false }
  };
  // weather penalty by compound: dry / damp / wet
  var WX = {
    dry: { S: 0, M: 0, H: 0, I: 4, W: 7 },
    damp: { S: 5, M: 5, H: 5.5, I: 0, W: 2 },
    wet: { S: 10, M: 10, H: 10.5, I: 3, W: 0 }
  };
  var TEAMS = [
    ["PHT", "Phthalo (you)", "#f4c95d"], ["RBY", "Ruby Racing", "#ff4d5e"], ["SKQ", "Sidekiq", "#c46ad8"], ["PGR", "Postgres GP", "#5b8def"],
    ["RDS", "Redis Rossa", "#e5383b"], ["DKR", "Docker Blue", "#4aa3f0"], ["RLS", "Rails Works", "#d6343c"], ["ELX", "Elixir", "#9b6bd6"],
    ["NGX", "Nginx Verde", "#3ad08f"], ["KFK", "Kafka Corse", "#9aa3ad"]
  ];
  var POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  // original circuit (fictional)
  var TRACK = "M70,212 C48,212 36,196 44,176 L86,92 C96,70 122,62 144,76 L196,112 C212,123 232,120 242,104 L270,58 C282,38 312,34 330,50 L366,84 C382,100 378,124 358,134 L268,176 C250,186 250,204 266,212 L314,226 C334,232 330,250 308,250 L92,250 C72,250 60,232 70,212 Z";
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function fmtGap(x) { return x < 60 ? "+" + x.toFixed(1) : "+" + Math.floor(x / 60) + ":" + ("0" + (x % 60).toFixed(1)).slice(-4); }
  function fmtLap(x) { var m = Math.floor(x / 60); return m + ":" + ("0" + (x - m * 60).toFixed(3)).slice(-6); }

  window.SamukaArcade.register("pitwall", {
    title: "pit-wall.rb",
    blurb: "Grand prix race strategy: tyres, pit stops, rain and safety cars.",
    mount: function (stage, api) {
      var rng = api.rng, race = api.mode === "race" && api.opts.race;
      var rnd = function (a, b) { return a + rng() * (b - a); };
      var cars, me, simT, alive = false, paused = false, raf = 0, last = 0, speed = 1, events, weather = "dry", sc = false, scLeft = 0;
      var log = [], fastest = { t: 999, car: null }, best = api.peekBest(), uiT = 0, wasWet = false, startPos = 6, plannedTyre = "M";

      stage.innerHTML =
        '<div class="pw">' +
          '<div class="pw__main">' +
            '<svg class="pw__track" viewBox="20 20 380 250" aria-label="Circuit map"><path class="pw__road" d="' + TRACK + '"/><path class="pw__line" d="' + TRACK + '" data-path/>' +
              '<line class="pw__start" x1="180" y1="242" x2="180" y2="258"/><g data-cars></g></svg>' +
            '<div class="pw__wx" data-wx></div>' +
          '</div>' +
          '<ol class="pw__tower" data-tower aria-label="Timing tower"></ol>' +
          '<div class="pw__ctrl">' +
            '<div class="pw__row"><span class="pw__lbl">next tyre</span><div class="pw__tyres" role="radiogroup" aria-label="Next tyre">' +
              Object.keys(TYRES).map(function (k) { return '<button type="button" class="pw__tyre pw__tyre--' + k + '" data-tyre="' + k + '" aria-pressed="false" title="' + TYRES[k].name + '">' + k + "</button>"; }).join("") +
            '</div><button type="button" class="btn btn--primary pw__box" data-box>BOX THIS LAP</button></div>' +
            '<div class="pw__row"><span class="pw__lbl">driver</span><div class="pw__modes">' +
              '<button type="button" data-mode="save">save tyres</button><button type="button" data-mode="normal" class="is-on">normal</button><button type="button" data-mode="push">push</button>' +
            '</div><button type="button" class="pw__speed" data-speed title="Sim speed (Space)">1×</button></div>' +
            '<pre class="pw__radio" data-radio aria-live="polite"></pre>' +
          "</div>" +
        "</div>";
      api.foot("<span><kbd>B</kbd> box this lap · <kbd>S</kbd><kbd>M</kbd><kbd>H</kbd><kbd>I</kbd><kbd>W</kbd> next tyre · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> save / normal / push · <kbd>Space</kbd> sim speed. Dry race? Use two different dry compounds or take +10 s.</span>");
      var $ = function (sel) { return stage.querySelector(sel); };
      var path = $("[data-path]"), plen = path.getTotalLength(), carsG = $("[data-cars]");

      function radio(msg, cls) {
        var lap = me ? Math.min(LAPS, me.lap + 1) : 0;
        log.push('<span class="dim">[L' + lap + "]</span> " + (cls ? '<span class="' + cls + '">' + msg + "</span>" : msg));
        if (log.length > 6) log.shift();
        $("[data-radio]").innerHTML = log.join("\n");
      }

      /* ---------- race setup ---------- */
      function setup() {
        cars = TEAMS.map(function (t, i) {
          return { i: i, code: t[0], name: t[1], color: t[2], pace: i === 0 ? 0.25 : rnd(-0.6, 1.2), tyre: "M", age: 0, stops: 0, used: {}, lap: 0,
            lapStart: 0, lapTime: BASE, total: 0, pitNext: false, nextTyre: null, mode: "normal", finished: false, best: 999, pitLossNow: 0, plan: 0 };
        });
        // grid: you start around P4-P8
        var order = cars.slice(1).sort(function () { return rng() - 0.5; });
        startPos = 4 + Math.floor(rng() * 5);
        order.splice(startPos - 1, 0, cars[0]);
        order.forEach(function (c, gi) {
          c.grid = gi; c.lapStart = gi * 0.35; c.total = gi * 0.35;
          if (c.i) { c.tyre = gi < 4 ? (rng() < 0.6 ? "S" : "M") : pickAI(["M", "H", "S"]); c.plan = planStop(c.tyre); }
          c.used[c.tyre] = 1;
        });
        me = cars[0];
        // weather and safety car for this race (same seed = same race)
        events = { rainAt: rng() < 0.55 ? 5 + Math.floor(rng() * 9) : 99, rainLen: 4 + Math.floor(rng() * 5), heavy: rng() < 0.3, scAt: rng() < 0.6 ? 4 + Math.floor(rng() * 12) : 99 };
        simT = 0; weather = "dry"; sc = false; scLeft = 0; fastest = { t: 999, car: null }; log = []; wasWet = false;
        cars.forEach(function (c) { c.lapTime = lapTime(c, 0); });
      }
      function pickAI(arr) { return arr[Math.floor(rng() * arr.length)]; }
      function planStop(tyre) { return Math.max(4, Math.min(LAPS - 3, Math.round(TYRES[tyre].cliff - 2 + rnd(-2, 2)))); }

      /* ---------- lap time model ---------- */
      function wxAt(lap) {
        if (lap >= events.rainAt && lap < events.rainAt + events.rainLen) return events.heavy && lap >= events.rainAt + 1 && lap < events.rainAt + events.rainLen - 1 ? "wet" : "damp";
        return "dry";
      }
      function lapTime(c, extra) {
        if (sc) return 104 + rnd(-0.2, 0.2) + (extra || 0);
        var ty = TYRES[c.tyre], t = BASE + c.pace + ty.delta;
        var degMul = c.mode === "push" ? 1.6 : c.mode === "save" ? 0.55 : 1;
        if (!ty.dry && weather === "dry") degMul *= 4;   // rain tyres overheat on a dry track
        t += ty.deg * c.age * degMul;
        if (c.age > ty.cliff) t += (c.age - ty.cliff) * 1.5;
        t += WX[weather][c.tyre];
        t += 0.06 * (LAPS - c.lap);                       // fuel load
        t += c.mode === "push" ? -0.45 : c.mode === "save" ? 0.45 : 0;
        t += rnd(-0.25, 0.25);
        return t + (extra || 0);
      }

      /* ---------- AI strategy ---------- */
      function aiDecide(c) {
        if (c.i === 0 || c.pitNext) return;
        var wx = weather, wet = wx !== "dry";
        if (wet && TYRES[c.tyre].dry && rng() < 0.55) { c.pitNext = true; c.nextTyre = wx === "wet" && rng() < 0.5 ? "W" : "I"; return; }
        if (!wet && !TYRES[c.tyre].dry && rng() < 0.6) { c.pitNext = true; c.nextTyre = LAPS - c.lap > 10 ? "M" : "S"; return; }
        if (sc && c.age > 6 && LAPS - c.lap > 3 && rng() < 0.6) { c.pitNext = true; c.nextTyre = LAPS - c.lap > 12 ? "H" : "M"; return; }
        var dryUsed = Object.keys(c.used).filter(function (k) { return TYRES[k].dry; }).length;
        if (!wasWet && dryUsed < 2 && LAPS - c.lap <= 3) { c.pitNext = true; c.nextTyre = c.tyre === "S" ? "M" : "S"; return; }
        if (c.lap + 1 >= c.plan && c.stops === 0 && LAPS - c.lap > 2) {
          var left = LAPS - c.lap;
          c.pitNext = true; c.nextTyre = left > 13 ? "H" : left > 7 ? (c.tyre === "M" ? "H" : "M") : (c.tyre === "S" ? "M" : "S");
        }
      }

      /* ---------- simulation ---------- */
      function order() {
        return cars.slice().sort(function (a, b) {
          if (a.finished !== b.finished) return a.finished ? -1 : 1;
          if (a.lap !== b.lap) return b.lap - a.lap;
          return progress(b) - progress(a) || a.total - b.total;
        });
      }
      function progress(c) { return c.finished ? 1 : Math.min(0.999, (simT - c.lapStart) / c.lapTime); }
      function completeLap(c) {
        var lt = c.lapTime;
        c.lap++; c.total = c.lapStart + lt; c.age++;
        if (!sc && lt - c.pitLossNow < c.best) c.best = lt - c.pitLossNow;
        if (!sc && lt - c.pitLossNow < fastest.t && c.pitLossNow === 0) { fastest = { t: lt, car: c }; }
        c.lapStart = c.total; c.pitLossNow = 0;
        if (c.lap >= LAPS) { c.finished = true; c.finishT = c.total; return; }
        aiDecide(c);
        var extra = 0;
        if (c.pitNext) {
          var loss = sc ? 11 : 21;
          extra = loss; c.pitLossNow = loss;
          c.tyre = c.nextTyre || c.tyre; c.age = 0; c.stops++; c.used[c.tyre] = 1; c.pitNext = false; c.nextTyre = null;
          if (c.i === 0) radio("Box box, done. " + TYRES[c.tyre].name + "s on, " + (sc ? "cheap stop under the safety car." : "-" + loss + " s in the pit lane."), "ok");
          if (c.i !== 0) c.plan = c.lap + planStop(c.tyre);
        }
        // dirty air behind a slower car
        var ahead = order()[Math.max(0, order().indexOf(c) - 1)];
        c.lapTime = lapTime(c, extra);
        if (ahead && ahead !== c && !ahead.finished && Math.abs(c.lapStart - ahead.lapStart) < 1.0 && c.lapTime > ahead.lapTime - 0.6) c.lapTime += 0.3;
      }
      function worldLap() {
        var leader = order()[0], lap = leader.lap;
        var wx = wxAt(lap);
        if (wx !== weather) {
          var prev = weather; weather = wx; if (wx !== "dry") wasWet = true;
          radio(wx === "dry" ? "Track is drying. Slicks are the call when you're ready." : wx === "wet" ? "Heavy rain! Full wets are fastest now." : (prev === "dry" ? "Rain! Track is damp, inters are the tyre." : "Rain easing, still damp."), "warn");
        }
        if (!sc && lap === events.scAt) { sc = true; scLeft = 3; radio("SAFETY CAR deployed. Pit stops are cheap right now.", "warn"); }
        else if (sc && --scLeft <= 0) { sc = false; events.scAt = 99; radio("Safety car in this lap. Green flag!", "ok"); }
        if (lap + 2 === events.rainAt || lap + 3 === events.rainAt) radio("Rain on the radar, about " + (events.rainAt - lap) + " laps away.", "warn");
      }
      var lastLeaderLap = 0;
      function step(dt) {
        simT += dt;
        cars.forEach(function (c) {
          while (!c.finished && simT >= c.lapStart + c.lapTime) completeLap(c);
        });
        var ll = order()[0].lap;
        if (ll !== lastLeaderLap) { lastLeaderLap = ll; worldLap(); engineer(); }
        if (cars.every(function (c) { return c.finished; })) over();
      }
      function engineer() {
        if (me.finished) return;
        var o = order(), p = o.indexOf(me), ahead = o[p - 1], ty = TYRES[me.tyre];
        if (me.age === ty.cliff - 2) radio("Tyres are going off soon. " + ty.name + "s have about 2 laps left.", "warn");
        else if (me.age > ty.cliff) radio("We're on the cliff! Losing big time each lap.", "err");
        else if (ahead && me.lap % 3 === 0) radio("P" + (p + 1) + ". Gap to " + ahead.code + " " + (me.lapStart - ahead.lapStart).toFixed(1) + " s.");
      }

      /* ---------- rendering ---------- */
      var dots = {};
      function drawCars() {
        cars.forEach(function (c) {
          var d = dots[c.code];
          if (!d) {
            d = dots[c.code] = document.createElementNS("http://www.w3.org/2000/svg", "g");
            d.innerHTML = '<circle r="' + (c.i === 0 ? 6.5 : 5) + '" fill="' + c.color + '"/>' + (c.i === 0 ? '<text y="-10" text-anchor="middle">YOU</text>' : "");
            d.setAttribute("class", "pw__car" + (c.i === 0 ? " pw__car--me" : ""));
            carsG.appendChild(d);
          }
          var frac = c.finished ? 0.02 : progress(c), inPit = c.pitLossNow && (simT - c.lapStart) < c.pitLossNow;
          var pt = path.getPointAtLength(((frac + 0.11) % 1) * plen);
          d.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
          d.classList.toggle("is-pit", !!inPit);
        });
        if (me) carsG.appendChild(dots[me.code]);   // you on top
      }
      function drawTower() {
        var o = order(), lead = o[0];
        $("[data-tower]").innerHTML = o.map(function (c, k) {
          var gap = k === 0 ? (c.finished ? "FIN" : "L" + Math.min(LAPS, c.lap + 1) + "/" + LAPS) : c.lap < lead.lap ? "+" + (lead.lap - c.lap) + " lap" : fmtGap(Math.max(0, (c.finished ? c.finishT : c.lapStart) - (lead.finished ? lead.finishT : lead.lapStart)));
          var pit = c.pitLossNow && (simT - c.lapStart) < c.pitLossNow;
          return '<li class="' + (c.i === 0 ? "is-me" : "") + '"><b>' + (k + 1) + '</b><i style="background:' + c.color + '"></i><span class="pw__code">' + c.code + '</span><span class="pw__gap">' + (pit ? '<em>PIT</em>' : gap) + '</span><span class="pw__ty pw__ty--' + c.tyre + '">' + c.tyre + '</span><span class="pw__age">' + c.age + "</span></li>";
        }).join("");
        var lap = Math.min(LAPS, o[0].lap + 1), fc = [];
        for (var k = 0; k < 4; k++) fc.push(wxAt(o[0].lap + k));
        var icon = { dry: "☀", damp: "🌦", wet: "🌧" };
        $("[data-wx]").innerHTML = '<span>LAP <b>' + lap + "/" + LAPS + "</b></span>" + (sc ? '<span class="pw__sc">SAFETY CAR</span>' : "") +
          '<span class="pw__fc" title="forecast: now, +1, +2, +3 laps">' + fc.map(function (w) { return icon[w]; }).join(" ") + "</span>" +
          '<span>you <b>' + TYRES[me.tyre].name + "</b> · " + me.age + " laps" + (me.pitNext ? ' · <b class="ok">boxing → ' + (me.nextTyre || me.tyre) + "</b>" : "") + "</span>";
        var p = o.indexOf(me);
        api.hud("<span>P<b>" + (p + 1) + "</b></span><span>lap <b>" + lap + "/" + LAPS + "</b></span><span>stops <b>" + me.stops + '</b></span><span class="hide-sm">best <b>' + best + "</b></span>");
        if (race) race.tick(projected(p), lap, 0);
      }
      function projected(p) { return (POINTS[p] || 0) * 100 + Math.max(0, startPos - 1 - p) * 60; }
      function syncControls() {
        stage.querySelectorAll("[data-tyre]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tyre") === plannedTyre)); });
        var box = $("[data-box]"); box.classList.toggle("is-armed", !!me.pitNext); box.textContent = me.pitNext ? "BOXING → " + plannedTyre + " (cancel)" : "BOX THIS LAP";
        stage.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-mode") === me.mode); });
        $("[data-speed]").textContent = speed + "×";
      }

      /* ---------- loop ---------- */
      function frame(ts) {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        var dt = Math.min(0.1, (ts - last) / 1000); last = ts;
        if (paused) return;
        step(dt * SIM_PER_SEC * speed);
        if (!alive) return;
        drawCars();
        uiT += dt; if (uiT > 0.25) { uiT = 0; drawTower(); }
      }

      /* ---------- player actions ---------- */
      function setTyre(k) { plannedTyre = k; if (me.pitNext) me.nextTyre = k; syncControls(); }
      function toggleBox() {
        if (!alive || me.finished) return;
        me.pitNext = !me.pitNext; me.nextTyre = me.pitNext ? plannedTyre : null;
        radio(me.pitNext ? "Copy, box this lap for " + TYRES[plannedTyre].name + "s." : "Stay out, stay out.", me.pitNext ? "ok" : "");
        syncControls(); drawTower();
      }
      function setMode(m) { me.mode = m; radio(m === "push" ? "Push now, push. Tyres will suffer." : m === "save" ? "Lift and coast, look after the tyres." : "Normal mode."); syncControls(); }

      /* ---------- screens ---------- */
      function start(tyre) {
        setup(); me.tyre = tyre; me.used = {}; me.used[tyre] = 1; me.lapTime = lapTime(me, 0);
        plannedTyre = tyre === "S" ? "M" : tyre === "M" ? "H" : "M";
        alive = true; paused = false; last = 0; speed = 1; lastLeaderLap = 0;
        Object.keys(dots).forEach(function (k) { dots[k].remove(); }); dots = {};
        api.clearOverlay();
        radio("Lights out and away we go! P" + startPos + " on " + TYRES[tyre].name + "s.", "ok");
        syncControls(); drawCars(); drawTower();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      }
      function over() {
        alive = false; cancelAnimationFrame(raf);
        var dry = !wasWet, dryUsed = Object.keys(me.used).filter(function (k) { return TYRES[k].dry; }).length, penalty = dry && dryUsed < 2;
        if (penalty) me.finishT += 10;
        var res = cars.slice().sort(function (a, b) { return a.finishT - b.finishT; }), p = res.indexOf(me);
        var score = (POINTS[p] || 0) * 100 + Math.max(0, startPos - 1 - p) * 60 + (fastest.car === me ? 200 : 0);
        var b = api.best(score, { position: p + 1, rain: wasWet });
        if (p === 0) api.emit("win"); if (p < 3 && wasWet) api.emit("rain_podium");
        var table = res.slice(0, 10).map(function (c, k) {
          return '<li class="' + (c === me ? "is-me" : "") + '"><b>' + (k + 1) + '</b><i style="background:' + c.color + '"></i>' + esc(c.name) + '<span>' + (k === 0 ? fmtLap(c.finishT / LAPS) + " avg" : fmtGap(c.finishT - res[0].finishT)) + "</span></li>";
        }).join("");
        var head = '<p class="arcade__kicker">$ chequered flag</p><h3>' + (p === 0 ? "P1. What a call! 🏆" : p < 3 ? "P" + (p + 1) + ". Podium!" : "P" + (p + 1)) + "</h3>" +
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
        setup(); drawCars(); syncControls();
        $("[data-radio]").innerHTML = '<span class="dim">radio check… loud and clear.</span>';
        api.hud('<span>best <b>' + best + "</b></span>");
        api.overlay('<p class="arcade__kicker">$ bin/race --laps ' + LAPS + "</p><h3>Pit Wall</h3>" +
          "<p>You're the race engineer for the <b>gold car</b>. Call the pit stops, choose tyres and set the driver mode. Watch the forecast: rain and safety cars change everything.</p>" +
          '<ul class="sr__legend"><li><b class="pw__ty pw__ty--S">S</b> soft: fastest, wears quickly</li><li><b class="pw__ty pw__ty--M">M</b> medium</li><li><b class="pw__ty pw__ty--H">H</b> hard: slow, lasts</li><li><b class="pw__ty pw__ty--I">I</b> inter / <b class="pw__ty pw__ty--W">W</b> wet: for rain</li></ul>' +
          '<p class="muted">Dry race: use two different dry compounds or take +10 s. Pit stops cost ~21 s, about half under the safety car.</p>' +
          '<p class="pw__lbl">start on</p><div class="pw__start-tyres"><button class="btn btn--primary" type="button" data-pw-start="S">softs</button><button class="btn" type="button" data-pw-start="M">mediums</button><button class="btn" type="button" data-pw-start="H">hards</button></div>');
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
      if (race) start("M");
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
