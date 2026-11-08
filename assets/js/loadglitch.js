/* Samuka · page-load glitch: every page arrives with a short cyberpunk "scratch" on its title.
 * RGB-split slices in the theme's own colours (--accent / --hl, so every skin looks different),
 * a scanline sweep, and the letters decoding into place. Runs on the first load and after every
 * seamless page switch (nav.js). Cheap by design: transforms, clip-path and opacity only, one
 * text node rewritten for ~30 frames, everything removed again after ~700 ms.
 * Skipped for prefers-reduced-motion and when a signed-in visitor switched glitches off.
 */
(function () {
  "use strict";
  var GLYPHS = "!<>-_\\/[]{}=+*^?#%&$01";
  var DURATION = 620;
  var TITLE = "#main h1, #main .section__title, #main h2";
  var running = null;

  /* ---------- pure helpers (tested) ---------- */
  // the decoded prefix grows with progress (0..1); the rest is noise; spaces stay spaces
  function scrambleFrame(text, progress, rnd) {
    var n = text.length, fixed = Math.floor(Math.max(0, Math.min(1, progress)) * n), out = "";
    rnd = rnd || Math.random;
    for (var i = 0; i < n; i++) {
      var ch = text.charAt(i);
      out += i < fixed || ch === " " ? ch : GLYPHS.charAt((rnd() * GLYPHS.length) | 0);
    }
    return out;
  }
  // only plain one-text-node titles get the letter decode (no markup inside to break)
  function plainText(el) {
    return el.childNodes.length === 1 && el.firstChild.nodeType === 3 && el.textContent.trim().length > 0 && el.textContent.length <= 60;
  }
  function wanted() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    var A = window.SamukaAuth, p = A && A.profile && A.profile();
    return !(p && p.glitches === false);
  }
  function findTitle(root) {
    var list = (root || document).querySelectorAll(TITLE);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      // skip the hero (it has its own scramble-in) and article headings (their ::before is a "## ")
      if (r.width > 0 && r.height > 0 && r.top < innerHeight && !list[i].querySelector("[data-scramble]") && !list[i].closest(".prose")) return list[i];
    }
    return null;
  }

  /* ---------- the effect ---------- */
  function finish() {
    if (!running) return;
    var r = running; running = null;
    cancelAnimationFrame(r.raf); clearTimeout(r.timer);
    if (r.node) r.node.nodeValue = r.text;   // always restore the exact title
    r.el.classList.remove("lg-scratch");
    r.el.removeAttribute("data-lg");
    if (r.label == null) r.el.removeAttribute("aria-label"); else r.el.setAttribute("aria-label", r.label);
    if (r.scan) r.scan.remove();
  }
  function play(el) {
    finish();
    el = el || findTitle();
    if (!el || !wanted()) return false;
    var text = el.textContent;
    running = { el: el, text: text, node: plainText(el) ? el.firstChild : null, label: el.getAttribute("aria-label"), raf: 0, timer: 0, scan: null };
    el.setAttribute("aria-label", text.trim());   // screen readers hear the real title, not the noise
    el.setAttribute("data-lg", text.trim());
    el.classList.remove("lg-scratch"); void el.offsetWidth;   // restart the CSS animation
    el.classList.add("lg-scratch");
    var scan = document.createElement("div");
    scan.className = "lg-scan"; scan.setAttribute("aria-hidden", "true");
    document.body.appendChild(scan);
    running.scan = scan;
    if (running.node) {
      var t0 = performance.now(), r = running;
      (function frame(now) {
        if (running !== r) return;
        var p = (now - t0) / (DURATION * 0.8);
        r.node.nodeValue = p >= 1 ? r.text : scrambleFrame(r.text, p * p * (3 - 2 * p));   // ease in-out
        if (p < 1) r.raf = requestAnimationFrame(frame);
      })(t0);
    }
    running.timer = setTimeout(finish, DURATION + 80);
    return true;
  }

  // first load: after the "rails server" boot screen if it is showing, else right away
  function firstLoad() {
    var boot = document.querySelector(".boot");
    if (boot && boot.classList.contains("is-on")) {
      var mo = new MutationObserver(function () { if (!boot.classList.contains("is-on")) { mo.disconnect(); setTimeout(play, 60); } });
      mo.observe(boot, { attributes: true, attributeFilter: ["class"] });
      return;
    }
    setTimeout(play, 120);
  }
  window.addEventListener("samuka:page", function () { setTimeout(play, 30); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", firstLoad); else firstLoad();

  window.SamukaLoadGlitch = { play: play, finish: finish, scrambleFrame: scrambleFrame, plainText: plainText, findTitle: findTitle, duration: DURATION, isRunning: function () { return !!running; } };
})();
