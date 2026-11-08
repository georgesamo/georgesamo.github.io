/* Samuka · role easter eggs
 *   samuka -> "Dark Knight" glitch: split-second cut to black, bats, comic burst
 *   nino   -> "Golden" glitch: purple flash, bunnies, sparkles, 보라해
 * Plus small fly-bys between glitches. One flash per event (no strobing),
 * skipped entirely for prefers-reduced-motion or when the user turns them off.
 */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var role = "guest", on = false, timer = 0, flyTimer = 0, busy = false;
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  // original artwork: a generic flying bat and a bunny head (no logos)
  var BAT = '<svg viewBox="0 0 34 17" aria-hidden="true"><path d="M0 10C4 4 8 3 12 6c1-3 3-4 4-2l1-3 1 3c1-2 3-1 4 2 4-3 8-2 12 4-4-2-7-1-9 2-2-2-5-1-6 2l-2 2-2-2c-1-3-4-4-6-2-2-3-5-4-9-2z"/></svg>';
  var BUNNY = '<svg viewBox="0 0 26 30" aria-hidden="true"><ellipse cx="8.5" cy="8" rx="3.2" ry="8"/><ellipse cx="17.5" cy="8" rx="3.2" ry="8"/><circle cx="13" cy="20" r="9"/></svg>';
  var SPARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0l2.2 7.8L20 10l-7.8 2.2L10 20l-2.2-7.8L0 10l7.8-2.2z"/></svg>';

  var KNIGHT = {
    bursts: ["KRAK!", "WHAM!", "THWIP!", "BLAM!", "ZZAP!"],
    lines: ["// production never sleeps. neither do I.", "// no capes in prod.", "// the night shift deploys in silence.", "// I'm whatever this codebase needs me to be."]
  };
  var GOLDEN = {
    big: ["보라해", "GOLDEN", "annyeong, Nino!"],
    lines: ["golden maknae mode ✦", "I purple you 💜", "sprint status: 🟢 shipped", "bias: unchanged since 2013"]
  };

  function blocked() {
    return busy || document.hidden || !!document.querySelector(".arcade:not([hidden]), .term:not([hidden]), .acct:not([hidden]), .boot.is-on");
  }

  function fire(force) {
    if (!force && (!on || blocked())) return;
    if (reduced || (role !== "samuka" && role !== "nino")) return;
    busy = true;
    var el = document.createElement("div");
    el.className = "glx glx--" + (role === "samuka" ? "knight" : "golden");
    el.setAttribute("aria-hidden", "true");
    var html = "", i;
    if (role === "samuka") {
      for (i = 0; i < 9; i++) html += '<span class="glx__bat" style="--x:' + rand(-5, 95).toFixed(1) + "%;--y:" + rand(5, 85).toFixed(1) + "%;--s:" + rand(0.6, 1.8).toFixed(2) + ";--d:" + rand(0, 0.12).toFixed(2) + 's">' + BAT + "</span>";
      html += '<span class="glx__burst">' + pick(KNIGHT.bursts) + '</span><span class="glx__line">' + pick(KNIGHT.lines) + "</span>";
    } else {
      for (i = 0; i < 7; i++) html += '<span class="glx__bunny" style="--x:' + rand(0, 92).toFixed(1) + "%;--y:" + rand(55, 90).toFixed(1) + "%;--s:" + rand(0.7, 1.6).toFixed(2) + ";--d:" + rand(0, 0.15).toFixed(2) + 's">' + BUNNY + "</span>";
      for (i = 0; i < 16; i++) html += '<span class="glx__spark" style="--x:' + rand(0, 100).toFixed(1) + "%;--y:" + rand(0, 100).toFixed(1) + "%;--s:" + rand(0.4, 1.4).toFixed(2) + ";--d:" + rand(0, 0.2).toFixed(2) + 's">' + SPARK + "</span>";
      html += '<span class="glx__big">' + pick(GOLDEN.big) + '</span><span class="glx__line">' + pick(GOLDEN.lines) + "</span>";
    }
    el.innerHTML = html;
    // 1) the page itself glitches (RGB split + slice) for ~140 ms
    document.documentElement.classList.add("glx-shift", "glx-shift--" + (role === "samuka" ? "knight" : "golden"));
    setTimeout(function () {
      document.documentElement.classList.remove("glx-shift", "glx-shift--knight", "glx-shift--golden");
      // 2) a split-second cut to the themed screen
      document.body.appendChild(el);
      setTimeout(function () { el.classList.add("is-out"); }, role === "samuka" ? 420 : 560);
      setTimeout(function () { el.remove(); busy = false; }, 900);
    }, 140);
  }

  function flyby() {
    if (!on || blocked() || reduced) return;
    var el = document.createElement("span");
    el.className = "glx-fly glx-fly--" + (role === "samuka" ? "bat" : "bunny");
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--y", rand(8, 70).toFixed(1) + "vh");
    el.style.setProperty("--dur", rand(5, 8).toFixed(1) + "s");
    el.innerHTML = role === "samuka" ? BAT : BUNNY;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 9000);
  }

  function schedule(first) {
    clearTimeout(timer);
    if (!on) return;
    timer = setTimeout(function () { fire(false); schedule(false); }, (first ? rand(25, 45) : rand(110, 260)) * 1000);
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

  window.SamukaGlitch = { fire: fire, flyby: flyby };
})();
