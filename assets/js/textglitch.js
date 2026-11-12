/* Samuka · text warp easter egg (any signed-in user)
 * Every so often a visible heading flashes, for a split second, a different
 * text with a cyberpunk RGB-split / slice warp, then snaps back.
 *   nino   -> mostly every "Samuka" on screen becomes "Jungkook" at once
 *   samuka -> sometimes the name becomes "Batman"
 * The real text is never changed: an overlay is drawn over it and removed.
 * Skipped for prefers-reduced-motion and when glitches are off in the account.
 */
(function () {
  "use strict";
  function reduced() { return window.SamukaCalm ? window.SamukaCalm.on() : !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }   // calm mode (live)
  var role = "guest", on = false, timer = 0;
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  var GENERIC = ["WAKE_UP", "SIGNAL//LOST", "NULL_PTR", "ACCESS GRANTED", "0xDEADBEEF", "ghost.exe", "REALITY v2.0",
    "who is watching?", "SYSTEM OVERRIDE", "segfault (core dumped)", "NEON_CITY", "rm -rf /dreams", "404: self not found",
    "JACK IN", "kernel panic", "you are the bug", "LOW BATTERY", "simulation.pause()", "ERR_HUMAN", "follow the white rabbit"];
  // headings of the page you are on come first; the smaller bits are the fallback
  var HEADERS = "#main h1, #main h2, #main h3, .hero__name [data-scramble], .section__title";
  var TARGETS = ".arcade-card__title, .migration__title, .hero__role, .pre .t, .code .t";
  // short, single-line text only, so the warped overlay lines up with the heading it covers
  function headerLike(el) {
    var t = el.textContent.trim();
    return t.length > 0 && t.length <= 48 && !el.closest("[hidden], .lb, .pcard, .acct, .me-menu, .pal") && lines(el) === 1;
  }
  function lines(el) {   // line boxes of the text itself (a block heading always reports one rect)
    var r = document.createRange(); r.selectNodeContents(el);
    var tops = {};
    Array.prototype.forEach.call(r.getClientRects(), function (q) { if (q.width > 0) tops[Math.round(q.top)] = 1; });
    return Object.keys(tops).length;
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 40 && r.top < innerHeight - 20;
  }
  function blocked() {
    return document.hidden || !!document.querySelector(".glx, .tg-ghost, .arcade:not([hidden]), .term:not([hidden]), .acct:not([hidden]), .boot.is-on");
  }
  function nameEls() {
    return Array.prototype.filter.call(document.querySelectorAll(".hero__name [data-scramble], .code .t, .section__title"), function (el) {
      return el.textContent.trim() === "Samuka" && visible(el); // also skips the hero name while it is still scrambling in
    });
  }

  function warp(el, text, kind, ms) {
    var host = el, cs = getComputedStyle(host);
    var restorePos = cs.position === "static";
    if (restorePos) host.style.position = "relative";
    var g = document.createElement("span");
    g.className = "tg-ghost tg-ghost--" + kind;
    g.setAttribute("aria-hidden", "true");
    g.setAttribute("data-tg", text);
    g.textContent = text;
    g.style.setProperty("--ms", ms + "ms");
    host.classList.add("tg-host");
    host.appendChild(g);
    setTimeout(function () {
      g.remove();
      host.classList.remove("tg-host");
      if (restorePos) host.style.position = "";
    }, ms);
  }

  function fire(force) {
    if (!force && (!on || blocked())) return false;
    if (reduced() || role === "guest") return false;
    if (document.querySelector(".tg-ghost")) return false;
    var names = nameEls();
    if (role === "nino" && names.length && (force || Math.random() < 0.65)) {
      names.forEach(function (el) { warp(el, "Jungkook", "jk", 620); });
      return true;
    }
    if (role === "samuka" && names.length && Math.random() < 0.3) {
      names.forEach(function (el) { warp(el, "Batman", "bat", 480); });
      return true;
    }
    var heads = Array.prototype.filter.call(document.querySelectorAll(HEADERS), function (el) { return visible(el) && headerLike(el); });
    var els = heads.length ? heads : Array.prototype.filter.call(document.querySelectorAll(TARGETS), visible);
    if (!els.length) return false;
    warp(pick(els), pick(GENERIC), "cy", 380);
    return true;
  }

  // header warps are the everyday glitch: soon after a page opens, then every 15–35 s (seconds)
  var DELAYS = { first: [5, 10], next: [15, 35] };
  function schedule(first) {
    clearTimeout(timer);
    if (!on) return;
    var d = first ? DELAYS.first : DELAYS.next;
    timer = setTimeout(function () { fire(false); schedule(false); }, rand(d[0], d[1]) * 1000);
  }
  window.addEventListener("samuka:page", function () { schedule(true); });   // a fresh page gets its own warp

  window.addEventListener("samuka:auth", function (e) {
    var d = e.detail || {};
    role = d.user ? (d.role || "user") : "guest";
    var wants = role !== "guest" && !(d.profile && d.profile.glitches === false);
    if (wants !== on) { on = wants; schedule(true); }
  });

  window.SamukaTextGlitch = { fire: fire, delays: DELAYS, _targets: function () { return Array.prototype.filter.call(document.querySelectorAll(HEADERS), function (el) { return visible(el) && headerLike(el); }); } };
})();
