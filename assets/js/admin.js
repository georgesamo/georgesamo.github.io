/* Samuka · admin panel (samuka role only)
 * Lists accounts, changes roles, toggles glitches, moderates the wall.
 * Every action runs through security-definer SQL functions that re-check the
 * caller's role on the server, so hiding this UI is cosmetic, not the guard.
 */
(function () {
  "use strict";
  var ROLES = ["user", "samuka", "nino"];
  var dlg = null, users = [], wall = [], tab = "users", filter = "";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function A() { return window.SamukaAuth; }
  function owner() { var a = A(); return !!(a && a.user() && a.role() === "samuka"); }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function day(t) { return t ? new Date(t).toISOString().slice(0, 10) : "never"; }

  function build() {
    dlg = document.createElement("div");
    dlg.className = "adm";
    dlg.hidden = true;
    dlg.innerHTML = '<div class="adm__backdrop" data-adm-close></div><div class="adm__win" role="dialog" aria-modal="true" aria-labelledby="adm-title">' +
      '<div class="adm__bar"><span class="dots"><i data-adm-close></i><i></i><i></i></span><span id="adm-title">rails admin</span><button class="arcade__x" type="button" data-adm-close aria-label="Close admin">esc</button></div>' +
      '<div class="adm__tabs" role="tablist"><button type="button" role="tab" data-adm-tab="users">users</button><button type="button" role="tab" data-adm-tab="wall">wall</button><button type="button" role="tab" data-adm-tab="analytics">analytics</button><button type="button" role="tab" data-adm-tab="tm">testimonials</button><button type="button" role="tab" data-adm-tab="errors">errors</button></div>' +
      '<div class="adm__body" data-adm-body></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onClick);
    dlg.addEventListener("change", onChange);
    dlg.addEventListener("input", function (e) { if (e.target.matches("[data-adm-filter]")) { filter = e.target.value.toLowerCase(); paintUsers(true); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !dlg.hidden) { e.stopPropagation(); close(); } }, true);
  }
  function body(html) { dlg.querySelector("[data-adm-body]").innerHTML = html; }
  function paintTabs() { dlg.querySelectorAll("[data-adm-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-adm-tab") === tab)); }); }

  async function loadUsers() {
    var c = db();
    if (!c) { users = [{ id: "local-samuka", email: "samuka@localhost", role: "samuka", nickname: "Samuka", glitches: true, created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString() }, { id: "u2", email: "friend@example.com", role: "user", nickname: null, glitches: true, created_at: new Date().toISOString(), last_sign_in_at: null }]; return; }
    var r = await c.rpc("admin_users");
    if (r.error) throw r.error;
    users = r.data || [];
  }
  function paintUsers(keepInput) {
    var me = A().user().id;
    var list = users.filter(function (u) { return !filter || (u.email + " " + (u.nickname || "") + " " + u.role).toLowerCase().indexOf(filter) > -1; });
    var counts = {}; users.forEach(function (u) { counts[u.role] = (counts[u.role] || 0) + 1; });
    var table = '<table class="adm__table"><thead><tr><th>account</th><th>role</th><th>glitches</th><th>joined</th><th>last seen</th></tr></thead><tbody>' +
      list.map(function (u) {
        return '<tr data-adm-user="' + esc(u.id) + '"><td><b>' + esc(u.email) + "</b>" + (u.nickname ? '<small>' + esc(u.nickname) + "</small>" : "") + "</td>" +
          '<td><select data-adm-role aria-label="Role for ' + esc(u.email) + '"' + (u.id === me ? " disabled title=\"you can't demote yourself\"" : "") + ">" +
          ROLES.map(function (r) { return '<option value="' + r + '"' + (r === u.role ? " selected" : "") + ">" + r + "</option>"; }).join("") + "</select></td>" +
          '<td><input type="checkbox" data-adm-glitch aria-label="Glitches for ' + esc(u.email) + '"' + (u.glitches ? " checked" : "") + "></td>" +
          "<td>" + day(u.created_at) + "</td><td>" + day(u.last_sign_in_at) + "</td></tr>";
      }).join("") + "</tbody></table>";
    if (keepInput && dlg.querySelector(".adm__table")) { dlg.querySelector(".adm__table").outerHTML = table; return; }
    body('<div class="adm__stats"><span><b>' + users.length + "</b> accounts</span>" + ROLES.map(function (r) { return "<span>" + r + " <b>" + (counts[r] || 0) + "</b></span>"; }).join("") + "</div>" +
      '<input class="adm__filter" data-adm-filter placeholder="filter by email, nickname, role…" value="' + esc(filter) + '">' + table +
      '<p class="adm__msg muted" data-adm-msg role="status">Changing a role also updates the private grant list, so it survives a fresh sign-up.</p>');
  }
  async function loadWall() {
    var c = db();
    if (!c) { wall = []; return; }
    var r = await c.from("wall").select("id, author, message, sha, hidden, created_at").order("created_at", { ascending: false }).limit(200);
    if (r.error) throw r.error;
    wall = r.data || [];
  }
  function paintWall() {
    body(wall.length ? '<ol class="adm__wall">' + wall.map(function (w) {
      return '<li class="' + (w.hidden ? "is-hidden" : "") + '" data-adm-wall="' + w.id + '"><span class="wall__sha">' + esc(w.sha) + "</span> " + esc(w.message) +
        ' <small>— ' + esc(w.author) + " · " + day(w.created_at) + '</small><span class="adm__acts"><button class="wall__mod" type="button" data-adm-hide>' + (w.hidden ? "unhide" : "hide") + '</button><button class="wall__mod" type="button" data-adm-del>delete</button></span></li>';
    }).join("") + "</ol>" : '<p class="muted">No commits on the wall yet.</p>');
  }
  async function show(t) {
    tab = t; paintTabs(); body('<p class="muted">loading…</p>');
    try {
      if (t === "users") { await loadUsers(); paintUsers(); }
      else if (t === "analytics") await paintAnalytics();
      else if (t === "tm") await paintTm();
      else if (t === "errors") await paintErrors();
      else { await loadWall(); paintWall(); }
    } catch (err) {
      body('<p class="adm__err">' + esc(err.message || String(err)) + '</p><p class="muted">If this says the function does not exist, run <code>supabase/' + (t === "errors" ? "errors" : "features") + '.sql</code> in the Supabase SQL editor.</p>');
    }
  }
  /* ---------- analytics ---------- */
  var anDays = 30;
  function chart(days) {
    var W = 720, H = 160, pad = 22, n = Math.max(days.length, 1), max = 1;
    days.forEach(function (d) { max = Math.max(max, d.views, d.visitors); });
    var bw = (W - pad * 2) / n;
    var bars = days.map(function (d, i) {
      var x = pad + i * bw, hv = (d.views / max) * (H - 40), hu = (d.visitors / max) * (H - 40);
      return '<rect class="bar" x="' + (x + 1).toFixed(1) + '" y="' + (H - 20 - hv).toFixed(1) + '" width="' + Math.max(1, bw * 0.55).toFixed(1) + '" height="' + hv.toFixed(1) + '"><title>' + d.day + ": " + d.views + " views</title></rect>" +
        '<rect class="bar2" x="' + (x + 1 + bw * 0.55).toFixed(1) + '" y="' + (H - 20 - hu).toFixed(1) + '" width="' + Math.max(1, bw * 0.3).toFixed(1) + '" height="' + hu.toFixed(1) + '"><title>' + d.day + ": " + d.visitors + " visitors</title></rect>";
    }).join("");
    var labels = days.length ? '<text x="' + pad + '" y="' + (H - 4) + '">' + days[0].day + '</text><text x="' + (W - pad) + '" y="' + (H - 4) + '" text-anchor="end">' + days[days.length - 1].day + '</text><text x="' + pad + '" y="12">max ' + max + "</text>" : "";
    return '<svg class="an-chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Views and visitors per day">' + bars + labels + "</svg>";
  }
  function listBox(title, rows, label, val) {
    var max = 1; rows.forEach(function (r) { max = Math.max(max, r[val]); });
    return '<div class="an-list"><h5>' + title + "</h5>" + (rows.length ? "<ol>" + rows.map(function (r) {
      return '<li><i style="width:' + (r[val] / max * 100).toFixed(0) + '%"></i><span>' + esc(r[label]) + "</span><b>" + r[val] + "</b></li>";
    }).join("") + "</ol>" : '<p class="muted">nothing yet</p>') + "</div>";
  }
  async function paintAnalytics() {
    var c = db(), d;
    if (!c) d = { totals: { views: 12, visitors: 5 }, days: [{ day: "2026-11-07", views: 4, visitors: 2 }, { day: "2026-11-08", views: 8, visitors: 3 }], pages: [{ path: "/", views: 7 }, { path: "/samuka/", views: 5 }], sections: [{ name: "experience", reads: 3 }], referrers: [{ host: "linkedin.com", visitors: 2 }], plays: [{ game: "gems", plays: 4 }] };
    else { var r = await c.rpc("analytics_summary", { p_days: anDays }); if (r.error) throw r.error; d = r.data; }
    body('<div class="adm__stats">' + [7, 30, 90].map(function (n) { return '<button class="wall__mod" type="button" data-an-days="' + n + '"' + (n === anDays ? ' style="color:var(--hl)"' : "") + ">" + n + " days</button>"; }).join("") + '<span class="muted">no cookies · no IPs · per-tab ids only</span></div>' +
      '<div class="an-tiles"><div><b>' + d.totals.views + "</b><span>page views</span></div><div><b>" + d.totals.visitors + "</b><span>visits</span></div><div><b>" +
      (d.plays || []).reduce(function (n, p) { return n + p.plays; }, 0) + "</b><span>games started</span></div></div>" +
      chart(d.days || []) +
      '<div class="an-lists">' + listBox("pages", d.pages || [], "path", "views") + listBox("profile sections read", d.sections || [], "name", "reads") +
      listBox("came from", d.referrers || [], "host", "visitors") + listBox("games", d.plays || [], "game", "plays") + "</div>");
  }
  /* ---------- JavaScript errors from players' browsers (errors.js → supabase/errors.sql) ---------- */
  var errDays = 7;
  async function paintErrors() {
    var c = db(), rows;
    if (!c) rows = [{ kind: "error", message: "TypeError: x is undefined", source: "/assets/js/app.js", line: 12, col: 4, hits: 3, loads: 2, last_seen: new Date().toISOString(), paths: ["/"], browsers: ["Safari 17 · iOS"], build: "1762900000", stack: null }];
    else { var r = await c.rpc("client_error_summary", { p_days: errDays }); if (r.error) throw r.error; rows = r.data || []; }
    body('<div class="adm__stats">' + [1, 7, 30].map(function (n) { return '<button class="wall__mod" type="button" data-err-days="' + n + '"' + (n === errDays ? ' style="color:var(--hl)"' : "") + ">" + n + (n === 1 ? " day" : " days") + "</button>"; }).join("") +
      (rows.length ? '<button class="wall__mod" type="button" data-err-clear>clear all</button>' : "") + '<span class="muted">grouped by message + file:line · no personal data</span></div>' +
      (rows.length ? '<ol class="adm__wall">' + rows.map(function (e) {
        var where = e.source ? e.source + (e.line ? ":" + e.line + (e.col ? ":" + e.col : "") : "") : "(no file)";
        return "<li><b>" + esc(e.message) + "</b> <small>" + esc(e.kind) + " · " + esc(where) + "</small><br><small>" + e.hits + "× on " + e.loads + " page loads · last " + esc(String(e.last_seen).replace("T", " ").slice(0, 16)) +
          " · " + esc((e.paths || []).join(", ")) + " · " + esc((e.browsers || []).join(", ")) + (e.build ? " · build " + esc(e.build) : "") + "</small>" +
          (e.stack ? '<details><summary class="muted">stack</summary><pre style="white-space:pre-wrap;font-size:11px;margin:4px 0 0">' + esc(e.stack) + "</pre></details>" : "") + "</li>";
      }).join("") + "</ol>" : '<p class="muted">No JavaScript errors reported in this period. 🎉</p>'));
  }
  /* ---------- testimonials ---------- */
  var tms = [];
  async function paintTm() {
    var c = db();
    if (!c) tms = [];
    else { var r = await c.from("testimonials").select("id, name, relation, body, approved, created_at").order("approved").order("created_at", { ascending: false }); if (r.error) throw r.error; tms = r.data || []; }
    body(tms.length ? '<ul class="adm__tm">' + tms.map(function (t) {
      return '<li class="' + (t.approved ? "" : "is-pending") + '" data-adm-tm="' + t.id + '"><b>' + esc(t.name) + "</b><small>" + esc(t.relation) + " · " + day(t.created_at) + (t.approved ? " · live" : " · waiting for approval") + "</small>" + esc(t.body) +
        '<div class="adm__acts" style="margin-top:8px"><button class="wall__mod" type="button" data-tm-approve>' + (t.approved ? "unpublish" : "approve") + '</button><button class="wall__mod" type="button" data-tm-del>delete</button></div></li>';
    }).join("") + "</ul>" : '<p class="muted">No testimonials yet. Visitors can leave one on /samuka/.</p>');
  }
  function msg(text, bad) { var m = dlg.querySelector("[data-adm-msg]"); if (m) { m.textContent = text; m.classList.toggle("is-bad", !!bad); } }
  async function onChange(e) {
    var tr = e.target.closest("[data-adm-user]"); if (!tr) return;
    var id = tr.getAttribute("data-adm-user"), u = users.filter(function (x) { return x.id === id; })[0], c = db();
    if (e.target.matches("[data-adm-role]")) {
      var role = e.target.value;
      if (!confirm("Change " + u.email + " to role \"" + role + "\"?")) { e.target.value = u.role; return; }
      if (c) { var r = await c.rpc("admin_set_role", { p_user: id, p_role: role }); if (r.error) { msg(r.error.message, true); e.target.value = u.role; return; } }
      u.role = role; msg("✓ " + u.email + " is now " + role + ". They see it on their next page load.");
    }
    if (e.target.matches("[data-adm-glitch]")) {
      var on = e.target.checked;
      if (c) { var r2 = await c.rpc("admin_set_glitches", { p_user: id, p_on: on }); if (r2.error) { msg(r2.error.message, true); e.target.checked = !on; return; } }
      u.glitches = on; msg("✓ glitches " + (on ? "on" : "off") + " for " + u.email);
    }
  }
  async function onClick(e) {
    if (e.target.closest("[data-adm-close]")) return close();
    var t = e.target.closest("[data-adm-tab]"); if (t) return show(t.getAttribute("data-adm-tab"));
    var nd = e.target.closest("[data-an-days]"); if (nd) { anDays = +nd.getAttribute("data-an-days"); return show("analytics"); }
    var ed = e.target.closest("[data-err-days]"); if (ed) { errDays = +ed.getAttribute("data-err-days"); return show("errors"); }
    if (e.target.closest("[data-err-clear]")) {
      if (!confirm("Delete every error report? This can't be undone.")) return;
      if (db()) { var rc = await db().rpc("client_errors_clear"); if (rc.error) { alert(rc.error.message); return; } }
      return show("errors");
    }
    var tmEl = e.target.closest("[data-adm-tm]");
    if (tmEl && db()) {
      var tid = +tmEl.getAttribute("data-adm-tm"), tm = tms.filter(function (x) { return x.id === tid; })[0], rr;
      if (e.target.closest("[data-tm-approve]")) rr = await db().from("testimonials").update({ approved: !tm.approved }).eq("id", tid);
      else if (e.target.closest("[data-tm-del]")) { if (!confirm("Delete this testimonial permanently?")) return; rr = await db().from("testimonials").delete().eq("id", tid); }
      else return;
      if (rr.error) { alert(rr.error.message); return; }
      return show("tm");
    }
    var li = e.target.closest("[data-adm-wall]"); if (!li) return;
    var id = +li.getAttribute("data-adm-wall"), w = wall.filter(function (x) { return x.id === id; })[0], c = db(), r;
    if (!c) return;
    if (e.target.closest("[data-adm-hide]")) r = await c.from("wall").update({ hidden: !w.hidden }).eq("id", id);
    else if (e.target.closest("[data-adm-del]")) { if (!confirm("Delete this commit permanently?")) return; r = await c.from("wall").delete().eq("id", id); }
    else return;
    if (r.error) { alert(r.error.message); return; }
    show("wall");
    if (window.SamukaWall) window.SamukaWall.reload();
  }
  function open() {
    if (!owner()) return false;
    if (!dlg) build();
    dlg.hidden = false;
    document.documentElement.style.overflow = "hidden";
    show(tab);
    return true;
  }
  function close() { if (!dlg) return; dlg.hidden = true; document.documentElement.style.overflow = ""; }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-open-admin]")) { e.preventDefault(); var a = A(); if (a) a.close(); open(); }
  });
  function boot() {
    var a = A();
    if (a && a.extend) a.extend(function (state) {
      return state.role === "samuka" ? '<button class="btn acct__tool" type="button" data-open-admin>🛠 admin</button>' : "";
    }, { tab: "team" });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.SamukaAdmin = { open: open };
})();
