/* Samuka · commit wall: a guestbook rendered as a git log
 * Anyone can read; signed-in visitors leave a one-line commit (max 72 chars,
 * 3 an hour). Samuka (owner role) can hide or delete entries. Live via Realtime.
 */
(function () {
  "use strict";
  var root = null, rows = [], sub = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function A() { return window.SamukaAuth; }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function isOwner() { var a = A(); return a && a.user() && a.role() === "samuka"; }
  function ago(t) {
    var s = Math.max(1, (Date.now() - new Date(t).getTime()) / 1000);
    if (s < 60) return "just now";
    var u = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
    for (var i = 0; i < u.length; i++) if (s >= u[i][0]) { var n = Math.floor(s / u[i][0]); return n + " " + u[i][1] + (n > 1 ? "s" : "") + " ago"; }
    return "";
  }
  var MOCK_KEY = "samuka-mock-wall";
  function mockRows() { try { return JSON.parse(sessionStorage.getItem(MOCK_KEY) || "null"); } catch (e) { return null; } }

  async function load() {
    var c = db();
    if (c) {
      var r = await c.from("wall").select("id, author, message, sha, hidden, created_at").order("created_at", { ascending: false }).limit(60);
      if (r.error) { paint('<p class="muted">The wall is offline right now.</p>'); console.warn("[wall]", r.error.message); return; }
      rows = r.data || [];
    } else {
      rows = mockRows() || [
        { id: 2, author: "rubyist", message: "feat: stopped by, love the Sidekiq game", sha: "a1b2c3d", created_at: new Date(Date.now() - 36e5).toISOString() },
        { id: 1, author: "samuka", message: "chore: initial commit of the wall", sha: "0f00ba7", created_at: new Date(Date.now() - 864e5).toISOString() }
      ];
    }
    paint();
  }
  function form() {
    var a = A();
    if (!a || !a.enabled) return "";
    if (!a.user()) return '<p class="wall__signin muted"><button class="linkish" type="button" data-acct-open>sign in</button> to leave a commit.</p>';
    return '<form class="wall__form" data-wall-form>' +
      '<label class="wall__prompt" for="wall-msg"><span class="prompt">$</span> git commit -m</label>' +
      '<input id="wall-msg" name="message" maxlength="72" required autocomplete="off" placeholder="&quot;feat: say hi to Samuka&quot;">' +
      '<span class="wall__count" data-wall-count>72</span>' +
      '<button class="btn btn--primary" type="submit">commit</button>' +
      '<p class="wall__as muted">as <b>' + esc(a.publicName()) + '</b> · <button class="linkish" type="button" data-acct-open>change nickname</button> · 72 chars · 3 an hour</p>' +
      '<p class="wall__err" data-wall-err role="alert"></p></form>';
  }
  function paint(err) {
    if (!root) return;
    var owner = isOwner();
    root.innerHTML = form() + (err || (rows.length ? '<ol class="wall__log">' + rows.map(function (r) {
      return '<li class="wall__row' + (r.hidden ? " is-hidden" : "") + '"><span class="wall__dot" aria-hidden="true"></span>' +
        '<span class="wall__sha">' + esc(r.sha) + '</span> <span class="wall__msg">' + esc(r.message) + "</span>" +
        '<span class="wall__meta"><span class="wall__author">' + esc(r.author) + '</span> · <time datetime="' + esc(r.created_at) + '">' + ago(r.created_at) + "</time>" +
        (owner ? ' <button class="wall__mod" type="button" data-wall-hide="' + r.id + '">' + (r.hidden ? "unhide" : "hide") + '</button><button class="wall__mod" type="button" data-wall-del="' + r.id + '">delete</button>' : "") +
        "</span></li>";
    }).join("") + "</ol>" : '<p class="muted wall__empty">No commits yet. Be the first.</p>'));
  }
  async function post(msg) {
    var a = A(), errEl = root.querySelector("[data-wall-err]");
    var row = { author: a.publicName(), message: msg };
    var c = db();
    if (c) {
      var r = await c.from("wall").insert(row).select("id, author, message, sha, hidden, created_at").single();
      if (r.error) { errEl.textContent = /hour/.test(r.error.message) ? "Three commits an hour, please. Try again later." : "Could not commit: " + r.error.message; return false; }
      if (!rows.some(function (x) { return x.id === r.data.id; })) rows.unshift(r.data);
    } else {
      rows.unshift({ id: Date.now(), author: row.author, message: msg, sha: Math.random().toString(16).slice(2, 9), created_at: new Date().toISOString() });
      try { sessionStorage.setItem(MOCK_KEY, JSON.stringify(rows)); } catch (e) {}
    }
    if (window.SamukaAch) window.SamukaAch.unlock("wall");
    paint();
    return true;
  }
  async function moderate(id, action) {
    var c = db(), r;
    if (!c) { rows = rows.filter(function (x) { return action !== "del" || x.id !== id; }); rows.forEach(function (x) { if (x.id === id && action === "hide") x.hidden = !x.hidden; }); paint(); return; }
    if (action === "del") r = await c.from("wall").delete().eq("id", id);
    else { var cur = rows.filter(function (x) { return x.id === id; })[0]; r = await c.from("wall").update({ hidden: !(cur && cur.hidden) }).eq("id", id); }
    if (r.error) { alert(r.error.message); return; }
    load();
  }
  function live() {
    var c = db(); if (!c || sub) return;
    sub = c.channel("wall-live").on("postgres_changes", { event: "*", schema: "public", table: "wall" }, function () { load(); }).subscribe();
  }

  function boot() {
    root = document.querySelector("[data-wall]");
    if (!root) return;
    load();
    root.addEventListener("submit", function (e) {
      if (!e.target.matches("[data-wall-form]")) return;
      e.preventDefault();
      var input = e.target.elements.message, msg = input.value.trim().replace(/\s+/g, " ");
      if (!msg) return;
      var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
      post(msg).then(function (ok) { btn.disabled = false; if (ok) { var i = root.querySelector("#wall-msg"); if (i) i.value = ""; } });
    });
    root.addEventListener("input", function (e) {
      if (e.target.id === "wall-msg") { var c = root.querySelector("[data-wall-count]"); if (c) c.textContent = 72 - e.target.value.length; }
    });
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-acct-open]")) { var a = A(); if (a) a.open(); return; }
      var h = e.target.closest("[data-wall-hide]"), d = e.target.closest("[data-wall-del]");
      if (h) moderate(+h.getAttribute("data-wall-hide"), "hide");
      if (d && confirm("Delete this commit from the wall? This can't be undone.")) moderate(+d.getAttribute("data-wall-del"), "del");
    });
    if (!sub) setTimeout(live, 3000);
  }
  window.addEventListener("samuka:auth", function () { if (root) load(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.addEventListener("samuka:page", boot);
  window.SamukaWall = { reload: load };
})();
