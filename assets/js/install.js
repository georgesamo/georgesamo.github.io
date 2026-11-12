/* Samuka · installable app: registers the service worker (/sw.js) and offers an
 * "install app" button when the browser allows it. ?daily=1 (app shortcut) opens the daily.
 *
 * Where the worker runs (swMode):
 *   live site        registered
 *   localhost        not registered, and any old registration is removed, so the dev preview is
 *                    never served from a cache. ?sw=1 opts this tab in (kept for the tab's session),
 *                    ?sw=0 opts it out again.
 *   kill switch      <meta name="samuka-sw" content="off"> (`service_worker: false` in _config.yml):
 *                    unregistered everywhere.
 */
(function () {
  "use strict";
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  // "register" | "unregister", plus the tab's new opt-in flag ("1" / "" = clear / null = unchanged)
  function swMode(host, search, flag, off) {
    var q = /[?&]sw=([01])(?:&|$)/.exec(search || ""), opt = q ? q[1] : null;
    if (off) return { mode: "unregister", flag: "" };
    if (!LOCAL.test(host)) return { mode: "register", flag: null };
    if (opt === "0") return { mode: "unregister", flag: "" };
    if (opt === "1" || flag === "1") return { mode: "register", flag: opt === "1" ? "1" : null };
    return { mode: "unregister", flag: null };
  }
  window.SamukaInstall = { swMode: swMode };

  if ("serviceWorker" in navigator && window.isSecureContext !== false) {
    var meta = document.querySelector('meta[name="samuka-sw"]'), flag = null;
    try { flag = sessionStorage.getItem("samuka-sw"); } catch (e) {}
    var plan = swMode(location.hostname, location.search, flag, !!(meta && meta.content === "off"));
    try { if (plan.flag === "1") sessionStorage.setItem("samuka-sw", "1"); else if (plan.flag === "") sessionStorage.removeItem("samuka-sw"); } catch (e) {}
    var sw = navigator.serviceWorker;
    window.addEventListener("load", function () {
      if (plan.mode === "unregister") {
        // this can win the race against the kill-switch worker's own cleanup, so clear its caches here too
        if (sw.getRegistrations) sw.getRegistrations().then(function (rs) {
          if (!rs.length) return;
          rs.forEach(function (r) { r.unregister(); });
          if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf("samuka-") === 0) caches.delete(k); }); });
        }).catch(function () {});
        return;
      }
      sw.register("/sw.js", { updateViaCache: "none" }).then(function (reg) {
        // seamless navigation means few full page loads: look for a new build now and then
        var last = Date.now();
        window.addEventListener("samuka:page", function () {
          if (Date.now() - last < 15 * 60 * 1000) return;
          last = Date.now(); reg.update().catch(function () {});
        });
      }).catch(function () {});
    });
  }
  var deferred = null, btn = null;
  function mount() {
    if (btn || !deferred) return;
    var host = document.querySelector(".tree__foot"); if (!host) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "tree__btn"; btn.innerHTML = "<span>⬇</span> install app";
    btn.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; btn.remove(); btn = null; });
    });
    host.insertBefore(btn, host.firstChild);
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; mount(); });
  window.addEventListener("appinstalled", function () { if (btn) btn.remove(); btn = null; deferred = null; });
  if (/[?&]daily=1/.test(location.search)) {
    var tries = 0;
    (function openDaily() {
      var A = window.SamukaAuth;
      if (window.SamukaScores && A && A.ready && A.ready()) { history.replaceState(null, "", location.pathname); window.SamukaScores.openDaily(); }
      else if (++tries < 20) setTimeout(openDaily, 400);
    })();
  }
})();
