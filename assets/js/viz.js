/* Samuka · status-bar visualizer for the generated lo-fi: mirrored spectrum bars in the skin's colours */
(function () {
  "use strict";
  function reduced() { return window.SamukaCalm ? window.SamukaCalm.on() : !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }   // calm mode (live)
  var slot = null, cv = null, g = null, raf = 0, data = null;
  function colors() {
    var cs = getComputedStyle(document.documentElement);
    return { a: cs.getPropertyValue("--accent").trim() || "#3ad08f", b: cs.getPropertyValue("--hl").trim() || "#d9b45a" };
  }
  var col = null;
  function draw() {
    raf = requestAnimationFrame(draw);
    var L = window.SamukaLofi, an = L && L.analyser && L.analyser();
    if (!an || !cv) return;
    if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(data);
    var W = cv.width, H = cv.height, n = 24, bw = W / n;
    g.clearRect(0, 0, W, H);
    for (var i = 0; i < n; i++) {
      // log-ish bin spread so the bass doesn't take every bar
      var bin = Math.min(data.length - 1, Math.floor(Math.pow(i / n, 1.7) * data.length * 0.7) + 1);
      var v = data[bin] / 255, h = Math.max(1.5, v * H);
      g.fillStyle = i < n * 0.35 ? col.b : col.a;
      g.globalAlpha = 0.45 + v * 0.55;
      g.fillRect(i * bw + 1, (H - h) / 2, bw - 2, h);
    }
    g.globalAlpha = 1;
  }
  function on() {
    slot = document.querySelector("[data-viz]");
    if (!slot || cv) return;
    col = colors();
    if (reduced()) { slot.textContent = "♪ playing"; return; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv = document.createElement("canvas");
    cv.width = 120 * dpr; cv.height = 16 * dpr;
    cv.setAttribute("aria-hidden", "true");
    g = cv.getContext("2d");
    slot.appendChild(cv);
    draw();
  }
  function off() {
    cancelAnimationFrame(raf); raf = 0;
    if (cv) cv.remove(); cv = null;
    if (slot) slot.textContent = "";
  }
  window.addEventListener("samuka:lofi", function (e) { if (e.detail && e.detail.on) on(); else off(); });
  window.addEventListener("samuka:theme", function () { col = colors(); });
})();
