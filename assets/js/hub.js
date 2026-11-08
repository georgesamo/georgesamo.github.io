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
    if (P) set("[data-hub-online]", String(P.count()));
    if (A && A.user() && Ach) {
      var n = Ach.list.filter(function (a) { return Ach.has(a.key); }).length;
      set("[data-hub-ach]", '<a href="/u/">' + n + " / " + Ach.list.length + "</a>");
    } else if (A && A.enabled) set("[data-hub-ach]", '<a href="#" data-acct-open>sign in</a>');
    var box = $("[data-hub-players]");
    if (box && P) {
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

  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-acct-open]");
    if (a && !a.closest("[data-wall], [data-pcard]")) { e.preventDefault(); var A = window.SamukaAuth; if (A) A.open(); }
  });

  window.addEventListener("samuka:auth", function () { teamLinks(); paintStats(); });
  window.addEventListener("samuka:achievement", paintStats);
  window.addEventListener("samuka:presence", paintStats);
  setInterval(paintStats, 5000);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { teamLinks(); paintStats(); }); else { teamLinks(); paintStats(); }
})();
