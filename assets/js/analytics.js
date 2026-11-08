/* Samuka · privacy-friendly analytics: no cookies, no IP, no account ids.
 * Sends page views, which profile sections were actually read (visible for 3 s)
 * and which games were started, with a random id that lives only in this tab.
 * Respects Do Not Track / Global Privacy Control, and never runs locally.
 */
(function () {
  "use strict";
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local || navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
  var sid;
  try { sid = sessionStorage.getItem("samuka-sid"); if (!sid) { sid = Math.random().toString(36).slice(2, 12); sessionStorage.setItem("samuka-sid", sid); } }
  catch (e) { sid = Math.random().toString(36).slice(2, 12); }
  var queue = [], seen = {}, io = null, timers = {};
  function client() { var A = window.SamukaAuth; return A && A.client && A.client(); }
  function ref() {
    try { var h = new URL(document.referrer).hostname; return h && h !== location.hostname ? h.replace(/^www\./, "").slice(0, 80) : ""; } catch (e) { return ""; }
  }
  function send(kind, detail) {
    queue.push({ kind: kind, path: location.pathname.slice(0, 120), detail: detail ? String(detail).slice(0, 60) : null, referrer: kind === "view" ? ref() : null, sid: sid });
    flush();
  }
  var flushT = 0;
  function flush() {
    clearTimeout(flushT);
    flushT = setTimeout(function () {
      var c = client(); if (!c || !queue.length) return;
      var batch = queue.splice(0, 20);
      c.from("analytics_events").insert(batch).then(function () {}, function () {});
    }, 1200);
  }
  function watchSections() {
    if (io) io.disconnect();
    if (!("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.id; if (!id) return;
        var key = location.pathname + "#" + id;
        if (en.isIntersecting) {
          if (seen[key] || timers[key]) return;
          timers[key] = setTimeout(function () { seen[key] = 1; send("section", id); }, 3000);
        } else { clearTimeout(timers[key]); delete timers[key]; }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll("main section[id]").forEach(function (s) { io.observe(s); });
  }
  function page() { send("view"); watchSections(); }
  window.addEventListener("samuka:game", function (e) { var d = e.detail || {}; if (d.name === "start") send("play", d.game + (d.mode && d.mode !== "free" ? ":" + d.mode : "")); });
  window.addEventListener("samuka:page", page);
  // wait until auth.js created the client
  var tries = 0;
  (function boot() { if (client()) page(); else if (++tries < 20) setTimeout(boot, 500); })();
})();
