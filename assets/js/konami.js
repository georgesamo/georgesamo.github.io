/* Samuka · ↑ ↑ ↓ ↓ ← → ← → B A unlocks the secret CRT skin (for everyone, saved on this device
 * and, when signed in, on the account). */
(function () {
  "use strict";
  var SEQ = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  var pos = 0;
  function unlock() {
    try { localStorage.setItem("samuka-konami", "1"); } catch (e) {}
    var fx = document.createElement("div");
    fx.className = "crt-on";
    fx.setAttribute("aria-hidden", "true");
    fx.innerHTML = "<span>PHOSPHOR MODE UNLOCKED</span>";
    document.body.appendChild(fx);
    setTimeout(function () { if (window.Samuka) window.Samuka.setSkin("crt", { user: true }); }, 450);
    setTimeout(function () { fx.remove(); }, 1600);
    if (window.SamukaAch) window.SamukaAch.unlock("konami");
    var A = window.SamukaAuth; if (A && A.refresh) A.refresh();
  }
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var k = (e.key || "").toLowerCase();
    if (k === SEQ[pos]) { pos++; if (pos === SEQ.length) { pos = 0; unlock(); } }
    else pos = k === SEQ[0] ? 1 : 0;
  });
  window.SamukaKonami = { unlock: unlock };
})();
