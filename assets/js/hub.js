/* Samuka · arcade hub glue: live lobby stats, "online now" list, team-only links,
 * and page-aware helpers (sections that live on another page are reached by URL).
 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (s) { return document.querySelector(s); };
  function set(sel, html) { var el = $(sel); if (el) el.innerHTML = html; }

  function dailyNo() { return Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.UTC(2026, 10, 8)) / 864e5) + 1; }

  function paintStats() {
    var A = window.SamukaAuth, Ach = window.SamukaAch, P = window.SamukaPresence;
    set("[data-hub-daily]", '<a href="#" data-daily>daily #' + dailyNo() + "</a>");
    var seeOnline = !!(P && P.visible && P.visible());
    if (seeOnline) set("[data-hub-online]", String(P.count()));
    if (A && A.user() && Ach) {
      var n = Ach.list.filter(function (a) { return Ach.has(a.key); }).length;
      set("[data-hub-ach]", '<a href="/u/">' + n + " / " + Ach.list.length + "</a>");
    } else if (A && A.enabled) set("[data-hub-ach]", '<a href="#" data-acct-open>sign in</a>');
    var box = $("[data-hub-players]");
    if (box && seeOnline) {
      var peers = P.peers(), me = A && A.user() ? A.publicName() : "guest";
      box.innerHTML = '<p class="hub-card__title">online now · ' + P.count() + "</p>" +
        '<ul class="players"><li><i></i><b>you</b> <span class="muted">(' + esc(me) + ")</span></li>" +
        peers.slice(0, 8).map(function (p) {
          var cls = p.role === "samuka" || p.role === "nino" ? " class=\"is-" + p.role + "\"" : "";
          var name = p.role === "guest" ? '<span class="muted">guest</span>' : '<a href="/u/?n=' + encodeURIComponent(p.name) + '">' + esc(p.name) + "</a>";
          return "<li" + cls + "><i></i>" + name + (p.role === "samuka" ? ' <span class="lb__role lb__role--samuka">creator</span>' : p.role === "nino" ? ' <span class="lb__role lb__role--nino">PM</span>' : "") + "</li>";
        }).join("") + (peers.length > 8 ? '<li class="muted">+' + (peers.length - 8) + " more</li>" : "") + "</ul>" +
        (peers.length ? "" : '<p class="muted" style="margin-top:8px">Just you right now. Invite someone to a <a href="#" data-race>1v1</a>.</p>');
    }
  }

  function teamLinks() {
    var A = window.SamukaAuth, team = !!(A && A.user() && (A.role() === "samuka" || A.role() === "nino"));
    document.querySelectorAll("[data-team-only]").forEach(function (el) { el.hidden = !team; });
  }

  // sidebar folders: click a folder name to fold it; remembered per device. The closed list lives on
  // <html data-tree-closed> (set before paint in default.html), so CSS hides folded groups with no flash.
  var TREE_KEY = "samuka-tree-closed";
  function syncFolders() {
    var closed = (document.documentElement.dataset.treeClosed || "").split(" ");
    document.querySelectorAll("[data-tree-dir]").forEach(function (b) { b.setAttribute("aria-expanded", String(closed.indexOf(b.getAttribute("data-tree-dir")) < 0)); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tree-dir]"); if (!b) return;
    var C = window.SamukaAccountCore, root = document.documentElement;
    root.dataset.treeClosed = C ? C.toggleFolder(root.dataset.treeClosed, b.getAttribute("data-tree-dir")) : "";
    try { localStorage.setItem(TREE_KEY, root.dataset.treeClosed); } catch (x) {}
    syncFolders();
  });
  window.addEventListener("samuka:page", syncFolders);   // nav.js swaps the sidebar markup
  syncFolders();

  // phone "more" sheet
  document.addEventListener("click", function (e) {
    var sheet = document.getElementById("msheet"); if (!sheet) return;
    var btn = e.target.closest("[data-mnav-more]");
    if (btn) { sheet.hidden = !sheet.hidden; btn.setAttribute("aria-expanded", String(!sheet.hidden)); return; }
    if (!sheet.hidden && (e.target.closest("[data-mnav-close]") || e.target.closest(".msheet__card a, .msheet__card button"))) {
      setTimeout(function () { sheet.hidden = true; }, e.target.closest("[data-toggle-theme]") ? 250 : 0);
    }
  });
  document.addEventListener("keydown", function (e) { var sheet = document.getElementById("msheet"); if (e.key === "Escape" && sheet && !sheet.hidden) sheet.hidden = true; });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-acct-open]");
    if (a && !a.closest("[data-wall], [data-pcard]")) { e.preventDefault(); var A = window.SamukaAuth; if (A) A.open(); }
  });

  window.addEventListener("samuka:auth", function () { teamLinks(); paintStats(); });
  window.addEventListener("samuka:achievement", paintStats);
  window.addEventListener("samuka:presence", paintStats);
  window.addEventListener("samuka:page", function () { teamLinks(); paintStats(); });
  // live stats refresh every 5 s, but never in a background tab (and once more when it comes back)
  setInterval(function () { if (!document.hidden) paintStats(); }, 5000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) paintStats(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { teamLinks(); paintStats(); }); else { teamLinks(); paintStats(); }
})();
