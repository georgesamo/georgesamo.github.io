/* Samuka · client error reporting. Loads before every other site script.
 * When a script on this site throws (or a promise rejects unhandled), sends the
 * owner a short note: the message, the file/line/col, the page path, a short
 * browser label ("Chrome 131 · Android") and the build id. No account ids,
 * nicknames, emails, IPs or cookies; emails inside messages are blanked out.
 * Each error is sent once per page load, at most 5 per visit (tab session).
 * Errors from browser extensions and other origins (CDNs, embeds) are ignored.
 * Off on localhost unless the URL has ?report-errors=1. Never throws itself.
 * Backend: supabase/errors.sql (insert-only table public.client_errors).
 */
(function () {
  "use strict";
  var MAX = 5, KEY = "samuka-errs";
  var seen = {}, sent = 0, busy = false, origin = location.origin;
  try {
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local && !/[?&]report-errors=1(&|$)/.test(location.search)) return;
  } catch (e) { return; }

  var sid = Math.random().toString(36).slice(2, 12);
  function count(add) {   // reports already sent this visit (sessionStorage when it works)
    try {
      var n = +sessionStorage.getItem(KEY) || 0;
      if (add) sessionStorage.setItem(KEY, String(n + add));
      return Math.max(n + (add || 0), sent);
    } catch (e) { return sent; }
  }
  function clip(s, n) {
    return String(s == null ? "" : s).replace(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, "[email]").slice(0, n);
  }
  // site files only, as a path ("/assets/js/app.js"); null for anything else
  function ownPath(url) {
    if (!url) return "";
    if (/^(chrome|moz|safari|safari-web|ms-browser|edge)-extension:|^webkit-masked-url:/i.test(url)) return null;
    try { var u = new URL(url, location.href); return u.origin === origin ? u.pathname : null; } catch (e) { return null; }
  }
  // first stack frame's file/line/col, and a trimmed stack with this site's origin removed
  function frame(stack) {
    var m = /((?:https?|[a-z-]+-extension|webkit-masked-url):\/\/[^\s)]+?):(\d+):(\d+)/i.exec(stack || "");
    return m ? { src: m[1], line: +m[2], col: +m[3] } : null;
  }
  function shortStack(stack) {
    if (!stack) return null;
    return clip(String(stack).split(origin).join("").split("\n").slice(0, 6).join("\n").replace(/\?v=[^:\s)]+/g, ""), 600) || null;
  }
  function ua() {
    var s = navigator.userAgent || "", b = "other", o = "other", m;
    if ((m = /Edg\/(\d+)/.exec(s))) b = "Edge " + m[1];
    else if ((m = /SamsungBrowser\/(\d+)/.exec(s))) b = "Samsung " + m[1];
    else if ((m = /OPR\/(\d+)/.exec(s))) b = "Opera " + m[1];
    else if ((m = /Firefox\/(\d+)/.exec(s))) b = "Firefox " + m[1];
    else if ((m = /CriOS\/(\d+)/.exec(s))) b = "Chrome " + m[1];
    else if ((m = /Chrome\/(\d+)/.exec(s))) b = "Chrome " + m[1];
    else if ((m = /Version\/(\d+)[.\d]* .*Safari/.exec(s))) b = "Safari " + m[1];
    if (/Android/.test(s)) o = "Android";
    else if (/iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && navigator.maxTouchPoints > 1)) o = "iOS";
    else if (/Windows/.test(s)) o = "Windows";
    else if (/Mac OS X/.test(s)) o = "macOS";
    else if (/CrOS/.test(s)) o = "ChromeOS";
    else if (/Linux/.test(s)) o = "Linux";
    return b + " · " + o;
  }

  function report(kind, message, src, line, col, stack) {
    if (busy) return;   // an error raised while reporting is never reported
    busy = true;
    try {
      var f = frame(stack);
      if (!src && f) { src = f.src; line = line || f.line; col = col || f.col; }
      var path = ownPath(src);
      if (path === null) return;                     // extension or another origin
      if (!path && kind === "error") return;         // cross-origin "Script error." has no file
      if (stack && /-extension:\/\//i.test(stack)) return;
      message = clip(message || "(no message)", 300);
      var key = kind + "|" + message + "|" + path + "|" + (line || 0) + "|" + (col || 0);
      if (seen[key]) return;
      seen[key] = 1;
      if (count() >= MAX) return;
      sent++; count(1);
      var row = {
        kind: kind, message: message, source: path ? path.slice(0, 160) : null,
        line: line > 0 ? Math.min(line | 0, 2e9) : null, col: col > 0 ? Math.min(col | 0, 2e9) : null,
        path: clip(location.pathname, 120), ua: ua().slice(0, 60), build: null, stack: shortStack(stack), sid: sid
      };
      var S = window.SITE || {}, cfg = S.supabase || {};
      if (S.build) row.build = clip(S.build, 40);
      var hook = window.__samukaErrorSink;   // tests capture rows here instead of sending them
      if (typeof hook === "function") { hook(row); return; }
      if (!cfg.url || !cfg.anon_key || !window.fetch) return;
      window.fetch(String(cfg.url).replace(/\/$/, "") + "/rest/v1/client_errors", {
        method: "POST", keepalive: true, credentials: "omit",
        headers: { apikey: cfg.anon_key, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(row)
      }).then(function () {}, function () {});
    } catch (e) {
      /* never let the reporter break the page */
    } finally { busy = false; }
  }

  window.addEventListener("error", function (e) {
    try {
      if (!e || !(e.message || e.error)) return;   // resource load errors (img, script 404) carry no message
      var err = e.error;
      report("error", e.message || (err && err.message), e.filename, e.lineno, e.colno, err && err.stack);
    } catch (x) {}
  });
  window.addEventListener("unhandledrejection", function (e) {
    try {
      var r = e && e.reason, msg;
      if (r && typeof r === "object") msg = (r.name && r.message ? r.name + ": " + r.message : r.message) || Object.prototype.toString.call(r);
      else msg = String(r);
      report("rejection", msg, "", 0, 0, r && r.stack);
    } catch (x) {}
  });
})();
