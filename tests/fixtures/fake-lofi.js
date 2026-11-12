/* A stand-in for assets/js/lofi.js in tests/music.test.js: exposes SamukaLofi and mounts a ♪ button
 * the way the real one does (skipped if a .lofi-btn is already there). Like the real one, bonus.unlock
 * returns true only the first time a track is opened. window.__lofiLoads counts how often it ran. */
(function () {
  window.__lofiLoads = (window.__lofiLoads || 0) + 1;
  var calls = window.__lofiCalls = [], open = {};
  window.SamukaLofi = {
    start: function () { calls.push("start"); },
    stop: function () { calls.push("stop"); },
    bonus: {
      unlock: function (g) { calls.push("unlock:" + g); if (open[g]) return false; open[g] = 1; return true; },
      open: function (g) { return !!open[g]; }
    }
  };
  var bar = document.querySelector(".tabs__actions");
  if (!bar || bar.querySelector(".lofi-btn")) return;
  var b = document.createElement("button");
  b.type = "button"; b.className = "icon-btn lofi-btn"; b.textContent = "♪";
  b.addEventListener("click", function () { calls.push("click"); });
  bar.insertBefore(b, bar.querySelector("[data-toggle-theme]"));
})();
