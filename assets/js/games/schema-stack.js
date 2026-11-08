/* Schema Stack · falling migrations
 *
 * Migrations drop into the schema. Fill a row to deploy it.
 * Twist: a migration for a table that doesn't exist yet lands as PENDING
 * (striped) and blocks its row, until that table's `create_table` lands;
 * then every pending migration of the table runs at once (bonus).
 * A row made of one table only is a "clean migration" (×3).
 * Rare `db:rollback` blocks remove the bottom row.
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var W = 10, H = 18;
  var TABLES = ["users", "orders", "invoices"];
  // original set of 1–4 cell shapes
  var SHAPES = [
    [[0, 0], [1, 0]],                          // pair
    [[0, 0], [1, 0], [2, 0]],                  // line of three
    [[0, 0], [0, 1], [1, 1]],                  // corner
    [[0, 0], [1, 0], [2, 0], [3, 0]],          // long
    [[0, 0], [1, 0], [0, 1], [1, 1]],          // square
    [[0, 0], [1, 0], [2, 0], [1, 1]],          // tee
    [[0, 0], [0, 1], [0, 2], [1, 2]],          // hook
    [[1, 0], [2, 0], [0, 1], [1, 1]]           // step
  ];
  var CHANGES = ["add_column :%t, :status", "add_index :%t, :created_at", "change_column_null :%t, :email", "add_reference :%t, :clinic", "rename_column :%t, :name", "add_timestamps :%t", "change_column_default :%t, :state"];

  window.SamukaArcade.register("schema", {
    title: "schema-stack.rb",
    blurb: "Stack falling migrations; create tables before you change them.",
    mount: function (stage, api) {
      var rng = api.rng;
      var board, piece, next, created, score, lines, level, alive, paused, dropT, last, raf, best = api.peekBest(), cells = [];
      stage.innerHTML =
        '<div class="ms">' +
          '<div class="ms__board" data-board role="img" aria-label="Schema board"></div>' +
          '<aside class="ms__side">' +
            '<p class="ms__label">next migration</p><div class="ms__next" data-next></div><p class="ms__mig" data-next-label></p>' +
            '<p class="ms__label">tables</p><ul class="ms__tables" data-tables></ul>' +
            '<div class="ms__pad" aria-label="Touch controls">' +
              '<button type="button" data-k="left" aria-label="Move left">◀</button><button type="button" data-k="rot" aria-label="Rotate">⟳</button><button type="button" data-k="right" aria-label="Move right">▶</button>' +
              '<button type="button" data-k="down" aria-label="Soft drop">▼</button><button type="button" data-k="drop" aria-label="Hard drop">⤓</button>' +
            "</div>" +
          "</aside>" +
        "</div>";
      api.foot("<span><kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd>/<kbd>X</kbd> rotate · <kbd>↓</kbd> faster · <kbd>Space</kbd> drop · <kbd>P</kbd> pause. Striped = pending: that table has no <b>create_table</b> yet, so its row can't deploy.</span>");
      var boardEl = stage.querySelector("[data-board]");
      for (var i = 0; i < W * H; i++) { var c = document.createElement("i"); boardEl.appendChild(c); cells.push(c); }

      function pick(a) { return a[(rng() * a.length) | 0]; }
      function make(kind, table) {
        var shape = kind === "rollback" ? [[0, 0]] : kind === "create" ? [[0, 0], [1, 0], [2, 0]] : pick(SHAPES);
        var label = kind === "rollback" ? "rails db:rollback" : kind === "create" ? "create_table :" + table : pick(CHANGES).replace("%t", table);
        return { kind: kind, table: table, cells: shape.map(function (p) { return [p[0], p[1]]; }), x: 3, y: 0, label: label };
      }
      function generate() {
        if (rng() < 0.04) return make("rollback", "rollback");
        var t = pick(TABLES);
        if (!created[t] && rng() < 0.45) return make("create", t);
        return make("change", t);
      }
      function abs(p, dx, dy, cs) { return (cs || p.cells).map(function (c) { return [c[0] + p.x + (dx || 0), c[1] + p.y + (dy || 0)]; }); }
      function fits(p, dx, dy, cs) {
        return abs(p, dx, dy, cs).every(function (c) { return c[0] >= 0 && c[0] < W && c[1] < H && (c[1] < 0 || !board[c[1] * W + c[0]]); });
      }
      function rotated(p) {
        var cs = p.cells.map(function (c) { return [-c[1], c[0]]; });
        var minx = Math.min.apply(null, cs.map(function (c) { return c[0]; })), miny = Math.min.apply(null, cs.map(function (c) { return c[1]; }));
        return cs.map(function (c) { return [c[0] - minx, c[1] - miny]; });
      }
      function rotate() {
        var cs = rotated(piece);
        var kicks = [0, -1, 1, -2, 2];
        for (var k = 0; k < kicks.length; k++) if (fits(piece, kicks[k], 0, cs)) { piece.cells = cs; piece.x += kicks[k]; return true; }
        return false;
      }
      function spawn() {
        piece = next || generate(); next = generate();
        var wdt = Math.max.apply(null, piece.cells.map(function (c) { return c[0]; })) + 1;
        piece.x = Math.floor((W - wdt) / 2); piece.y = 0;
        paintNext();
        if (!fits(piece, 0, 0)) over();
      }
      function lock() {
        if (piece.kind === "rollback") {
          var had = board.slice((H - 1) * W).some(Boolean);
          board.splice((H - 1) * W, W); for (var z = 0; z < W; z++) board.unshift(null);
          api.toast(had ? "db:rollback · bottom row reverted" : "db:rollback · nothing to revert", "warn");
        } else {
          var pend = piece.kind === "change" && !created[piece.table];
          abs(piece).forEach(function (c) { if (c[1] >= 0) board[c[1] * W + c[0]] = { t: piece.table, pending: pend, create: piece.kind === "create" }; });
          if (piece.kind === "create") {
            created[piece.table] = true;
            var n = 0; board.forEach(function (b) { if (b && b.t === piece.table && b.pending) { b.pending = false; n++; } });
            if (n) { score += n * 15 * level; api.toast("create_table :" + piece.table + " · " + n + " pending migrations ran (+" + n * 15 * level + ")", "ok"); }
            else api.toast("create_table :" + piece.table, "ok");
            paintTables();
          }
        }
        clearRows();
        spawn(); render(); hud();
      }
      function clearRows() {
        var cleared = 0, clean = 0;
        for (var r = H - 1; r >= 0; r--) {
          var row = board.slice(r * W, r * W + W);
          if (row.every(function (b) { return b && !b.pending; })) {
            var same = row.every(function (b) { return b.t === row[0].t; });
            if (same) clean++;
            board.splice(r * W, W); for (var z = 0; z < W; z++) board.unshift(null);
            cleared++; r++;
          }
        }
        if (!cleared) return;
        var pts = [0, 100, 300, 500, 800][Math.min(4, cleared)] * level + clean * 200 * level;
        score += pts; lines += cleared;
        if (clean) { api.toast("clean migration ×3 · one table per row", "ok"); api.emit("clean_row"); }
        if (cleared >= 4) { api.toast("big-bang migration: " + cleared + " rows", "ok"); api.emit("big_bang"); }
        else api.toast("deployed " + cleared + " row" + (cleared > 1 ? "s" : "") + " (+" + pts + ")", "ok");
        var lv = 1 + Math.floor(lines / 8);
        if (lv !== level) { level = lv; api.toast("level " + level + " · traffic is up", "warn"); }
      }
      function interval() { return Math.max(90, 720 - (level - 1) * 65); }
      function move(dx) { if (fits(piece, dx, 0)) { piece.x += dx; render(); } }
      function down(soft) {
        if (fits(piece, 0, 1)) { piece.y++; if (soft) score += 1; render(); return true; }
        lock(); return false;
      }
      function hardDrop() { var n = 0; while (fits(piece, 0, 1)) { piece.y++; n++; } score += n * 2; lock(); }

      /* ---------- render ---------- */
      function render() {
        var act = {}, ghost = {};
        if (piece && alive) {
          abs(piece).forEach(function (c) { if (c[1] >= 0) act[c[1] * W + c[0]] = 1; });
          var gy = 0; while (fits(piece, 0, gy + 1)) gy++;
          abs(piece, 0, gy).forEach(function (c) { if (c[1] >= 0) ghost[c[1] * W + c[0]] = 1; });
        }
        for (var i = 0; i < W * H; i++) {
          var b = board[i], cls = "";
          if (act[i]) cls = "is-" + piece.table + (piece.kind === "change" && !created[piece.table] ? " is-pending" : "") + (piece.kind === "create" ? " is-create" : "") + " is-live";
          else if (b) cls = "is-" + b.t + (b.pending ? " is-pending" : "") + (b.create ? " is-create" : "");
          else if (ghost[i]) cls = "is-ghost";
          if (cells[i].className !== cls) cells[i].className = cls;
        }
      }
      function paintNext() {
        var el = stage.querySelector("[data-next]"), lab = stage.querySelector("[data-next-label]");
        var g = ""; for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
          var on = next.cells.some(function (c) { return c[0] === x && c[1] === y; });
          g += "<i" + (on ? ' class="is-' + next.table + (next.kind === "change" && !created[next.table] ? " is-pending" : "") + '"' : "") + "></i>";
        }
        el.innerHTML = g; lab.textContent = next.label;
      }
      function paintTables() {
        stage.querySelector("[data-tables]").innerHTML = TABLES.map(function (t) {
          return '<li class="is-' + t + '"><i></i>' + t + (created[t] ? ' <span class="ok">✓</span>' : ' <span class="muted">missing</span>') + "</li>";
        }).join("");
      }
      function hud() { api.hud("<span>score <b>" + score + "</b></span><span>rows <b>" + lines + "</b></span><span>level <b>" + level + '</b></span><span class="hide-sm">best <b>' + Math.max(best, score) + "</b></span>"); }

      /* ---------- loop ---------- */
      function frame(ts) {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        if (paused) { last = ts; return; }
        if (!last) last = ts;
        dropT += ts - last; last = ts;
        if (dropT >= interval()) { dropT = 0; down(false); hud(); }
      }
      function start() {
        board = []; for (var i = 0; i < W * H; i++) board.push(null);
        created = { users: true, orders: false, invoices: false };
        score = 0; lines = 0; level = 1; alive = true; paused = false; dropT = 0; last = 0; next = null;
        api.clearOverlay(); paintTables(); spawn(); render(); hud();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
        boardEl.focus && boardEl.focus();
      }
      function over() {
        alive = false; cancelAnimationFrame(raf); render();
        var b = api.best(score, { lines: lines }); best = b.best;
        api.overlay('<p class="arcade__err">ActiveRecord::PendingMigrationError</p><p class="muted">Migrations are pending. To resolve this issue, run: bin/rails db:migrate</p>' +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>best</dt><dd>" + b.best + "</dd><dt>rows deployed</dt><dd>" + lines + "</dd><dt>level</dt><dd>" + level + "</dd></dl>" +
          '<div class="lb-mini" data-lb-mini="schema"></div><button class="btn btn--primary" type="button" data-ms-start>↻ bin/rails db:migrate</button>');
      }
      function intro() {
        board = []; for (var i = 0; i < W * H; i++) board.push(null);
        created = { users: true, orders: false, invoices: false }; next = generate(); paintNext(); paintTables(); render();
        api.hud('<span>best <b>' + best + "</b></span>");
        api.overlay('<p class="arcade__kicker">$ bin/rails db:migrate</p><h3>Schema Stack</h3>' +
          "<p>Migrations fall into the schema. Fill a row to <b>deploy</b> it.</p>" +
          '<ul class="sr__legend"><li><i class="sr__dot ms-dot is-users"></i><b>users</b> exists from the start</li><li><i class="sr__dot ms-dot is-orders"></i><b>orders</b> and <i class="sr__dot ms-dot is-invoices"></i><b>invoices</b> need their <code>create_table</code> first</li></ul>' +
          '<p class="muted">Changes to a missing table land <b>pending</b> (striped) and block their row until the table is created; then they all run at once. One table per row = clean migration ×3.</p>' +
          '<button class="btn btn--primary" type="button" data-ms-start>▶ db:migrate</button>');
      }
      function act(k) {
        if (!alive || paused && k !== "pause") return;
        if (k === "left") move(-1);
        else if (k === "right") move(1);
        else if (k === "rot") { if (rotate()) render(); }
        else if (k === "down") { down(true); hud(); }
        else if (k === "drop") hardDrop();
      }
      function onClick(e) {
        if (e.target.closest("[data-ms-start]")) { start(); return; }
        var b = e.target.closest("[data-k]"); if (b) { e.preventDefault(); act(b.getAttribute("data-k")); }
      }
      stage.addEventListener("click", onClick);
      intro();
      return {
        key: function (e) {
          if (!alive) return;
          var map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "rot", ArrowDown: "down", " ": "drop", x: "rot", X: "rot", z: "rot", Z: "rot" };
          if (e.key === "p" || e.key === "P") { paused = !paused; api.toast(paused ? "paused (P to resume)" : "resumed"); e.preventDefault(); return; }
          if (map[e.key]) { e.preventDefault(); act(map[e.key]); }
        },
        pause: function () { if (alive && !paused) { paused = true; api.toast("paused (P to resume)"); } },
        destroy: function () { alive = false; cancelAnimationFrame(raf); stage.removeEventListener("click", onClick); }
      };
    }
  });
})();
