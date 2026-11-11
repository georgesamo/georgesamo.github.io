/* Gem Match · match-3 with gems from the Gemfile + power-ups
 *
 * Power-ups (classic match-3 mechanics, Rails-flavoured):
 *   match 4 in a line  -> Pipeline   (striped)  clears its row or column
 *   L / T shape        -> Force push (bomb)     clears a 3x3 area
 *   match 5 in a line  -> Bundle     (rainbow)  swap with a gem: clears every gem of that kind
 *   swap two power-ups -> combo (cross, 3-wide cross, 5x5, convert-all, clear board)
 *   refills occasionally drop a random Pipeline / Force push
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var N = 8, MOVES = 30, RANDOM_SPECIAL = 0.03, MAX_RANDOM_SPECIALS = 3;
  var TYPES = [
    { id: "rb", name: "Ruby", done: "irb(main)> ✓" },
    { id: "pg", name: "PostgreSQL", done: "VACUUM complete" },
    { id: "sk", name: "Sidekiq", done: "queue drained" },
    { id: "rd", name: "Redis", done: "cache warmed" },
    { id: "rs", name: "RSpec", done: "0 failures" },
    { id: "dk", name: "Docker", done: "container shipped" }
  ];
  var COLOR = -1; // type of the Bundle orb
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var isLine = function (g) { return g && (g.sp === "h" || g.sp === "v"); };

  window.SamukaArcade.register("gems", {
    title: "gem-match.rb",
    blurb: "Match three gems from the Gemfile. Power-ups: Pipeline, Force push, Bundle.",
    mount: function (stage, api) {
      var T = api.reduced ? 0.01 : 1;  // animation time scale
      var rng = api.rng, daily = api.mode === "daily", race = api.mode === "race" && api.opts.race;
      var MOVES_RUN = daily || race ? 20 : MOVES, moveLog = [], moveStart = 0;
      var board = [], cells = [], sel = -1, focusI = 0, busy = false, alive = false;
      var score = 0, moves = MOVES_RUN, best = api.peekBest(), hintTimer = 0, uid = 0, combo = 0;

      stage.innerHTML = '<div class="gm"><div class="gm__board" data-board role="grid" aria-label="Gem board"></div>' +
        '<div class="gm__boost" data-boost><span class="gm__meter" title="Deploy meter: scoring fills it and earns booster charges"><i data-meter></i></span><b class="gm__charges" data-charges>0</b>' +
        '<button type="button" data-boost-use="hammer" title="rails console: smash one gem (H)">🔨 smash</button>' +
        '<button type="button" data-boost-use="shuffle" title="bundle update: reshuffle the board">🔀 shuffle</button>' +
        '<button type="button" data-boost-use="moves" title="+2 moves">➕2 moves</button></div></div>';
      var boardEl = stage.querySelector("[data-board]");
      // boosters: the deploy meter fills as you score; each fill = 1 charge (max 3), every fill needs a bit more
      var charges = 0, meterAt = 0, meterNext = 1000, hammer = false, boostsUsed = 0;
      for (var i = 0; i < N * N; i++) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "gm__cell"; b.dataset.i = i; b.tabIndex = i === 0 ? 0 : -1;
        b.setAttribute("role", "gridcell");
        b.innerHTML = '<span class="gm__gem"><i></i><em></em></span>';
        boardEl.appendChild(b); cells.push(b);
      }
      api.foot("<span>Swap neighbours to line up 3+. <b>4</b> = Pipeline (row/column) · <b>L/T</b> = Force push (3×3) · <b>5</b> = Bundle (clears a kind). Swap two power-ups for a combo. Click, swipe, or <kbd>←↑↓→</kbd> + <kbd>Enter</kbd>.</span>");

      /* ---------- board helpers ---------- */
      var rnd = function () { return (rng() * TYPES.length) | 0; };
      var R = function (i) { return Math.floor(i / N); }, C = function (i) { return i % N; };
      function gem(t, sp) { return { t: t, id: ++uid, sp: sp || null }; }
      function sameType(i, j) { return board[i] && board[j] && board[i].t !== COLOR && board[i].t === board[j].t; }
      function fill() {
        board = [];
        for (var i = 0; i < N * N; i++) {
          var t, r = R(i), c = C(i);
          do { t = rnd(); } while ((c >= 2 && board[i - 1].t === t && board[i - 2].t === t) || (r >= 2 && board[i - N].t === t && board[i - 2 * N].t === t));
          board.push(gem(t));
        }
        if (!findMove()) return fill();
        board[(rng() * N * N) | 0].sp = "bomb"; // one Force push to discover the mechanic
      }
      function specialsOnBoard() { return board.filter(function (g) { return g && g.sp; }).length; }

      /* runs of 3+ with direction; colour orbs never match */
      function runs() {
        var out = [], r, c, len, k, cs;
        for (r = 0; r < N; r++) for (c = 0; c < N;) {
          len = 1; while (c + len < N && sameType(r * N + c, r * N + c + len)) len++;
          if (len >= 3 && board[r * N + c].t !== COLOR) { cs = []; for (k = 0; k < len; k++) cs.push(r * N + c + k); out.push({ cells: cs, t: board[r * N + c].t, dir: "h" }); }
          c += len;
        }
        for (c = 0; c < N; c++) for (r = 0; r < N;) {
          len = 1; while (r + len < N && sameType(r * N + c, (r + len) * N + c)) len++;
          if (len >= 3 && board[r * N + c].t !== COLOR) { cs = []; for (k = 0; k < len; k++) cs.push((r + k) * N + c); out.push({ cells: cs, t: board[r * N + c].t, dir: "v" }); }
          r += len;
        }
        return out;
      }
      function swap(a, b) { var x = board[a]; board[a] = board[b]; board[b] = x; }
      function adjacent(a, b) { return Math.abs(R(a) - R(b)) + Math.abs(C(a) - C(b)) === 1; }
      function swapActivates(a, b) {
        var x = board[a], y = board[b];
        return !!(x && y && (x.t === COLOR || y.t === COLOR || (x.sp && y.sp)));
      }
      function findMove() {
        for (var i = 0; i < N * N; i++) {
          var nb = [C(i) < N - 1 ? i + 1 : -1, i + N < N * N ? i + N : -1];
          for (var k = 0; k < 2; k++) {
            var j = nb[k]; if (j < 0) continue;
            if (swapActivates(i, j)) return [i, j];
            swap(i, j); var ok = runs().length > 0; swap(i, j);
            if (ok) return [i, j];
          }
        }
        return null;
      }

      /* ---------- rendering ---------- */
      // writes only what changed, and restarts drop/born animations with ONE reflow for the whole board
      function paint(fall, born) {
        var anim = [];
        cells.forEach(function (el, i) {
          var g = board[i];
          var cls = "gm__cell";
          if (!g) cls += " is-empty";
          else {
            cls += g.t === COLOR ? " gm--cb" : " gm--" + TYPES[g.t].id;
            if (g.sp) cls += " sp-" + g.sp;
          }
          if (i === sel) cls += " is-sel";
          if (hammer && g) cls += " is-target";
          var drop = fall && fall[i], bn = born && born[i];
          if (drop) el.style.setProperty("--fall", fall[i]);
          if (drop || bn) anim.push([el, drop ? " is-drop" : "", bn ? " is-born" : ""]);
          else if (el.className !== cls) el.className = cls;   // also clears stale nope/hint/drop classes
          el.__cls = cls;
          var label = !g ? "empty" : g.t === COLOR ? "Bundle power-up" : TYPES[g.t].name + (g.sp === "bomb" ? " Force push" : isLine(g) ? " Pipeline" : "");
          label += ", row " + (R(i) + 1) + " column " + (C(i) + 1);
          if (el.__lbl !== label) { el.__lbl = label; el.setAttribute("aria-label", label); }
          var em = !g ? "" : g.t === COLOR ? "✦" : TYPES[g.t].id;
          if (el.__em !== em) { el.__em = em; el.querySelector("em").textContent = em; }
        });
        if (!anim.length) return;
        anim.forEach(function (a) { a[0].className = a[0].__cls; });
        void boardEl.offsetWidth;
        anim.forEach(function (a) { a[0].className = a[0].__cls + a[1] + a[2]; });
      }
      function paintBoost() {
        var span = meterNext - meterAt, pct = charges >= 3 ? 1 : Math.max(0, Math.min(1, (score - meterAt) / span));
        stage.querySelector("[data-meter]").style.transform = "scaleX(" + pct.toFixed(3) + ")";
        stage.querySelector("[data-charges]").textContent = charges;
        stage.querySelectorAll("[data-boost-use]").forEach(function (b) {
          var k = b.getAttribute("data-boost-use");
          b.disabled = !alive || busy || !charges;
          b.classList.toggle("is-armed", k === "hammer" && hammer);
        });
      }
      function meterCheck() {
        while (score >= meterNext) {
          meterAt = meterNext; meterNext += 1000 + 500 * (boostsUsed + charges + 1);
          if (charges < 3) { charges++; api.toast("🚀 booster charged · " + charges + " ready", "ok"); }
        }
        paintBoost();
      }
      function hud() {
        if (alive) meterCheck(); else paintBoost();
        if (race && alive) race.tick(score, MOVES_RUN - moves, 0);
        api.hud('<span>score <b>' + score + '</b></span><span>moves <b' + (moves <= 5 ? ' class="low"' : "") + ">" + moves + '</b></span><span class="hide-sm">best <b>' + Math.max(best, score) + "</b></span>");
      }
      function cellBox(i) {
        var r = cells[i].getBoundingClientRect(), s = boardEl.getBoundingClientRect();
        return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
      }
      function float(text, i, cls) {
        var el = document.createElement("span");
        el.className = "gm__float " + (cls || "");
        el.textContent = text;
        var r = cells[i].getBoundingClientRect(), s = stage.getBoundingClientRect();
        el.style.left = (r.left - s.left + r.width / 2) + "px";
        el.style.top = (r.top - s.top) + "px";
        stage.appendChild(el);
        setTimeout(function () { el.remove(); }, 950);
      }
      /* blast visuals */
      function beam(i, dir) {
        var bx = cellBox(i), el = document.createElement("div");
        el.className = "gm__beam gm__beam--" + dir;
        if (dir === "h") { el.style.top = (bx.y + bx.h / 2) + "px"; }
        else { el.style.left = (bx.x + bx.w / 2) + "px"; }
        boardEl.appendChild(el);
        setTimeout(function () { el.remove(); }, 520);
      }
      function shock(i, radius) {
        var bx = cellBox(i), el = document.createElement("div");
        el.className = "gm__shock";
        el.style.left = (bx.x + bx.w / 2) + "px"; el.style.top = (bx.y + bx.h / 2) + "px";
        el.style.setProperty("--size", (bx.w * (radius * 2 + 1) * 1.15) + "px");
        boardEl.appendChild(el);
        setTimeout(function () { el.remove(); }, 560);
      }
      function shake(strength) {
        boardEl.style.setProperty("--shake", strength + "px");
        boardEl.classList.remove("is-shake"); void boardEl.offsetWidth; boardEl.classList.add("is-shake");
      }

      /* ---------- what a power-up clears ---------- */
      function area(i, rad) {
        var out = [];
        for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) {
          var r = R(i) + dr, c = C(i) + dc;
          if (r >= 0 && r < N && c >= 0 && c < N) out.push(r * N + c);
        }
        return out;
      }
      function row(r) { var o = []; for (var c = 0; c < N; c++) o.push(r * N + c); return o; }
      function col(c) { var o = []; for (var r = 0; r < N; r++) o.push(r * N + c); return o; }
      function mostCommonType() {
        var n = {}; board.forEach(function (g) { if (g && g.t !== COLOR) n[g.t] = (n[g.t] || 0) + 1; });
        var bestT = 0, bestN = -1; Object.keys(n).forEach(function (t) { if (n[t] > bestN) { bestN = n[t]; bestT = +t; } });
        return bestT;
      }
      function ofType(t) { var o = []; board.forEach(function (g, i) { if (g && g.t === t) o.push(i); }); return o; }
      function effect(i, g) {   // returns cells hit, and plays the visual
        if (g.sp === "h") { beam(i, "h"); api.emit("pipeline"); return row(R(i)); }
        if (g.sp === "v") { beam(i, "v"); api.emit("pipeline"); return col(C(i)); }
        if (g.sp === "bomb") { shock(i, 1); shake(4); return area(i, 1); }
        if (g.t === COLOR) { var t = mostCommonType(); zap(ofType(t)); return ofType(t); }
        return [];
      }
      function zap(list) { list.forEach(function (j) { cells[j].classList.add("is-zap"); }); }

      /* chain reaction: any power-up caught in a blast fires too */
      function expand(set, fired) {
        var queue = Object.keys(set).map(Number);
        while (queue.length) {
          var i = queue.shift(), g = board[i];
          if (!g || fired[i] || !(g.sp || g.t === COLOR)) continue;
          fired[i] = true;
          effect(i, g).forEach(function (j) { if (!set[j]) { set[j] = true; queue.push(j); } });
        }
        return set;
      }

      /* clear a set of cells, place newly created power-ups, drop + refill */
      async function clearCells(set, creations, fired) {
        expand(set, fired || {});
        var keys = Object.keys(set).map(Number);
        if (!keys.length) return;
        keys.forEach(function (k) { cells[k].classList.add("is-pop"); });
        await wait(260 * T);
        keys.forEach(function (k) { board[k] = null; cells[k].classList.remove("is-pop", "is-zap"); });
        score += keys.length * 10 * Math.max(1, combo);
        var born = {};
        (creations || []).forEach(function (cr) { board[cr.i] = gem(cr.t, cr.sp); born[cr.i] = true; });
        // gravity + refill, tracking fall distance for the drop animation
        var fall = {}, randomLeft = MAX_RANDOM_SPECIALS - specialsOnBoard();
        for (var c = 0; c < N; c++) {
          var write = N - 1;
          for (var r = N - 1; r >= 0; r--) {
            var i = r * N + c;
            if (board[i]) { var to = write * N + c; if (to !== i) { board[to] = board[i]; board[i] = null; fall[to] = write - r; if (born[i]) { born[to] = true; delete born[i]; } } write--; }
          }
          for (var rr = write; rr >= 0; rr--) {
            var sp = null;
            if (randomLeft > 0 && rng() < RANDOM_SPECIAL) { sp = ["h", "v", "bomb", "bomb"][(rng() * 4) | 0]; randomLeft--; }
            board[rr * N + c] = gem(rnd(), sp);
            fall[rr * N + c] = write + 1;
          }
        }
        paint(fall, born); hud();
        await wait(300 * T);
      }

      /* turn matched runs into a clear-set + power-up creations */
      function analyze(rs, swapped) {
        var set = {}, creations = [], used = {};
        rs.forEach(function (run) { run.cells.forEach(function (c) { set[c] = true; }); });
        function pivot(run) {
          for (var k = 0; k < swapped.length; k++) if (run.cells.indexOf(swapped[k]) > -1) return swapped[k];
          return run.cells[Math.floor(run.cells.length / 2)];
        }
        // 5 in a line -> Bundle
        rs.forEach(function (run, ri) {
          if (run.cells.length >= 5) { used[ri] = true; creations.push({ i: pivot(run), t: COLOR, sp: null, kind: "bundle" }); }
        });
        // L / T (an h-run and a v-run of the same type sharing a cell) -> Force push
        rs.forEach(function (a, ai) {
          if (used[ai] || a.dir !== "h") return;
          rs.forEach(function (b, bi) {
            if (used[ai] || used[bi] || b.dir !== "v" || b.t !== a.t) return;
            var shared = a.cells.filter(function (x) { return b.cells.indexOf(x) > -1; })[0];
            if (shared != null) { used[ai] = used[bi] = true; creations.push({ i: shared, t: a.t, sp: "bomb", kind: "bomb" }); }
          });
        });
        // 4 in a line -> Pipeline (clears across the match direction)
        rs.forEach(function (run, ri) {
          if (used[ri] || run.cells.length !== 4) return;
          used[ri] = true;
          creations.push({ i: pivot(run), t: run.t, sp: run.dir === "h" ? "v" : "h", kind: "line" });
        });
        // don't let two creations claim the same cell
        var seen = {};
        creations = creations.filter(function (c) { if (seen[c.i]) return false; seen[c.i] = true; return true; });
        return { set: set, creations: creations };
      }

      async function resolve(swapped) {
        combo = 0;
        for (;;) {
          var rs = runs();
          if (!rs.length) break;
          combo++;
          var plan = analyze(rs, swapped || []);
          rs.forEach(function (run) {
            var mid = run.cells[Math.floor(run.cells.length / 2)];
            if (combo === 1 && run.cells.length === 3) float(TYPES[run.t].done, mid);
          });
          plan.creations.forEach(function (cr) {
            if (cr.kind === "bundle") { score += 150; float("Bundle ✦ created", cr.i, "mega"); api.emit("bundle"); }
            else if (cr.kind === "bomb") { score += 80; float("Force push 💥 armed", cr.i, "big"); }
            else { score += 50; float("Pipeline ⇶ ready", cr.i, "big"); }
          });
          if (combo >= 2) float("×" + combo + " cascade", rs[0].cells[0], "combo");
          await clearCells(plan.set, plan.creations, {});
          swapped = [];
        }
      }

      /* swapping power-ups together */
      async function activate(a, b) {
        var x = board[a], y = board[b], set = {}, fired = {};
        set[a] = set[b] = true; fired[a] = fired[b] = true;
        combo = 1;
        if (x.t === COLOR && y.t === COLOR) {
          for (var i = 0; i < N * N; i++) set[i] = true;
          zap(Object.keys(set)); shake(9); shock(b, 4);
          api.toast("bundle exec rails db:reset · board cleared!", "ok"); score += 500; api.emit("db_reset");
        } else if (x.t === COLOR || y.t === COLOR) {
          var other = x.t === COLOR ? y : x;
          var targets = ofType(other.t);
          if (other.sp) {
            // every gem of that kind becomes the same power-up, then they all fire
            targets.forEach(function (j) { if (!board[j].sp) board[j].sp = other.sp === "bomb" ? "bomb" : (rng() < 0.5 ? "h" : "v"); });
            paint(); zap(targets);
            api.toast("bundle update " + TYPES[other.t].name + " --all", "ok");
            await wait(420 * T);
            targets.forEach(function (j) { set[j] = true; });
            fired[x.t === COLOR ? b : a] = false; // let the swapped power-up fire as well
            score += 300;
          } else {
            zap(targets);
            targets.forEach(function (j) { set[j] = true; });
            api.toast("bundle remove " + TYPES[other.t].name.toLowerCase() + " (" + targets.length + " gems)", "ok");
            score += 100;
          }
        } else {
          var lines = (isLine(x) ? 1 : 0) + (isLine(y) ? 1 : 0), r = R(b), c = C(b), list = [];
          if (lines === 2) { list = row(r).concat(col(c)); beam(b, "h"); beam(b, "v"); api.toast("CI matrix: row + column", "ok"); score += 120; }
          else if (lines === 0) { list = area(b, 2); shock(b, 2); shake(8); api.toast("git push --force --force 💥💥", "ok"); score += 200; }
          else {
            for (var d = -1; d <= 1; d++) { if (r + d >= 0 && r + d < N) list = list.concat(row(r + d)); if (c + d >= 0 && c + d < N) list = list.concat(col(c + d)); }
            beam(b, "h"); beam(b, "v"); shock(b, 1); shake(6); api.toast("force-pushed pipeline: 3 rows + 3 cols", "ok"); score += 160;
          }
          list.forEach(function (j) { set[j] = true; });
        }
        await clearCells(set, [], fired);
      }

      /* ---------- turn flow ---------- */
      async function animateSwap(a, b) {
        var A = cells[a].getBoundingClientRect(), B = cells[b].getBoundingClientRect();
        var dx = B.left - A.left, dy = B.top - A.top;
        cells[a].style.transform = "translate(" + dx + "px," + dy + "px)";
        cells[b].style.transform = "translate(" + (-dx) + "px," + (-dy) + "px)";
        cells[a].classList.add("is-moving"); cells[b].classList.add("is-moving");
        await wait(170 * T);
        cells[a].classList.remove("is-moving"); cells[b].classList.remove("is-moving");
        cells[a].style.transform = cells[b].style.transform = "";
      }
      async function trySwap(a, b) {
        if (busy || !alive || !adjacent(a, b)) return;
        busy = true; sel = -1; clearHint(); moveStart = score;
        var hadPower = !!(board[a] && (board[a].sp || board[a].t === COLOR)) || !!(board[b] && (board[b].sp || board[b].t === COLOR));
        await animateSwap(a, b);
        swap(a, b); paint();
        if (swapActivates(a, b)) {
          moves--; hud();
          await activate(a, b);
          await resolve([]);
        } else if (runs().length) {
          moves--; hud();
          await resolve([a, b]);
        } else {
          cells[a].classList.add("gm--nope"); cells[b].classList.add("gm--nope");
          await animateSwap(a, b);
          swap(a, b); paint();
          busy = false; armHint(); return;
        }
        busy = false;
        moveLog.push({ pts: score - moveStart, power: hadPower });
        if (moves <= 0) return over();
        if (!findMove()) { api.toast("no moves left · bundle update (shuffle)", "warn"); fill(); paint(); }
        armHint(); paintBoost();
      }

      /* ---------- boosters ---------- */
      function shuffleBoard() {
        for (var tries = 0; tries < 80; tries++) {
          var gs = board.slice();
          for (var i = gs.length - 1; i > 0; i--) { var j = (rng() * (i + 1)) | 0, x = gs[i]; gs[i] = gs[j]; gs[j] = x; }
          board = gs;
          if (!runs().length && findMove()) return;
        }
        fill();
      }
      async function smash(i) {
        if (busy || !alive || !board[i] || !charges) return;
        hammer = false; charges--; boostsUsed++; busy = true; clearHint(); sel = -1;
        api.emit("booster", { kind: "hammer" });
        var set = {}; set[i] = true; combo = 1;
        shock(i, 0); shake(3);
        await clearCells(set, [], {});
        await resolve([]);
        busy = false;
        if (!findMove()) { api.toast("no moves left · bundle update (shuffle)", "warn"); fill(); paint(); }
        armHint(); paint(); paintBoost();
      }
      function useBoost(kind) {
        if (busy || !alive || !charges) return;
        if (kind === "hammer") { hammer = !hammer; sel = -1; paint(); paintBoost(); if (hammer) api.toast("🔨 pick a gem to smash · click 🔨 again to cancel", "ok"); return; }
        charges--; boostsUsed++; hammer = false; clearHint();
        api.emit("booster", { kind: kind });
        if (kind === "shuffle") {
          shuffleBoard();
          var all = {}; for (var i = 0; i < N * N; i++) all[i] = true;
          paint(null, all); api.toast("🔀 bundle update · board reshuffled", "ok");
        } else if (kind === "moves") { moves += 2; api.toast("➕ two more moves", "ok"); }
        hud(); armHint();
      }

      /* ---------- hints ---------- */
      function clearHint() { clearTimeout(hintTimer); cells.forEach(function (c) { c.classList.remove("is-hint"); }); }
      function armHint() {
        clearHint();
        hintTimer = setTimeout(function () {
          var m = findMove(); if (!m || busy) return;
          cells[m[0]].classList.add("is-hint"); cells[m[1]].classList.add("is-hint");
        }, 6000);
      }

      /* ---------- screens ---------- */
      function legendGem(cls, label, em) {
        return '<span class="gm__cell gm__cell--static ' + cls + '"><span class="gm__gem"><i></i><em>' + em + "</em></span></span><span>" + label + "</span>";
      }
      function start() {
        score = 0; moves = MOVES_RUN; sel = -1; alive = true; busy = false; moveLog = [];
        charges = 0; meterAt = 0; meterNext = 1000; hammer = false; boostsUsed = 0;
        api.newRun();   // a fresh seed each run; daily, race and challenge get the same board every time
        fill(); paint(); hud(); api.clearOverlay(); armHint();
        cells[focusI].focus();
      }
      function over() {
        alive = false; clearHint();
        var b = api.best(score, { log: moveLog }); best = b.best;
        if (race) {
          race.over(score, MOVES_RUN);
          api.overlay('<p class="arcade__kicker">$ bundle exec rspec · 20 moves done</p><dl class="arcade__stats"><dt>your score</dt><dd>' + score + '</dd></dl><div class="race-result" data-race-result><p class="muted">waiting for the other player…</p></div>');
          return;
        }
        if (daily) { api.overlay(window.SamukaScores ? window.SamukaScores.dailyCard(score, moveLog) : "<h3>" + score + "</h3>"); return; }
        api.overlay(
          '<p class="arcade__kicker">$ bundle exec rspec</p>' +
          "<h3>" + (score >= 4000 ? "Gemfile.lock: perfection" : score >= 2000 ? "All green" : "Done") + "</h3>" +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>best</dt><dd>" + b.best + "</dd><dt>moves</dt><dd>" + MOVES + "</dd></dl>" +
          '<div class="lb-mini" data-lb-mini="gems"></div>' +
          '<button class="btn btn--primary" type="button" data-gm-start>↻ play again</button>'
        );
      }
      function intro() {
        fill(); paint(); hud();
        if (daily) {
          api.overlay(window.SamukaScores ? window.SamukaScores.dailyIntro(MOVES_RUN) : '<button class="btn btn--primary" type="button" data-gm-start>▶ start</button>');
          return;
        }
        api.overlay(
          '<p class="arcade__kicker">$ gem install match-three</p>' +
          "<h3>Gem Match</h3>" +
          '<div class="gm__legend">' + TYPES.map(function (t) { return legendGem("gm--" + t.id, t.name, t.id); }).join("") + "</div>" +
          "<p>Line up three or more of the same gem. Chains cascade and multiply. You have " + MOVES + " moves.</p>" +
          '<div class="gm__legend gm__legend--power">' +
            legendGem("gm--pg sp-h", "<b>Pipeline</b> · match 4 · clears a row/column", "pg") +
            legendGem("gm--rd sp-bomb", "<b>Force push</b> · L/T shape · blasts 3×3", "rd") +
            legendGem("gm--cb", "<b>Bundle</b> · match 5 · swap to clear a whole kind", "✦") +
          "</div>" +
          '<p class="muted">Swap two power-ups together for a combo. New ones occasionally drop in on their own. Scoring fills the <b>deploy meter</b>: each charge buys a booster (🔨 smash a gem, 🔀 shuffle, ➕2 moves).</p>' +
          '<button class="btn btn--primary" type="button" data-gm-start>▶ bundle exec play</button>'
        );
      }

      /* ---------- input ---------- */
      var down = null;
      function onPointerDown(e) {
        var cell = e.target.closest(".gm__cell"); if (!cell || !alive) return;
        down = { i: +cell.dataset.i, x: e.clientX, y: e.clientY, swiped: false };
      }
      function onPointerMove(e) {
        if (!down || down.swiped) return;
        var dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
        down.swiped = true;
        var r = R(down.i), c = C(down.i), j = -1;
        if (Math.abs(dx) > Math.abs(dy)) j = dx > 0 && c < N - 1 ? down.i + 1 : dx < 0 && c > 0 ? down.i - 1 : -1;
        else j = dy > 0 && r < N - 1 ? down.i + N : dy < 0 && r > 0 ? down.i - N : -1;
        if (j >= 0) trySwap(down.i, j);
      }
      function onPointerUp() { setTimeout(function () { down = null; }, 0); }
      function choose(i) {
        if (busy || !alive) return;
        if (hammer) { smash(i); return; }
        if (sel === -1) { sel = i; paint(); return; }
        if (sel === i) { sel = -1; paint(); return; }
        if (adjacent(sel, i)) trySwap(sel, i);
        else { sel = i; paint(); }
      }
      function onClick(e) {
        if (e.target.closest("[data-gm-start]")) { start(); return; }
        var bt = e.target.closest("[data-boost-use]"); if (bt) { useBoost(bt.getAttribute("data-boost-use")); return; }
        var cell = e.target.closest(".gm__cell"); if (!cell || cell.classList.contains("gm__cell--static")) return;
        if (down && down.swiped) return;
        focusI = +cell.dataset.i;
        choose(focusI);
      }
      function moveFocus(i) { cells[focusI].tabIndex = -1; focusI = i; cells[i].tabIndex = 0; cells[i].focus(); }
      boardEl.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("click", onClick);
      intro();
      if (race) start();

      return {
        key: function (e) {
          if (alive && (e.key === "h" || e.key === "H")) { e.preventDefault(); useBoost("hammer"); return; }
          if (!alive || !boardEl.contains(document.activeElement)) return;
          var r = R(focusI), c = C(focusI), to = -1;
          if (e.key === "ArrowLeft" && c > 0) to = focusI - 1;
          else if (e.key === "ArrowRight" && c < N - 1) to = focusI + 1;
          else if (e.key === "ArrowUp" && r > 0) to = focusI - N;
          else if (e.key === "ArrowDown" && r < N - 1) to = focusI + N;
          else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(focusI); return; }
          if (to >= 0) {
            e.preventDefault();
            if (sel === focusI) trySwap(focusI, to);   // selected + arrow = swap in that direction
            moveFocus(to);
          }
        },
        // test hook (used only by automated playtests)
        _debug: { board: function () { return board; }, place: function (i, t, sp) { board[i] = gem(t, sp); paint(); }, COLOR: COLOR },
        destroy: function () {
          if (race && alive) race.over(score, MOVES_RUN - moves, true); // closing the window forfeits
          alive = false; clearHint();
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          stage.removeEventListener("click", onClick);   // the stage outlives the game: its listener kept the whole old board alive
        }
      };
    }
  });
})();
