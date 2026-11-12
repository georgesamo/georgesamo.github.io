/* Samuka · loads the soundtrack (lofi.js, the biggest script on the site) only when it's needed.
 * Until then a lookalike ♪ button sits in the header; hovering, focusing or pressing it loads
 * lofi.js, which mounts the real button. A click then starts the music and opens the dock, just
 * like the real button. It also loads:
 *   - on pages that show the music (collection, settings, patch bay, the soundtrack room): [data-needs-music]
 *   - when a finished run earns a bonus track that isn't unlocked yet (lofi.js's own listener
 *     would have missed that game-over), then unlocks it
 * window.SamukaMusic.ready(fn) runs fn(SamukaLofi) once it's there (loading it if needed);
 * "samuka:music-ready" fires once on window when it arrives.
 */
(function () {
  "use strict";
  var SRC = window.SamukaMusicSrc, promise = null, stub = null, waiting = [];
  var AC = window.AudioContext || window.webkitAudioContext;
  var BONUS_GAMES = { gems: 1, sidekiq: 1, schema: 1, pitwall: 1 };

  function loaded() { return !!window.SamukaLofi; }
  function load() {
    if (loaded()) return Promise.resolve(window.SamukaLofi);
    if (promise) return promise;
    promise = new Promise(function (ok, fail) {
      if (!SRC) return fail(new Error("no soundtrack source"));
      // the stub gives up the .lofi-btn class first, so lofi.js mounts its own button next to it
      if (stub) stub.classList.remove("lofi-btn");
      var s = document.createElement("script");
      s.src = SRC; s.async = true;
      s.onload = function () {
        if (stub) { stub.remove(); stub = null; }
        if (!window.SamukaLofi) return fail(new Error("soundtrack didn't start"));
        ok(window.SamukaLofi);
        try { window.dispatchEvent(new CustomEvent("samuka:music-ready")); } catch (e) {}
        waiting.splice(0).forEach(function (fn) { try { fn(window.SamukaLofi); } catch (e) {} });
      };
      s.onerror = function () { promise = null; if (stub) { stub.classList.add("lofi-btn"); stub.classList.remove("is-loading"); } fail(new Error("couldn't load the soundtrack")); };
      document.head.appendChild(s);
    });
    return promise;
  }
  function ready(fn) {
    if (loaded()) { fn(window.SamukaLofi); return; }
    waiting.push(fn);
    load().catch(function () {});
  }

  /* ---------- the stand-in ♪ button ---------- */
  function mountStub() {
    if (loaded() || !AC || stub) return;
    var bar = document.querySelector(".tabs__actions");
    if (!bar || bar.querySelector(".lofi-btn")) return;
    stub = document.createElement("button");
    stub.type = "button";
    stub.className = "icon-btn lofi-btn lofi-stub";
    stub.setAttribute("aria-haspopup", "dialog");
    stub.setAttribute("aria-expanded", "false");
    stub.setAttribute("aria-label", "Soundtrack player");
    stub.textContent = "♪";
    var warm = function () { load().catch(function () {}); };
    stub.addEventListener("pointerover", warm, { once: true });
    stub.addEventListener("focus", warm, { once: true });
    stub.addEventListener("click", function () {
      var b = stub;
      if (b) { b.classList.add("is-loading"); b.setAttribute("aria-busy", "true"); }
      // the real button does the rest: first click starts the music and opens the dock
      load().then(function () {
        var real = document.querySelector(".lofi-btn:not(.lofi-stub)");
        if (real) real.click();
      }).catch(function () { if (b) { b.classList.remove("is-loading"); b.removeAttribute("aria-busy"); b.title = "The soundtrack couldn't load. Try again."; } });
    });
    var ref = bar.querySelector("[data-toggle-theme]");
    if (ref && ref.parentNode) ref.parentNode.insertBefore(stub, ref); else bar.appendChild(stub);
  }

  /* ---------- pages that show the music ---------- */
  function needed() { if (!loaded() && document.querySelector("[data-needs-music]")) load().catch(function () {}); }

  /* ---------- bonus tracks earned before the player was loaded ---------- */
  function bonusOpen(game) {
    try { var d = JSON.parse(localStorage.getItem("samuka-suite")) || {}; return !!(d.bonus && d.bonus[game]); } catch (e) { return true; }
  }
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name !== "over" || loaded() || !BONUS_GAMES[d.game] || bonusOpen(d.game)) return;
    ready(function (L) { if (L.bonus && L.bonus.unlock) L.bonus.unlock(d.game); });
  });

  function boot() { mountStub(); needed(); }
  window.addEventListener("samuka:page", needed);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.SamukaMusic = { load: load, ready: ready, loaded: loaded };
})();
