/* Samuka · first-visit tour: three small pointers on the home page (play, Today, your stuff).
 * Shows once, for visitors who haven't played anything yet, after the boot screen. Skipping,
 * finishing or leaving the page ends it for good (samuka-tour = "done"). /?tour=1 replays it
 * (Settings and search link there).
 */
(function () {
  "use strict";
  var KEY = "samuka-tour";
  var STEPS = [
    { anchors: ['.lobby__actions a[href="#play"]', "#play [data-play]"], title: "Play right away",
      text: "No sign-up needed. Pick any of the four games, most take a few minutes." },
    { anchors: ['.mnav a[href="/events/"]', '.tabs a[href="/events/"]', '.tree a[href="/events/"]'], title: "Something new every day",
      text: "Today has the daily puzzle (same board for everyone), live 1v1 races and the weekly challenge." },
    { anchors: ['.mnav a[href="/me/"]', '.tree a[href="/me/"]', "[data-account]"], title: "Your stuff",
      text: "Bests, badges and unlocked music collect in your collection. Sign in any time to keep them on every device." }
  ];
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return "done"; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  /* pure: should the tour start? c: { lobby, stored, played, forced, challenge } */
  function shouldStart(c) {
    if (!c.lobby) return false;
    if (c.forced) return true;
    return c.stored !== "done" && !c.played && !c.challenge;
  }
  function visible(el) {
    if (!el || el.hidden || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }
  function anchorOf(step) {
    for (var i = 0; i < step.anchors.length; i++) {
      var list = document.querySelectorAll(step.anchors[i]);
      for (var j = 0; j < list.length; j++) if (visible(list[j])) return list[j];
    }
    return null;
  }

  var box = null, at = -1, anchor = null;
  function render() {
    var s = STEPS[at], last = at === STEPS.length - 1;
    box.innerHTML = '<p class="tour__n">' + (at + 1) + " / " + STEPS.length + "</p><b>" + s.title + "</b><span>" + s.text + "</span>" +
      '<div class="tour__btns"><button type="button" class="tour__skip" data-tour-skip>' + (last ? "" : "skip tour") + "</button>" +
      '<button type="button" class="btn btn--primary" data-tour-next>' + (last ? "done" : "next →") + "</button></div>";
    if (last) box.querySelector("[data-tour-skip]").remove();
  }
  function place() {
    if (!box || !anchor) return;
    var r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = box.offsetWidth, h = box.offsetHeight, below = r.bottom + 12 + h < vh || r.top < h + 24;
    var left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8)));
    box.style.left = left + "px";
    box.style.top = Math.round(below ? r.bottom + 12 : r.top - h - 12) + "px";
    box.classList.toggle("tour--above", !below);
    box.style.setProperty("--ax", Math.round(Math.max(16, Math.min(r.left + r.width / 2 - left, w - 16))) + "px");
  }
  function show(i) {
    // skip steps whose anchor isn't on screen at this width
    while (i < STEPS.length && !(anchor = anchorOf(STEPS[i]))) i++;
    if (i >= STEPS.length) return end();
    at = i;
    if (anchor.classList) { document.querySelectorAll(".tour-target").forEach(function (e) { e.classList.remove("tour-target"); }); anchor.classList.add("tour-target"); }
    var r = anchor.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) anchor.scrollIntoView({ block: "center", behavior: "auto" });
    render(); place();
  }
  function start() {
    if (box) return;
    box = document.createElement("div");
    box.className = "tour";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Quick tour");
    document.body.appendChild(box);
    show(0);
  }
  function end() {
    set("done");
    document.querySelectorAll(".tour-target").forEach(function (e) { e.classList.remove("tour-target"); });
    if (box) { box.remove(); box = null; }
    at = -1; anchor = null;
  }

  function lobby() { var ide = document.querySelector(".ide"); return !!(ide && ide.getAttribute("data-page") === "lobby"); }
  function played() { try { return !!localStorage.getItem("samuka-last-game"); } catch (e) { return false; } }
  function busy() {
    var boot = document.getElementById("boot"), Ar = window.SamukaArcade, Au = window.SamukaAuth;
    return (boot && boot.classList.contains("is-on")) || (Ar && Ar.isOpen && Ar.isOpen()) || (Au && Au.isOpen && Au.isOpen()) || !!document.querySelector(".chal:not([hidden]), .term:not([hidden])");
  }
  function maybeStart(tries) {
    var q = new URLSearchParams(location.search);
    var go = shouldStart({ lobby: lobby(), stored: get(), played: played(), forced: q.get("tour") === "1", challenge: q.has("c") });
    if (!go || box) return;
    if (busy()) { if ((tries || 0) < 20) setTimeout(function () { maybeStart((tries || 0) + 1); }, 1000); return; }
    if (q.get("tour") === "1" && history.replaceState) { q.delete("tour"); history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash); }
    start();
  }

  document.addEventListener("click", function (e) {
    if (!box || !e.target.closest) return;
    if (e.target.closest("[data-tour-next]")) { if (at >= STEPS.length - 1) end(); else show(at + 1); return; }
    if (e.target.closest("[data-tour-skip]")) { end(); return; }
    // following what a step points at ends the tour (they're exploring)
    if (anchor && anchor.contains(e.target)) end();
  });
  document.addEventListener("keydown", function (e) { if (box && e.key === "Escape") end(); });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true, capture: true });
  window.addEventListener("samuka:page", function () { if (box) end(); setTimeout(maybeStart, 1200); });
  window.addEventListener("samuka:game", function (e) { if (box && e.detail && e.detail.name === "start") end(); });
  function boot() { setTimeout(maybeStart, 1500); }
  if (document.readyState === "complete") boot(); else window.addEventListener("load", boot);

  window.SamukaTour = { start: start, end: end, shouldStart: shouldStart, steps: STEPS, step: function () { return at; } };
})();
