/* Samuka · privacy-friendly analytics: no cookies, no IP, no account ids.
 * Sends page views, which profile sections were actually read (visible for 3 s),
 * which games were started, and which features were used (SamukaTrack below),
 * with a random id that lives only in this tab.
 * Respects Do Not Track / Global Privacy Control, and never runs locally.
 *
 * SamukaTrack("tour:done") / SamukaTrack("recap:shown", true): one feature use, a short name
 * ("area:what", ≤ 60 chars, no personal data). true = at most once per tab. Feature uses go in
 * their own insert, so if supabase/analytics-uses.sql isn't applied yet only they are dropped.
 * Locally (no sending) they are kept in window.__samukaTracked for tests.
 */
(function () {
  "use strict";
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var enabled = !local && navigator.doNotTrack !== "1" && !navigator.globalPrivacyControl;
  var sid = null;
  function id() {
    if (sid) return sid;
    try { sid = sessionStorage.getItem("samuka-sid"); if (!sid) { sid = Math.random().toString(36).slice(2, 12); sessionStorage.setItem("samuka-sid", sid); } }
    catch (e) { sid = Math.random().toString(36).slice(2, 12); }
    return sid;
  }
  function client() { var A = window.SamukaAuth; return A && A.client && A.client(); }

  /* ---------- feature uses ---------- */
  var uses = [], usesT = 0, once = {}, waits = 0;
  function flushUses() {
    clearTimeout(usesT);
    usesT = setTimeout(function () {
      var c = client();
      if (!c) { if (uses.length && ++waits < 20) flushUses(); return; }   // auth.js not ready yet (or blocked)
      if (!uses.length) return;
      var batch = uses.splice(0, 20);
      c.from("analytics_events").insert(batch).then(function () {}, function () {});
    }, 1500);
  }
  window.SamukaTrack = function (name, onlyOnce) {
    try {
      name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (!name) return;
      if (onlyOnce) { if (once[name]) return; once[name] = 1; }
      if (!enabled) { if (local) (window.__samukaTracked = window.__samukaTracked || []).push(name); return; }
      uses.push({ kind: "use", path: location.pathname.slice(0, 120), detail: name, referrer: null, sid: id() });
      flushUses();
    } catch (e) {}
  };
  // a streak dot is the reminder doing its job: count the clicks that follow it
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a.has-streak-dot, a.has-chal-dot");
    if (a) window.SamukaTrack(a.classList.contains("has-streak-dot") ? "streak:dot-click" : "challenge:dot-click");
  }, true);
  if (!enabled) return;

  /* ---------- page views, sections read, games started ---------- */
  var queue = [], seen = {}, io = null, timers = {};
  function ref() {
    try { var h = new URL(document.referrer).hostname; return h && h !== location.hostname ? h.replace(/^www\./, "").slice(0, 80) : ""; } catch (e) { return ""; }
  }
  function send(kind, detail) {
    queue.push({ kind: kind, path: location.pathname.slice(0, 120), detail: detail ? String(detail).slice(0, 60) : null, referrer: kind === "view" ? ref() : null, sid: id() });
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
