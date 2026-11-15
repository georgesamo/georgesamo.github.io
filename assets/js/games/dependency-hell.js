/* Dependency Hell · a daily logic puzzle about Gemfile.lock
 *
 * Every round is a small Gemfile: 4–6 gems, four versions each. The Gemfile asks for some minimums
 * (and maybe a cap), and the gemspecs add rules between gems ("sidekiq >= 7.3 needs redis >= 5.2",
 * "rails >= 8.0 needs rack < 3.2"). Pin one version per gem and run `bundle install`:
 *   - a lock that breaks a rule fails, costs an install (three per round) and shows the rules it broke
 *   - a lock that resolves scores by how fresh it is, against the newest lock that was possible
 * Three rounds (4, 5 and 6 gems), about three minutes. Every puzzle comes from the run's seed, so the
 * daily, challenges and replays are the same lockfiles for everyone. The version rules are made up
 * for the puzzle, not the real gems' requirements.
 *
 * The pure part (generate, solve, check, score) is window.SamukaDepsLogic, for the unit tests.
 */
(function () {
  "use strict";

  var V = 4;   // versions per gem, oldest → newest
  var POOL = [
    ["rails", ["7.0", "7.1", "7.2", "8.0"]],
    ["rack", ["2.2", "3.0", "3.1", "3.2"]],
    ["puma", ["5.6", "6.4", "6.6", "7.0"]],
    ["sidekiq", ["6.5", "7.1", "7.3", "8.0"]],
    ["redis", ["4.8", "5.0", "5.2", "5.4"]],
    ["pg", ["1.2", "1.4", "1.5", "1.6"]],
    ["devise", ["4.7", "4.8", "4.9", "5.0"]],
    ["nokogiri", ["1.13", "1.15", "1.16", "1.18"]],
    ["turbo-rails", ["1.4", "1.5", "2.0", "2.1"]],
    ["rspec-rails", ["5.1", "6.0", "6.1", "7.1"]],
    ["faraday", ["1.10", "2.7", "2.9", "2.12"]],
    ["bootsnap", ["1.16", "1.17", "1.18", "1.19"]]
  ];
  var ROUNDS = [{ n: 4, rules: 4 }, { n: 5, rules: 6 }, { n: 6, rules: 7 }];
  var MULT = [1, 1.5, 2];
  var MAX_INSTALLS = 3;

  /* ---------- the puzzle (pure) ---------- */
  // a rule holds for a lock (array of version indexes)?
  function holds(r, v) {
    if (r.k === "min") return v[r.a] >= r.i;
    if (r.k === "max") return v[r.a] < r.j;
    if (v[r.a] < r.i) return true;
    return r.k === "need" ? v[r.b] >= r.j : v[r.b] < r.j;   // "cap"
  }
  function broken(p, v) { var out = []; for (var k = 0; k < p.rules.length; k++) if (!holds(p.rules[k], v)) out.push(k); return out; }
  function sum(v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s; }

  // every lock of the puzzle: the feasible ones, the freshest and stalest feasible sums, and whether
  // each rule matters (some lock breaks that rule alone)
  function solve(p) {
    var n = p.gems.length, total = Math.pow(V, n), v = [], i, k;
    var feasible = 0, opt = -1, minF = Infinity, best = [], matters = p.rules.map(function () { return false; });
    for (i = 0; i < n; i++) v.push(0);
    for (var c = 0; c < total; c++) {
      var x = c; for (i = 0; i < n; i++) { v[i] = x % V; x = (x / V) | 0; }
      var bad = -1, nb = 0;
      for (k = 0; k < p.rules.length && nb < 2; k++) if (!holds(p.rules[k], v)) { bad = k; nb++; }
      if (nb === 1) matters[bad] = true;
      if (nb) continue;
      feasible++;
      var s = sum(v);
      if (s < minF) minF = s;
      if (s > opt) { opt = s; best = [v.slice()]; } else if (s === opt) best.push(v.slice());
    }
    return { feasible: feasible, total: total, opt: opt, minF: minF === Infinity ? -1 : minF, best: best, matters: matters };
  }

  function generate(rng, round) {
    var cfg = ROUNDS[round] || ROUNDS[ROUNDS.length - 1], n = cfg.n, maxSum = n * (V - 1);
    var int = function (a, b) { return a + Math.floor(rng() * (b - a + 1)); };
    var p, s, tries = 0, spare = null;
    for (; tries < 400; tries++) {
      var loose = tries >= 200;   // the strict bar finds a puzzle within a few dozen tries almost always
      var idx = POOL.map(function (_, i) { return i; });
      for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      var gems = idx.slice(0, n).map(function (q) { return { name: POOL[q][0], vers: POOL[q][1] }; });
      var rules = [], pairs = {};
      // the Gemfile: one or two minimums, sometimes a cap
      var mins = round === 0 ? 1 : 2;
      for (var m = 0; m < mins; m++) rules.push({ k: "min", a: m, i: int(1, 2) });
      if (rng() < 0.5) rules.push({ k: "max", a: int(mins, n - 1), j: int(2, 3) });
      // the gemspecs: rules between two different gems, at most one per pair
      var guard = 0, specs = [];
      while (specs.length < cfg.rules && guard++ < 60) {
        var a = int(0, n - 1), b = int(0, n - 1);
        if (a === b || pairs[a + "-" + b] || pairs[b + "-" + a]) continue;
        pairs[a + "-" + b] = 1;
        specs.push(rng() < 0.6 ? { k: "need", a: a, i: int(1, 3), b: b, j: int(1, 3) } : { k: "cap", a: a, i: int(1, 3), b: b, j: int(1, 3) });
      }
      specs.sort(function (x, y) { return x.a - y.a || x.b - y.b; });   // read top to bottom, gem by gem
      rules = rules.concat(specs);
      p = { gems: gems, rules: rules, round: round };
      s = solve(p);
      if (s.feasible === 0 || s.opt >= maxSum) continue;
      if (!spare) spare = { p: p, s: s };                             // the last resort: solvable, newest-everything fails
      if (s.opt > maxSum - (loose ? 2 : 3) || s.opt < maxSum - 7) continue;   // newest-everything is off, but not hopelessly
      if (s.best.length > (loose ? 4 : 2)) continue;                  // one or two freshest locks
      if (s.opt - s.minF < 3) continue;                               // a safe old lock scores clearly less
      if (s.matters.some(function (x) { return !x; })) continue;      // no rule that never matters
      if (s.feasible / s.total > (loose ? 0.45 : 0.3)) continue;      // the rules have to bite
      break;
    }
    if (tries >= 400 && spare) { p = spare.p; s = spare.s; }
    else if (tries >= 400) {   // never seen in practice; still a fair puzzle rather than a broken one
      p = { gems: p.gems, rules: [{ k: "min", a: 0, i: 1 }, { k: "cap", a: 0, i: 1, b: 1, j: 2 }], round: round };
      s = solve(p);
    }
    p.solution = s;
    p.tries = tries;
    return p;
  }

  function verText(p, g, i) { return p.gems[g].vers[i]; }
  function ruleText(p, r) {
    var g = function (x) { return p.gems[x].name; };
    if (r.k === "min") return { gemfile: true, text: 'gem "' + g(r.a) + '", ">= ' + verText(p, r.a, r.i) + '"' };
    if (r.k === "max") return { gemfile: true, text: 'gem "' + g(r.a) + '", "< ' + verText(p, r.a, r.j) + '"' };
    return { gemfile: false, lhs: g(r.a) + " >= " + verText(p, r.a, r.i), rhs: g(r.b) + (r.k === "need" ? " >= " : " < ") + verText(p, r.b, r.j) };
  }
  function mentions(r, gem) { return r.a === gem || r.b === gem; }

  // points for a round: freshness against the freshest possible lock, minus failed installs, plus speed
  function roundScore(o) {
    if (!o.resolved) return 0;
    var span = o.opt - o.minF, fresh = span > 0 ? Math.max(0, Math.min(1, (o.sum - o.minF) / span)) : 1;
    var base = Math.max(100, 400 + Math.round(600 * fresh) - 150 * (o.fails || 0));
    var speed = Math.max(0, 300 - 3 * Math.floor(o.secs || 0));
    return Math.round((base + speed) * (MULT[o.round] || 1));
  }
  // one line per round for the share grid: ⬛ per failed install, then 🟩 freshest / 🟨 resolved / 🟥 gave up
  function gridLine(o) {
    if (!o.resolved) return new Array(Math.max(0, (o.fails || 0) - 1) + 1).join("⬛") + "🟥";
    return new Array((o.fails || 0) + 1).join("⬛") + (o.sum >= o.opt ? "🟩" : "🟨");
  }

  var Logic = { POOL: POOL, ROUNDS: ROUNDS, V: V, MAX_INSTALLS: MAX_INSTALLS, holds: holds, broken: broken, solve: solve, generate: generate,
    ruleText: ruleText, roundScore: roundScore, gridLine: gridLine, sum: sum };
  window.SamukaDepsLogic = Logic;

  if (!window.SamukaArcade) return;

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return Number(n || 0).toLocaleString("en-US"); };

  window.SamukaArcade.register("deps", {
    title: "dependency-hell.rb",
    blurb: "Pin every gem so bundle install resolves, on the newest versions you can.",
    logic: Logic,
    mount: function (stage, api) {
      var daily = api.mode === "daily";
      var best = api.peekBest();
      var puzzles = [], round = 0, pins = [], cur = 0, fails = 0, lastBroken = [], lastFailed = "", results = [], score = 0;
      var playing = false, roundStart = 0, pausedMs = 0, hiddenAt = 0, tick = null, gone = false;

      stage.innerHTML =
        '<div class="dh">' +
          '<section class="dh__lock" aria-label="Your Gemfile.lock">' +
            '<p class="dh__label"><span>Gemfile.lock</span> <span class="dh__round" data-round></span></p>' +
            '<div class="dh__rows" data-rows></div>' +
          "</section>" +
          '<section class="dh__rules" aria-label="Rules">' +
            '<p class="dh__label">Gemfile</p><ul class="dh__list dh__list--gemfile" data-gemfile></ul>' +
            '<p class="dh__label">gemspec rules</p><ul class="dh__list" data-specs></ul>' +
          "</section>" +
          '<div class="dh__act">' +
            '<button class="btn btn--primary dh__install" type="button" data-dh-install><span class="btn__prompt">$</span> bundle install</button>' +
            '<p class="dh__out" data-out role="status" aria-live="polite"></p>' +
          "</div>" +
        "</div>";
      api.foot('<span><kbd>↑</kbd><kbd>↓</kbd> gem · <kbd>←</kbd><kbd>→</kbd> or <kbd>1</kbd>–<kbd>4</kbd> version · <kbd>Enter</kbd> bundle install. Tap a version to pin it. Rules light up for the gem you\'re on.</span>');
      var rowsEl = stage.querySelector("[data-rows]"), gemfileEl = stage.querySelector("[data-gemfile]"), specsEl = stage.querySelector("[data-specs]");
      var outEl = stage.querySelector("[data-out]"), roundEl = stage.querySelector("[data-round]"), installBtn = stage.querySelector("[data-dh-install]");

      function P() { return puzzles[round]; }
      function secs() { return Math.max(0, (Date.now() - roundStart - pausedMs) / 1000); }
      function bonusLeft() { return Math.max(0, 300 - 3 * Math.floor(secs())); }

      /* ---------- drawing ---------- */
      function drawBoard() {
        var p = P();
        rowsEl.innerHTML = p.gems.map(function (g, r) {
          return '<div class="dh__row" data-row="' + r + '"><span class="dh__gem" id="dh-gem-' + r + '">' + esc(g.name) + "</span>" +
            '<div class="dh__vers" role="radiogroup" aria-labelledby="dh-gem-' + r + '">' + g.vers.map(function (v, i) {
              return '<button type="button" class="dh__v" role="radio" data-r="' + r + '" data-v="' + i + '" aria-checked="false" tabindex="-1" aria-label="' + esc(g.name + " " + v) + '">' + esc(v) + "</button>";
            }).join("") + "</div></div>";
        }).join("");
        var gf = [], sp = [];
        p.rules.forEach(function (r, k) {
          var t = ruleText(p, r);
          if (t.gemfile) gf.push('<li data-rule="' + k + '"><code>' + esc(t.text) + "</code></li>");
          else sp.push('<li data-rule="' + k + '"><code>' + esc(t.lhs) + '</code><span class="dh__arrow" aria-label="needs"> → </span><code>' + esc(t.rhs) + "</code></li>");
        });
        gemfileEl.innerHTML = gf.join("");
        specsEl.innerHTML = sp.join("");
        roundEl.textContent = "· round " + (round + 1) + "/" + ROUNDS.length + " · " + p.gems.length + " gems";
        paint();
      }
      function paint() {
        var p = P(); if (!p) return;
        var bad = {}, badGem = {};
        lastBroken.forEach(function (k) { bad[k] = 1; var r = p.rules[k]; badGem[r.a] = 1; if (r.b != null) badGem[r.b] = 1; });
        rowsEl.querySelectorAll(".dh__row").forEach(function (row) {
          var r = +row.getAttribute("data-row");
          row.classList.toggle("is-cur", r === cur && playing);
          row.classList.toggle("is-bad", !!badGem[r]);
          row.querySelectorAll(".dh__v").forEach(function (b) {
            var on = pins[r] === +b.getAttribute("data-v");
            b.setAttribute("aria-checked", on ? "true" : "false");
            b.classList.toggle("is-on", on);
            b.tabIndex = on && r === cur ? 0 : -1;
          });
        });
        stage.querySelectorAll("[data-rule]").forEach(function (li) {
          var k = +li.getAttribute("data-rule"), r = p.rules[k];
          li.classList.toggle("is-focus", playing && mentions(r, cur));
          li.classList.toggle("is-broken", !!bad[k]);
        });
        installBtn.disabled = !playing;
      }
      function hud() {
        var dots = ""; for (var i = 0; i < MAX_INSTALLS; i++) dots += i < MAX_INSTALLS - fails ? "●" : "○";
        api.hud("<span>round <b>" + Math.min(round + 1, ROUNDS.length) + "/" + ROUNDS.length + "</b></span><span>score <b>" + fmt(score) + "</b></span>" +
          '<span title="installs left this round">installs <b>' + dots + "</b></span>" +
          (playing ? '<span class="hide-sm">speed bonus <b>' + bonusLeft() + "</b></span>" : "") +
          (daily ? "" : '<span class="hide-sm">best <b>' + fmt(Math.max(best, score)) + "</b></span>"));
      }
      function flash(cls) {
        if (api.reduced) return;   // calm mode / reduced motion: no shake or glow, the text says it all
        var el = stage.querySelector(".dh__lock");
        el.classList.remove("is-shake", "is-glow"); void el.offsetWidth; el.classList.add(cls);
      }
      function focusCur() {   // roving focus: the pinned version of the current gem
        var b = rowsEl.querySelector('.dh__v[data-r="' + cur + '"][data-v="' + pins[cur] + '"]');
        if (b) b.focus({ preventScroll: true });
      }

      /* ---------- playing ---------- */
      function pin(r, v) {
        if (!playing) return;
        var p = P();
        cur = Math.max(0, Math.min(p.gems.length - 1, r));
        if (v != null) pins[cur] = Math.max(0, Math.min(V - 1, v));
        // a rule shown as broken by the last install stays red until a pin fixes it
        lastBroken = lastBroken.filter(function (k) { return !holds(p.rules[k], pins); });
        paint();
      }
      function install() {
        if (!playing) return;
        var p = P(), brk = broken(p, pins), t = secs();
        // the same lock that just failed: say so instead of spending an install (a double Enter, a stray tap)
        if (brk.length && lastFailed === pins.join()) { api.toast("same lock as last time: change a pin first", "warn"); return; }
        if (brk.length) {
          fails++; lastBroken = brk; lastFailed = pins.join();
          api.emit("conflict", { round: round, rules: brk.length });
          var first = p.rules[brk[0]], gname = p.gems[first.b != null ? first.b : first.a].name;
          outEl.className = "dh__out is-err";
          outEl.innerHTML = 'Bundler could not find compatible versions for gem "' + esc(gname) + '": ' + brk.length + " rule" + (brk.length > 1 ? "s" : "") + " broken (in red)." +
            (fails < MAX_INSTALLS ? " " + (MAX_INSTALLS - fails) + " install" + (MAX_INSTALLS - fails > 1 ? "s" : "") + " left." : "");
          flash("is-shake"); paint(); hud();
          if (fails < MAX_INSTALLS) api.toast("✗ " + brk.length + " rule" + (brk.length > 1 ? "s" : "") + " broken · " + (MAX_INSTALLS - fails) + " install" + (MAX_INSTALLS - fails > 1 ? "s" : "") + " left", "warn");
          if (fails >= MAX_INSTALLS) endRound(false, t);
          return;
        }
        endRound(true, t);
      }
      function endRound(ok, t) {
        playing = false; clearInterval(tick);
        var p = P(), sol = p.solution, mine = sum(pins);
        var res = { round: round, resolved: ok, sum: mine, opt: sol.opt, minF: sol.minF, fails: fails, secs: t };
        res.pts = roundScore(res);
        results.push(res); score += res.pts;
        api.emit(ok ? "resolved" : "gave_up", { round: round, fresh: ok && mine >= sol.opt, pts: res.pts });
        if (ok) { outEl.className = "dh__out is-ok"; outEl.textContent = "Bundle complete! " + p.gems.length + " gems now installed."; flash("is-glow"); }
        paint(); hud();
        // the freshest lock that was possible, closest to yours
        var near = sol.best.slice().sort(function (a, b) { return diff(a) - diff(b); })[0];
        function diff(v) { var d = 0; for (var i = 0; i < v.length; i++) if (v[i] !== pins[i]) d++; return d; }
        var lines = p.gems.map(function (g, i) {
          var same = near[i] === pins[i];
          return "<li" + (same ? "" : ' class="is-diff"') + "><code>" + esc(g.name) + " (" + esc(g.vers[ok ? pins[i] : near[i]]) + ")</code>" +
            (ok && !same ? ' <span class="dh__could">' + esc(g.vers[near[i]]) + " was possible</span>" : "") + "</li>";
        }).join("");
        var last = round >= ROUNDS.length - 1;
        var fresh = ok && mine >= sol.opt;
        setTimeout(function () {
          if (gone) return;
          api.overlay(
            (ok ? '<p class="arcade__kicker">$ bundle install · round ' + (round + 1) + "/" + ROUNDS.length + "</p><h3>" + (fresh ? "✓ Freshest lock possible" : "✓ Resolved") + "</h3>"
                : '<p class="arcade__err">Bundler::VersionConflict</p><p class="muted">Out of installs for this Gemfile. This lock would have resolved:</p>') +
            '<ul class="dh__result">' + lines + "</ul>" +
            (ok ? '<dl class="arcade__stats"><dt>freshness</dt><dd>' + (fresh ? "newest possible" : Math.round(100 * (sol.opt - sol.minF > 0 ? (mine - sol.minF) / (sol.opt - sol.minF) : 1)) + "%") + "</dd>" +
              "<dt>failed installs</dt><dd>" + fails + "</dd><dt>time</dt><dd>" + Math.round(t) + " s</dd><dt>round points</dt><dd>+" + fmt(res.pts) + "</dd></dl>" : "") +
            '<button class="btn btn--primary" type="button" data-dh-next>' + (last ? "▶ see the result" : "▶ next Gemfile (" + ROUNDS[round + 1].n + " gems)") + "</button>"
          );
        }, ok && !api.reduced ? 450 : 0);
      }
      function startRound(i) {
        round = i; fails = 0; lastBroken = []; lastFailed = ""; cur = 0; pausedMs = 0; hiddenAt = 0;
        if (!puzzles[round]) puzzles[round] = generate(api.rng, round);
        var p = P();
        pins = p.gems.map(function () { return V - 1; });   // `bundle update` pinned everything to the newest: it won't resolve
        playing = true; roundStart = Date.now();
        api.clearOverlay();
        outEl.className = "dh__out"; outEl.textContent = "bundle update pinned every gem to its newest version. Make it resolve.";
        drawBoard(); hud();
        clearInterval(tick); tick = setInterval(function () { if (playing && !hiddenAt) hud(); }, 1000);
        var b = rowsEl.querySelector('.dh__v[data-r="0"][data-v="' + pins[0] + '"]'); if (b) b.focus({ preventScroll: true });
      }
      function start() {
        api.newRun();   // a fresh seed each run; daily and challenge runs get the same Gemfiles every time
        puzzles = []; results = []; score = 0;
        // all three Gemfiles come from the seed, in order, before anything else draws from it
        for (var i = 0; i < ROUNDS.length; i++) puzzles[i] = generate(api.rng, i);
        startRound(0);
      }
      function finish() {
        playing = false;
        var grid = results.map(gridLine).join("\n");
        var freshAll = results.every(function (r) { return r.resolved && r.sum >= r.opt; });
        if (freshAll) api.emit("all_fresh");
        // the round card goes first: the end-of-run extras (next steps, keep your score, challenge
        // results) attach to whichever card is up when "over" fires, and must find the final one
        api.clearOverlay();
        var b = api.best(score, { grid: grid, rounds: results.map(function (r) { return { ok: r.resolved, fresh: r.resolved && r.sum >= r.opt, fails: r.fails, pts: r.pts }; }) });
        best = b.best; hud();
        if (daily) {
          var S = window.SamukaScores;
          api.overlay(S && S.dailyResult ? S.dailyResult("deps", score, grid) : "<h3>" + fmt(score) + "</h3>");
          return;
        }
        api.overlay(
          '<p class="arcade__kicker">$ bundle exec rake · 3 Gemfiles done</p>' +
          "<h3>" + (freshAll ? "bundle outdated: nothing to update" : score >= 3000 ? "Lockfile committed" : "Shipped, mostly") + "</h3>" +
          '<pre class="daily__grid" aria-label="your rounds">' + esc(grid) + "</pre>" +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + fmt(score) + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>best</dt><dd>" + fmt(b.best) + "</dd>" +
          results.map(function (r, i) { return "<dt>Gemfile " + (i + 1) + "</dt><dd>" + (r.resolved ? "+" + fmt(r.pts) : "conflict") + "</dd>"; }).join("") + "</dl>" +
          '<div class="lb-mini" data-lb-mini="deps"></div>' +
          '<button class="btn btn--primary" type="button" data-dh-start>↻ new Gemfiles</button>'
        );
      }
      function intro() {
        // a demo board behind the card, from its own fixed seed: showing the run's first Gemfile here
        // would let a daily player study it before the clock starts
        puzzles = [generate(window.SamukaArcade.seeded("deps-demo"), 0)]; round = 0; pins = puzzles[0].gems.map(function () { return V - 1; }); drawBoard(); hud();
        var S = window.SamukaScores;
        var rules = '<ul class="sr__legend dh__legend">' +
          "<li>Pin <b>one version per gem</b>, then run <code>bundle install</code>.</li>" +
          "<li>The <b>Gemfile</b> lines must hold, and so must every <b>gemspec rule</b>: <code>sidekiq &gt;= 7.3 → redis &gt;= 5.2</code> means if you pin sidekiq 7.3 or newer, redis has to be 5.2 or newer.</li>" +
          "<li>Newer is better: a lock scores by how close it is to the <b>freshest lock that resolves</b>.</li>" +
          "<li>A failed install shows the broken rules in red and costs one of your <b>3 installs</b>. Faster rounds earn a speed bonus.</li></ul>";
        if (daily) {
          api.overlay('<p class="arcade__kicker">$ bundle install --daily[' + new Date().toISOString().slice(0, 10) + "]</p><h3>Daily #" + (S && S.dailyNo ? S.dailyNo() : "") + " · Dependency Hell</h3>" +
            "<p>Same three Gemfiles for everyone today, one attempt. Your score goes on today's board, and you get a grid to share.</p>" + rules +
            '<button class="btn btn--primary" type="button" data-dh-start>▶ start the daily</button>');
          return;
        }
        api.overlay('<p class="arcade__kicker">$ bundle update && bundle install</p><h3>Dependency Hell</h3>' +
          "<p><code>bundle update</code> pinned every gem to its newest version, and now nothing resolves. Three Gemfiles, 4, 5 and 6 gems: find the freshest lock that installs.</p>" + rules +
          '<p class="muted">The version rules are made up for the puzzle, not the real gems\' requirements.</p>' +
          '<button class="btn btn--primary" type="button" data-dh-start>▶ bundle exec play</button>');
      }

      /* ---------- input ---------- */
      function onClick(e) {
        if (e.target.closest("[data-dh-start]")) { start(); return; }
        if (e.target.closest("[data-dh-next]")) { if (round >= ROUNDS.length - 1) finish(); else startRound(round + 1); return; }
        if (e.target.closest("[data-dh-install]")) { install(); return; }
        var b = e.target.closest(".dh__v");
        if (b && playing) { pin(+b.getAttribute("data-r"), +b.getAttribute("data-v")); b.focus({ preventScroll: true }); return; }
        var row = e.target.closest(".dh__row");
        if (row && playing) { pin(+row.getAttribute("data-row")); focusCur(); }
      }
      function onVis() {
        if (document.hidden) { if (playing && !hiddenAt) hiddenAt = Date.now(); }
        else if (hiddenAt) { pausedMs += Date.now() - hiddenAt; hiddenAt = 0; hud(); }
      }
      stage.addEventListener("click", onClick);
      document.addEventListener("visibilitychange", onVis);
      intro();

      return {
        key: function (e) {
          if (!playing) return;   // overlays: their buttons take Enter / Space as usual
          var p = P(), k = e.key;
          if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); pin(cur + (k === "ArrowUp" ? -1 : 1)); focusCur(); }
          else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); pin(cur, pins[cur] + (k === "ArrowLeft" ? -1 : 1)); focusCur(); }
          else if (/^[1-4]$/.test(k)) { e.preventDefault(); pin(cur, +k - 1); focusCur(); }
          else if (k === "Enter" || k === "i" || k === "I") { e.preventDefault(); install(); }
          else if (k === "Home" || k === "End") { e.preventDefault(); pin(k === "Home" ? 0 : p.gems.length - 1); focusCur(); }
        },
        pause: function () { if (playing && !hiddenAt) hiddenAt = Date.now(); },
        // test hook (automated playtests only): the puzzle, the pins, and a way to pin the freshest lock
        _debug: {
          puzzle: function () { return P(); },
          pins: function () { return pins.slice(); },
          state: function () { return { round: round, playing: playing, fails: fails, score: score, results: results.slice() }; },
          solve: function () { if (playing) { pins = P().solution.best[0].slice(); paint(); } }
        },
        destroy: function () {
          gone = true; playing = false; clearInterval(tick);
          stage.removeEventListener("click", onClick);
          document.removeEventListener("visibilitychange", onVis);
        }
      };
    }
  });
})();
