/* Samuka · role easter eggs
 *   samuka -> "Dark Knight": page tears, a cascade of bat symbols flashes across
 *             the screen, then a searchlight projects a bat onto the clouds
 *   nino   -> "Golden": a bunny mascot pops up over a purple lightstick ocean,
 *             hearts and sparkles float, 보라해
 * Both follow the current mode (dark / light). All artwork is original.
 * Safety: no strobing (each element appears once), skipped for
 * prefers-reduced-motion, can be turned off in the account window.
 */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var role = "guest", on = false, timer = 0, flyTimer = 0, busy = false;
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var mode = function () { return document.documentElement.dataset.theme === "light" ? "light" : "dark"; };

  /* ---------- original artwork ---------- */
  var BAT = '<svg viewBox="0 0 34 17" aria-hidden="true"><path d="M0 10C4 4 8 3 12 6c1-3 3-4 4-2l1-3 1 3c1-2 3-1 4 2 4-3 8-2 12 4-4-2-7-1-9 2-2-2-5-1-6 2l-2 2-2-2c-1-3-4-4-6-2-2-3-5-4-9-2z"/></svg>';
  // bat symbol (own design, in the spirit of a gritty 2020s noir): angular, sharp ears,
  // long hooked wing tips, crimson, with a distressed texture from an SVG noise filter
  // each copy gets its own filter id: shared ids make browsers apply the first copy's geometry to all
  var gritN = 0;
  function SIGIL_SVG() {
    var id = "gk-grit-" + (++gritN);
    return '<svg viewBox="0 0 120 56" aria-hidden="true">' +
      '<defs><filter id="' + id + '" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.09 0.2" numOctaves="2" seed="' + gritN + '" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.65" result="m"/>' +
      '<feComposite in="SourceGraphic" in2="m" operator="in"/></filter></defs>' +
      '<path class="sg-bat" filter="url(#' + id + ')" d="M1 31 L22 17 L39 15 L49 19 L52 10 L54.5 1 L57 13 L63 13 L65.5 1 L68 10 L71 19 L81 15 L98 17 L119 31 L103 27.5 L94 41 L86 30.5 L75 32 L67 45 L60 55 L53 45 L45 32 L34 30.5 L26 41 L17 27.5 Z"/></svg>';
  }
  var BUNNY_MINI = '<svg viewBox="0 0 26 30" aria-hidden="true"><ellipse cx="8.5" cy="8" rx="3.2" ry="8"/><ellipse cx="17.5" cy="8" rx="3.2" ry="8"/><circle cx="13" cy="20" r="9"/></svg>';
  // bunny mascot (own design): lavender-white, pink inner ears, happy closed eyes
  var MASCOT = '<svg viewBox="0 0 140 176" aria-hidden="true">' +
    '<g class="ms-ears"><ellipse cx="44" cy="44" rx="15" ry="40" transform="rotate(-12 44 44)" fill="#f7f1ff"/><ellipse cx="44" cy="48" rx="7" ry="29" transform="rotate(-12 44 48)" fill="#ffb3d4"/>' +
    '<ellipse cx="96" cy="44" rx="15" ry="40" transform="rotate(12 96 44)" fill="#f7f1ff"/><ellipse cx="96" cy="48" rx="7" ry="29" transform="rotate(12 96 48)" fill="#ffb3d4"/></g>' +
    '<ellipse cx="70" cy="108" rx="50" ry="44" fill="#f7f1ff"/>' +
    '<path d="M46 102q7-8 14 0M80 102q7-8 14 0" fill="none" stroke="#2a1a45" stroke-width="4" stroke-linecap="round"/>' +
    '<ellipse cx="42" cy="118" rx="9" ry="6" fill="#ffb3d4" opacity=".8"/><ellipse cx="98" cy="118" rx="9" ry="6" fill="#ffb3d4" opacity=".8"/>' +
    '<path d="M66 114h8l-4 5z" fill="#ff8fbf"/><path d="M62 123q4 5 8 0q4 5 8 0" fill="none" stroke="#2a1a45" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="ms-heart" d="M70 174c-7-6-16-11-16-19a8 8 0 0116-3 8 8 0 0116 3c0 8-9 13-16 19z" fill="#b98cff"/></svg>';
  var HEART = '<svg viewBox="0 0 20 18" aria-hidden="true"><path d="M10 18C4 13 0 10 0 5.5A5 5 0 0110 3a5 5 0 0110 2.5C20 10 16 13 10 18z"/></svg>';
  var SPARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0l2.2 7.8L20 10l-7.8 2.2L10 20l-2.2-7.8L0 10l7.8-2.2z"/></svg>';

  var KNIGHT_LINES = ["// production never sleeps. neither do I.", "// no capes in prod.", "// the night shift deploys in silence.", "// I'm whatever this codebase needs me to be.", "// signal received. on my way."];
  var GOLDEN_BIG = ["보라해", "GOLDEN", "annyeong, Nino!"];
  var GOLDEN_LINES = ["golden maknae mode ✦", "I purple you 💜", "sprint status: 🟢 shipped", "bias: unchanged since 2013", "the purple ocean says hi"];

  function blocked() {
    return busy || document.hidden || !!document.querySelector(".arcade:not([hidden]), .term:not([hidden]), .acct:not([hidden]), .boot.is-on");
  }

  function knightScene() {
    var html = '<div class="gk-clouds"></div>', i, cols = 5, rows = 3;
    // cascade of bat symbols on a loose grid, each appears once, in sequence
    for (i = 0; i < cols * rows; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      var x = (c + 0.5) / cols * 100 + rand(-6, 6), y = (r + 0.5) / rows * 62 + 6 + rand(-5, 5);
      var order = (c + r * 2 + ((Math.random() * 3) | 0)) * 0.035;
      html += '<span class="gk-sigil" style="--x:' + x.toFixed(1) + "%;--y:" + y.toFixed(1) + "%;--s:" + rand(0.55, 1.15).toFixed(2) + ";--r:" + rand(-14, 14).toFixed(0) + "deg;--d:" + order.toFixed(3) + 's">' + SIGIL_SVG() + "</span>";
    }
    for (i = 0; i < 7; i++) html += '<span class="gk-bat" style="--x:' + rand(0, 90).toFixed(1) + "%;--y:" + rand(10, 80).toFixed(1) + "%;--s:" + rand(0.5, 1.3).toFixed(2) + ";--d:" + rand(0.3, 0.7).toFixed(2) + 's">' + BAT + "</span>";
    // searchlight: beam from below, bat projected into the clouds
    html += '<div class="gk-beam"></div><div class="gk-signal">' + SIGIL_SVG() + "</div>";
    html += '<span class="glx__line">' + pick(KNIGHT_LINES) + "</span>";
    return html;
  }

  function goldenScene() {
    var html = '<div class="gg-glow"></div>', i;
    for (i = 0; i < 18; i++) html += '<span class="gg-spark" style="--x:' + rand(0, 100).toFixed(1) + "%;--y:" + rand(0, 70).toFixed(1) + "%;--s:" + rand(0.4, 1.4).toFixed(2) + ";--d:" + rand(0, 0.5).toFixed(2) + 's">' + SPARK + "</span>";
    for (i = 0; i < 10; i++) html += '<span class="gg-heart" style="--x:' + rand(5, 95).toFixed(1) + "%;--s:" + rand(0.6, 1.5).toFixed(2) + ";--d:" + rand(0.1, 0.6).toFixed(2) + ";--h:" + (i % 3) + '">' + HEART + "</span>";
    // the purple ocean: three rows of lightsticks waving
    html += '<div class="gg-ocean">';
    for (var row = 0; row < 3; row++) {
      html += '<div class="gg-row" style="--row:' + row + '">';
      for (i = 0; i < 26; i++) html += '<i style="--i:' + i + '"></i>';
      html += "</div>";
    }
    html += "</div>";
    html += '<div class="gg-stage"><span class="gg-big">' + pick(GOLDEN_BIG) + '</span><span class="gg-mascot">' + MASCOT + "</span></div>";
    html += '<span class="glx__line">' + pick(GOLDEN_LINES) + "</span>";
    return html;
  }

  function fire(force) {
    if (!force && (!on || blocked())) return;
    if (reduced || (role !== "samuka" && role !== "nino")) return;
    if (busy) return;
    busy = true;
    var kind = role === "samuka" ? "knight" : "golden";
    var el = document.createElement("div");
    el.className = "glx glx--" + kind + " glx--" + mode();
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = kind === "knight" ? knightScene() : goldenScene();
    // 1) the page itself tears for ~140 ms
    document.documentElement.classList.add("glx-shift", "glx-shift--" + kind);
    setTimeout(function () {
      document.documentElement.classList.remove("glx-shift", "glx-shift--knight", "glx-shift--golden");
      // 2) the scene
      document.body.appendChild(el);
      // 3) while the scene covers the screen, the site switches to the glitched style (saved to the account)
      setTimeout(function () {
        var S = window.Samuka;
        if (S && S.skin() !== kind && S.canUseSkin(kind)) S.setSkin(kind, { user: true });
      }, 650);
      setTimeout(function () { el.classList.add("is-out"); }, kind === "knight" ? 1150 : 1350);
      setTimeout(function () { el.remove(); busy = false; }, kind === "knight" ? 1550 : 1750);
    }, 140);
  }

  function flyby() {
    if (!on || blocked() || reduced) return;
    var el = document.createElement("span");
    el.className = "glx-fly glx-fly--" + (role === "samuka" ? "bat" : "bunny");
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--y", rand(8, 70).toFixed(1) + "vh");
    el.style.setProperty("--dur", rand(5, 8).toFixed(1) + "s");
    el.innerHTML = role === "samuka" ? BAT : BUNNY_MINI;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 9000);
  }

  // full-screen takeovers are a rare treat: first after 1.5–2.5 min, then every 6–12 min (seconds)
  var DELAYS = { first: [90, 150], next: [360, 720] };
  function schedule(first) {
    clearTimeout(timer);
    if (!on) return;
    var d = first ? DELAYS.first : DELAYS.next;
    timer = setTimeout(function () { fire(false); schedule(false); }, rand(d[0], d[1]) * 1000);
  }
  function scheduleFly() {
    clearTimeout(flyTimer);
    if (!on) return;
    flyTimer = setTimeout(function () { flyby(); scheduleFly(); }, rand(45, 95) * 1000);
  }

  window.addEventListener("samuka:auth", function (e) {
    var d = e.detail || {};
    role = d.role || "guest";
    var wants = (role === "samuka" || role === "nino") && !(d.profile && d.profile.glitches === false);
    if (wants !== on) { on = wants; schedule(true); scheduleFly(); }
  });

  window.SamukaGlitch = { fire: fire, flyby: flyby, delays: DELAYS };
})();
