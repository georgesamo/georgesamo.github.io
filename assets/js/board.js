/* Samuka · the Samuka & Nino board: a tiny private kanban for the two special roles.
 * Row-level security makes it invisible to everyone else. Live via Realtime.
 */
(function () {
  "use strict";
  var COLS = [["todo", "To do"], ["doing", "In progress"], ["done", "Shipped"]];
  var dlg = null, tasks = [], sub = null, dragId = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function A() { return window.SamukaAuth; }
  function team() { var a = A(); return !!(a && a.user() && (a.role() === "samuka" || a.role() === "nino")); }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  var MOCK = "samuka-mock-board";
  function saveMock() { try { sessionStorage.setItem(MOCK, JSON.stringify(tasks)); } catch (e) {} }

  function build() {
    dlg = document.createElement("div");
    dlg.className = "kb";
    dlg.hidden = true;
    dlg.innerHTML = '<div class="kb__backdrop" data-kb-close></div><div class="kb__win" role="dialog" aria-modal="true" aria-labelledby="kb-title">' +
      '<div class="kb__bar"><span class="dots"><i data-kb-close></i><i></i><i></i></span><span id="kb-title">samuka-and-nino / board</span><button class="arcade__x" type="button" data-kb-close aria-label="Close board">esc</button></div>' +
      '<form class="kb__add" data-kb-add><input name="title" maxlength="120" required placeholder="new ticket… (e.g. ship the arcade leaderboard)" autocomplete="off">' +
      '<label class="kb__purple"><input type="checkbox" name="purple"> 💜</label><button class="btn btn--primary" type="submit">+ add</button></form>' +
      '<div class="kb__cols" data-kb-cols></div><p class="kb__foot muted">Only Samuka and Nino can see this board. Drag cards between columns, or use the arrows.</p></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onClick);
    dlg.addEventListener("submit", onAdd);
    dlg.addEventListener("dragstart", function (e) { var c = e.target.closest("[data-kb-id]"); if (c) { dragId = +c.getAttribute("data-kb-id"); e.dataTransfer.effectAllowed = "move"; c.classList.add("is-drag"); } });
    dlg.addEventListener("dragend", function (e) { var c = e.target.closest("[data-kb-id]"); if (c) c.classList.remove("is-drag"); dragId = null; });
    dlg.addEventListener("dragover", function (e) { var col = e.target.closest("[data-kb-col]"); if (col && dragId) { e.preventDefault(); col.classList.add("is-over"); } });
    dlg.addEventListener("dragleave", function (e) { var col = e.target.closest("[data-kb-col]"); if (col) col.classList.remove("is-over"); });
    dlg.addEventListener("drop", function (e) {
      var col = e.target.closest("[data-kb-col]"); if (!col || !dragId) return;
      e.preventDefault(); col.classList.remove("is-over");
      update(dragId, { status: col.getAttribute("data-kb-col"), position: Date.now() / 1000 });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !dlg.hidden) { e.stopPropagation(); close(); } }, true);
  }
  function paint() {
    if (!dlg) return;
    dlg.querySelector("[data-kb-cols]").innerHTML = COLS.map(function (c, ci) {
      var list = tasks.filter(function (t) { return t.status === c[0]; }).sort(function (a, b) { return a.position - b.position; });
      return '<section class="kb__col kb__col--' + c[0] + '" data-kb-col="' + c[0] + '"><h4>' + c[1] + " <span>" + list.length + "</span></h4>" +
        list.map(function (t) {
          return '<article class="kb__card' + (t.purple ? " is-purple" : "") + '" draggable="true" data-kb-id="' + t.id + '"><p>' + esc(t.title) + "</p>" +
            '<div class="kb__tools">' +
            (ci > 0 ? '<button type="button" data-kb-move="-1" aria-label="Move left">←</button>' : "") +
            (ci < COLS.length - 1 ? '<button type="button" data-kb-move="1" aria-label="Move right">→</button>' : "") +
            '<button type="button" data-kb-purple aria-label="Toggle purple tag">' + (t.purple ? "💜" : "🤍") + "</button>" +
            '<button type="button" data-kb-del aria-label="Delete ticket">✕</button></div></article>';
        }).join("") + "</section>";
    }).join("");
  }
  async function load() {
    var c = db();
    if (c) {
      var r = await c.from("board_tasks").select("id, title, status, purple, position").order("position");
      if (r.error) { console.warn("[board]", r.error.message); return; }
      tasks = r.data || [];
    } else {
      try { tasks = JSON.parse(sessionStorage.getItem(MOCK) || "null") || [{ id: 1, title: "Ship the leaderboards", status: "done", purple: true, position: 1 }, { id: 2, title: "Plan the next sprint", status: "todo", purple: false, position: 2 }]; } catch (e) { tasks = []; }
    }
    paint();
  }
  async function update(id, patch) {
    var t = tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    for (var k in patch) t[k] = patch[k];
    paint();
    var c = db();
    if (!c) { saveMock(); return; }
    patch.updated_at = new Date().toISOString();
    var r = await c.from("board_tasks").update(patch).eq("id", id);
    if (r.error) { console.warn("[board]", r.error.message); load(); }
  }
  async function onAdd(e) {
    e.preventDefault();
    var f = e.target, title = f.elements.title.value.trim(); if (!title) return;
    var row = { title: title, status: "todo", purple: f.elements.purple.checked, position: Date.now() / 1000 };
    f.reset();
    var c = db();
    if (!c) { row.id = Date.now(); tasks.push(row); saveMock(); paint(); return; }
    var r = await c.from("board_tasks").insert(row).select("id, title, status, purple, position").single();
    if (r.error) { alert(r.error.message); return; }
    if (!tasks.some(function (x) { return x.id === r.data.id; })) tasks.push(r.data);
    paint();
  }
  async function onClick(e) {
    if (e.target.closest("[data-kb-close]")) return close();
    var card = e.target.closest("[data-kb-id]"); if (!card) return;
    var id = +card.getAttribute("data-kb-id"), t = tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var mv = e.target.closest("[data-kb-move]");
    if (mv) {
      var idx = COLS.map(function (c) { return c[0]; }).indexOf(t.status) + +mv.getAttribute("data-kb-move");
      if (COLS[idx]) update(id, { status: COLS[idx][0], position: Date.now() / 1000 });
    } else if (e.target.closest("[data-kb-purple]")) update(id, { purple: !t.purple });
    else if (e.target.closest("[data-kb-del]")) {
      if (!confirm("Delete \"" + t.title + "\"?")) return;
      tasks = tasks.filter(function (x) { return x.id !== id; }); paint();
      var c = db(); if (!c) { saveMock(); return; }
      var r = await c.from("board_tasks").delete().eq("id", id);
      if (r.error) { alert(r.error.message); load(); }
    }
  }
  function open() {
    if (!team()) return false;
    if (!dlg) build();
    dlg.hidden = false;
    document.documentElement.style.overflow = "hidden";
    load();
    var c = db();
    if (c && !sub) sub = c.channel("board-live").on("postgres_changes", { event: "*", schema: "public", table: "board_tasks" }, function () { if (!dlg.hidden) load(); }).subscribe();
    setTimeout(function () { var i = dlg.querySelector("input[name=title]"); if (i) i.focus(); }, 40);
    return true;
  }
  function close() {
    if (!dlg) return;
    dlg.hidden = true;
    document.documentElement.style.overflow = "";
    if (sub) { try { sub.unsubscribe(); } catch (e) {} sub = null; }
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-open-board]")) { e.preventDefault(); var a = A(); if (a) a.close(); open(); }
  });
  function boot() {
    var a = A();
    if (a && a.extend) a.extend(function (state) {
      return state.role === "samuka" || state.role === "nino" ? '<button class="btn acct__tool" type="button" data-open-board>📋 our board</button>' : "";
    }, { tab: "team" });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.SamukaBoard = { open: open, close: close };
})();
