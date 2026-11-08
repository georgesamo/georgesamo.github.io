/* Samuka · installable app: registers the service worker (live site only) and offers
 * an "install app" button when the browser allows it. ?daily=1 (app shortcut) opens the daily. */
(function () {
  "use strict";
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if ("serviceWorker" in navigator && !local) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
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
