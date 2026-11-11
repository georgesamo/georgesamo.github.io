/* A stand-in for assets/js/lofi.js in tests/music.test.js: exposes SamukaLofi and mounts a ♪ button
 * the way the real one does (skipped if a .lofi-btn is already there). */
(function () {
  var calls = window.__lofiCalls = [];
  window.SamukaLofi = {
    start: function () { calls.push("start"); },
    stop: function () { calls.push("stop"); },
    bonus: { unlock: function (g) { calls.push("unlock:" + g); return true; } }
  };
  var bar = document.querySelector(".tabs__actions");
  if (!bar || bar.querySelector(".lofi-btn")) return;
  var b = document.createElement("button");
  b.type = "button"; b.className = "icon-btn lofi-btn"; b.textContent = "♪";
  b.addEventListener("click", function () { calls.push("click"); });
  bar.insertBefore(b, bar.querySelector("[data-toggle-theme]"));
})();
