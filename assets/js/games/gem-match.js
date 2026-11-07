/* Gem Match · match-3 with gems from the Gemfile (click, swipe or keyboard) */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var N = 8, MOVES = 30;
  var TYPES = [
    { id: "rb", name: "Ruby", done: "irb(main)> ✓" },
    { id: "pg", name: "PostgreSQL", done: "VACUUM complete" },
    { id: "sk", name: "Sidekiq", done: "queue drained" },
    { id: "rd", name: "Redis", done: "cache warmed" },
    { id: "rs", name: "RSpec", done: "0 failures" },
    { id: "dk", name: "Docker", done: "container shipped" }
  ];
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  window.SamukaArcade.register("gems", {
    title: "gem-match.rb",
    blurb: "Match three gems from the Gemfile. Cascades multiply your score.",
    mount: function (stage, api) {
      var T = api.reduced ? 0.01 : 1;  // animation time scale
      var board = [], cells = [], sel = -1, focusI = 0, busy = false, alive = false;
      var score = 0, moves = MOVES, best = api.peekBest(), hintTimer = 0, uid = 0;

      stage.innerHTML = '<div class="gm"><div class="gm__board" data-board role="grid" aria-label="Gem board"></div></div>';
      var boardEl = stage.querySelector("[data-board]");
      for (var i = 0; i < N * N; i++) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "gm__cell"; b.dataset.i = i; b.tabIndex = i === 0 ? 0 : -1;
        b.setAttribute("role", "gridcell");
        b.innerHTML = '<span class="gm__gem"><i></i><em></em></span>';
        boardEl.appendChild(b); cells.push(b);
      }
      api.foot("<span>Swap neighbours to line up 3+. Click two gems, swipe, or use <kbd>←↑↓→</kbd> + <kbd>Enter</kbd>. Match 4 for a bonus, 5 for a <b>bundle</b> mega-bonus.</span>");

      /* ---------- board logic ---------- */
      var rnd = function () { return (Math.random() * TYPES.length) | 0; };
      var rc = function (i) { return [Math.floor(i / N), i % N]; };
      function gem(t) { return { t: t, id: ++uid }; }
      function fill() {
        board = [];
        for (var i = 0; i < N * N; i++) {
          var t, r = Math.floor(i / N), c = i % N;
          do { t = rnd(); } while ((c >= 2 && board[i - 1].t === t && board[i - 2].t === t) || (r >= 2 && board[i - N].t === t && board[i - 2 * N].t === t));
          board.push(gem(t));
        }
        if (!findMove()) fill();
      }
      function runs() {
        var out = [];
        for (var r = 0; r < N; r++) for (var c = 0; c < N;) {
          var t = board[r * N + c] && board[r * N + c].t, len = 1;
          while (c + len < N && board[r * N + c + len] && board[r * N + c + len].t === t) len++;
          if (t != null && len >= 3) { var cs = []; for (var k = 0; k < len; k++) cs.push(r * N + c + k); out.push({ cells: cs, t: t }); }
          c += len;
        }
        for (c = 0; c < N; c++) for (r = 0; r < N;) {
          var t2 = board[r * N + c] && board[r * N + c].t, len2 = 1;
          while (r + len2 < N && board[(r + len2) * N + c] && board[(r + len2) * N + c].t === t2) len2++;
          if (t2 != null && len2 >= 3) { var cs2 = []; for (var k2 = 0; k2 < len2; k2++) cs2.push((r + k2) * N + c); out.push({ cells: cs2, t: t2 }); }
          r += len2;
        }
        return out;
      }
      function swap(a, b) { var x = board[a]; board[a] = board[b]; board[b] = x; }
      function adjacent(a, b) { var A = rc(a), B = rc(b); return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) === 1; }
      function findMove() {
        for (var i = 0; i < N * N; i++) {
          var nb = [i % N < N - 1 ? i + 1 : -1, i + N < N * N ? i + N : -1];
          for (var k = 0; k < 2; k++) {
            var j = nb[k]; if (j < 0) continue;
            swap(i, j); var ok = runs().length > 0; swap(i, j);
            if (ok) return [i, j];
          }
        }
        return null;
      }

      /* ---------- rendering ---------- */
      function paint(fall) {
        cells.forEach(function (el, i) {
          var g = board[i];
          el.className = "gm__cell" + (g ? " gm--" + TYPES[g.t].id : " is-empty") + (i === sel ? " is-sel" : "");
          el.setAttribute("aria-label", g ? TYPES[g.t].name + ", row " + (Math.floor(i / N) + 1) + " column " + (i % N + 1) : "empty");
          el.querySelector("em").textContent = g ? TYPES[g.t].id : "";
          if (fall && fall[i]) {
            el.style.setProperty("--fall", fall[i]);
            el.classList.remove("is-drop"); void el.offsetWidth; el.classList.add("is-drop");
          }
        });
      }
      function hud() {
        api.hud('<span>score <b>' + score + '</b></span><span>moves <b' + (moves <= 5 ? ' class="low"' : "") + ">" + moves + '</b></span><span class="hide-sm">best <b>' + Math.max(best, score) + "</b></span>");
      }
      function float(text, i, cls) {
        var el = document.createElement("span");
        el.className = "gm__float " + (cls || "");
        el.textContent = text;
        var cell = cells[i], r = cell.getBoundingClientRect(), s = stage.getBoundingClientRect();
        el.style.left = (r.left - s.left + r.width / 2) + "px";
        el.style.top = (r.top - s.top) + "px";
        stage.appendChild(el);
        setTimeout(function () { el.remove(); }, 900);
      }

      /* ---------- turn resolution ---------- */
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
        busy = true; sel = -1; clearHint();
        await animateSwap(a, b);
        swap(a, b); paint();
        if (!runs().length) {
          cells[a].classList.add("gm--nope"); cells[b].classList.add("gm--nope");
          await animateSwap(a, b);
          swap(a, b); paint();
          busy = false; armHint(); return;
        }
        moves--; hud();
        await resolve();
        busy = false;
        if (moves <= 0) return over();
        if (!findMove()) { api.toast("no moves left · bundle update (shuffle)", "warn"); fill(); paint(); }
        armHint();
      }
      async function resolve() {
        var combo = 0;
        for (;;) {
          var rs = runs();
          if (!rs.length) break;
          combo++;
          var kill = {}, gained = 0;
          rs.forEach(function (run) {
            run.cells.forEach(function (c) { kill[c] = true; });
            var base = run.cells.length * 10;
            if (run.cells.length === 4) base += 40;
            if (run.cells.length >= 5) base += 120;
            gained += base;
            var mid = run.cells[Math.floor(run.cells.length / 2)];
            if (run.cells.length >= 5) { float("bundle install ✦", mid, "mega"); api.toast("Bundle complete! +" + base * combo, "ok"); }
            else if (run.cells.length === 4) float("+" + base * combo + " " + TYPES[run.t].done, mid, "big");
            else if (combo === 1) float(TYPES[run.t].done, mid);
          });
          gained *= combo;
          score += gained;
          if (combo >= 2) float("×" + combo + " cascade", rs[0].cells[0], "combo");
          Object.keys(kill).forEach(function (k) { cells[k].classList.add("is-pop"); });
          await wait(230 * T);
          Object.keys(kill).forEach(function (k) { board[k] = null; cells[k].classList.remove("is-pop"); });
          // gravity + refill, tracking how far each gem falls
          var fall = {};
          for (var c = 0; c < N; c++) {
            var write = N - 1;
            for (var r = N - 1; r >= 0; r--) {
              var i = r * N + c;
              if (board[i]) { var to = write * N + c; if (to !== i) { board[to] = board[i]; board[i] = null; fall[to] = write - r; } write--; }
            }
            for (var rr = write; rr >= 0; rr--) { board[rr * N + c] = gem(rnd()); fall[rr * N + c] = write + 1; }
          }
          paint(fall); hud();
          await wait(300 * T);
        }
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
      function start() {
        score = 0; moves = MOVES; sel = -1; alive = true; busy = false;
        fill(); paint(); hud(); api.clearOverlay(); armHint();
        cells[focusI].focus();
      }
      function over() {
        alive = false; clearHint();
        var b = api.best(score); best = b.best;
        api.overlay(
          '<p class="arcade__kicker">$ bundle exec rspec</p>' +
          "<h3>" + (score >= 2500 ? "Gemfile.lock: perfection" : score >= 1200 ? "All green" : "Done") + "</h3>" +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>best</dt><dd>" + b.best + "</dd><dt>moves</dt><dd>" + MOVES + "</dd></dl>" +
          '<button class="btn btn--primary" type="button" data-gm-start>↻ play again</button>'
        );
      }
      function intro() {
        fill(); paint(); hud();
        api.overlay(
          '<p class="arcade__kicker">$ gem install match-three</p>' +
          "<h3>Gem Match</h3>" +
          '<div class="gm__legend">' + TYPES.map(function (t) { return '<span class="gm__cell gm--' + t.id + ' gm__cell--static"><span class="gm__gem"><i></i><em>' + t.id + "</em></span></span><span>" + t.name + "</span>"; }).join("") + "</div>" +
          "<p>Line up three or more of the same gem. Chains cascade and multiply. You have " + MOVES + " moves.</p>" +
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
        var r = Math.floor(down.i / N), c = down.i % N, j = -1;
        if (Math.abs(dx) > Math.abs(dy)) j = dx > 0 && c < N - 1 ? down.i + 1 : dx < 0 && c > 0 ? down.i - 1 : -1;
        else j = dy > 0 && r < N - 1 ? down.i + N : dy < 0 && r > 0 ? down.i - N : -1;
        if (j >= 0) trySwap(down.i, j);
      }
      function onPointerUp() { setTimeout(function () { down = null; }, 0); }
      function choose(i) {
        if (busy || !alive) return;
        if (sel === -1) { sel = i; paint(); return; }
        if (sel === i) { sel = -1; paint(); return; }
        if (adjacent(sel, i)) trySwap(sel, i);
        else { sel = i; paint(); }
      }
      function onClick(e) {
        if (e.target.closest("[data-gm-start]")) { start(); return; }
        var cell = e.target.closest(".gm__cell"); if (!cell || cell.classList.contains("gm__cell--static")) return;
        if (down && down.swiped) return;
        focusI = +cell.dataset.i;
        choose(focusI);
      }
      function moveFocus(i) {
        cells[focusI].tabIndex = -1; focusI = i; cells[i].tabIndex = 0; cells[i].focus();
      }
      boardEl.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("click", onClick);
      intro();

      return {
        key: function (e) {
          if (!alive || !boardEl.contains(document.activeElement)) return;
          var r = Math.floor(focusI / N), c = focusI % N, to = -1;
          if (e.key === "ArrowLeft" && c > 0) to = focusI - 1;
          else if (e.key === "ArrowRight" && c < N - 1) to = focusI + 1;
          else if (e.key === "ArrowUp" && r > 0) to = focusI - N;
          else if (e.key === "ArrowDown" && r < N - 1) to = focusI + N;
          else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(focusI); return; }
          if (to >= 0) {
            e.preventDefault();
            if (sel === focusI) { trySwap(focusI, to); }   // selected + arrow = swap in that direction
            moveFocus(to);
          }
        },
        destroy: function () {
          alive = false; clearHint();
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        }
      };
    }
  });
})();
