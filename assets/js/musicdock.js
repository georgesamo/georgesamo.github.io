/* Samuka · the soundtrack player dock
 * Opens from the ♪ button in the header on every page: what's playing, a seek bar, ⏮ ⏪ ⏯ ⏩ ⏭,
 * repeat, volume, stop, and the current theme's tracks. Drives window.SamukaLofi.
 * The soundtrack room (/soundtrack/, team only) has the same controls, bigger, for all 15+ tracks.
 */
(function () {
  "use strict";
  var ACCENT = { phthalo: "#3ad08f", knight: "#e5383b", golden: "#c49bff" };
  var el = null, anchor = null, iv = null, drag = null, lastKey = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function L() { return window.SamukaLofi; }
  function repeat(v) {
    try { if (v != null) localStorage.setItem("samuka-st-repeat", v ? "1" : "0"); return localStorage.getItem("samuka-st-repeat") === "1"; } catch (e) { return false; }
  }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function team() { var A = window.SamukaAuth; return !!(A && A.user && A.user() && (A.role() === "samuka" || A.role() === "nino")); }

  function build() {
    el = document.createElement("div");
    el.className = "mdock"; el.hidden = true;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Soundtrack player");
    el.innerHTML =
      '<div class="mdock__head"><span class="mdock__eyebrow" data-md-eyebrow></span><b class="mdock__title" data-md-title></b><span class="mdock__sub" data-md-sub></span></div>' +
      '<div class="mdock__seek"><span data-md-pos>0:00</span><div class="mdock__track" data-md-track role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0"><div class="mdock__rail"><i class="mdock__outro" data-md-outro></i><i class="mdock__fill" data-md-fill></i></div><div class="mdock__marks" data-md-marks></div><i class="mdock__thumb" data-md-thumb></i></div><span data-md-dur>0:00</span></div>' +
      '<div class="mdock__ctrl">' +
        '<button type="button" data-md="prev" aria-label="Previous track" title="Previous track (restart if past 3 s)">⏮</button>' +
        '<button type="button" data-md="back" aria-label="Rewind 10 seconds" title="Rewind 10 s">⏪</button>' +
        '<button type="button" class="mdock__play" data-md="play" aria-label="Pause">⏸</button>' +
        '<button type="button" data-md="fwd" aria-label="Forward 10 seconds" title="Forward 10 s">⏩</button>' +
        '<button type="button" data-md="next" aria-label="Next track" title="Next track">⏭</button>' +
      "</div>" +
      '<div class="mdock__row"><button type="button" class="mdock__sm" data-md="repeat" aria-pressed="false" title="Repeat this track">🔁</button>' +
        '<button type="button" class="mdock__sm" data-md="mute" aria-label="Mute">🔊</button><input type="range" min="0" max="100" data-md-vol aria-label="Volume">' +
        '<button type="button" class="mdock__sm" data-md="stop" aria-label="Turn the music off" title="Turn the music off">⏹</button></div>' +
      '<ol class="mdock__list" data-md-list></ol>' +
      '<a class="mdock__room" data-md-room href="/soundtrack/" target="_blank" rel="noopener" hidden>open the soundtrack room ↗</a>';
    document.body.appendChild(el);
    el.addEventListener("click", onClick);
    el.querySelector("[data-md-vol]").addEventListener("input", function (e) { L().volume(e.target.value / 100); paint(); });
    var tr = el.querySelector("[data-md-track]");
    function frac(e) { var r = tr.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
    tr.addEventListener("pointerdown", function (e) { var t = L().track(); if (!t || e.button > 0) return; drag = { f: frac(e), dur: t.dur }; tr.setPointerCapture(e.pointerId); draw(drag.f, drag.dur); });
    tr.addEventListener("pointermove", function (e) { if (drag) { drag.f = frac(e); draw(drag.f, drag.dur); } });
    tr.addEventListener("pointerup", function () { if (!drag) return; var d = drag; drag = null; L().seekTime(d.f * d.dur); paint(); });
    tr.addEventListener("pointercancel", function () { drag = null; });
    tr.addEventListener("keydown", function (e) {
      var t = L().track(); if (!t) return;
      var d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[e.key];
      if (d) L().skip(d); else if (e.key === "Home") L().seekTime(0); else if (e.key === "End") L().seekTime(t.dur - 2); else return;
      e.preventDefault(); e.stopPropagation(); paint();
    });
    document.addEventListener("pointerdown", function (e) { if (!el.hidden && !el.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.hidden) { e.stopPropagation(); close(); if (anchor) anchor.focus(); } }, true);
    window.addEventListener("resize", place);
    window.addEventListener("samuka:lofi", function () { if (!el.hidden) paint(); });
    window.addEventListener("samuka:suite", function () { lastKey = null; if (!el.hidden) paint(); });
  }
  function onClick(e) {
    var b = e.target.closest("[data-md]"), Lo = L(), t = Lo.track();
    if (b) {
      var a = b.getAttribute("data-md");
      if (a === "play") { if (!t) Lo.start(); else if (t.paused) Lo.resume(); else Lo.pause(); }
      else if (a === "prev") Lo.prev();
      else if (a === "next") Lo.next();
      else if (a === "back") Lo.skip(-10);
      else if (a === "fwd") Lo.skip(10);
      else if (a === "repeat") { var r = repeat(!repeat()); Lo.setLoop(r); }
      else if (a === "mute") { var v = Lo.volume(); if (v > 0) { el.dataset.vol = v; Lo.volume(0); } else Lo.volume(+el.dataset.vol || 0.8); }
      else if (a === "stop") { Lo.stop(); }
      paint(); return;
    }
    var row = e.target.closest("[data-md-si]");
    if (row) {
      var si = +row.getAttribute("data-md-si");
      if (t && t.si === si) { if (t.paused) Lo.resume(); else Lo.pause(); }
      else { Lo.play(t ? t.theme : Lo.theme(), si); Lo.setLoop(repeat()); }
      paint();
    }
  }
  function draw(f, dur) {
    el.querySelector("[data-md-fill]").style.width = (f * 100) + "%";
    el.querySelector("[data-md-thumb]").style.left = (f * 100) + "%";
    el.querySelector("[data-md-pos]").textContent = fmt(f * dur);
  }
  function paint() {
    if (!el || el.hidden) return;
    var Lo = L(), t = Lo.track(), th = t ? t.theme : Lo.theme(), cat = Lo.catalog().filter(function (c) { return c.theme === th; })[0];
    el.style.setProperty("--md", ACCENT[th] || "var(--accent)");
    var q = function (s) { return el.querySelector(s); };
    q("[data-md-eyebrow]").textContent = t ? t.themeName + " · track " + t.no + "/" + t.of + (t.paused ? " · paused" : "") : "soundtrack · off";
    q("[data-md-title]").textContent = t ? t.name : "Music is off";
    q("[data-md-sub]").textContent = t ? t.style + " · " + t.bpm + " bpm" : "press play: your theme's songs, synthesized live";
    var playing = t && !t.paused, pb = q('[data-md="play"]');
    pb.textContent = playing ? "⏸" : "▶"; pb.setAttribute("aria-label", playing ? "Pause" : "Play");
    q('[data-md="repeat"]').setAttribute("aria-pressed", String(repeat()));
    var v = Lo.volume(), vi = q("[data-md-vol]"); if (document.activeElement !== vi) vi.value = Math.round(v * 100);
    q('[data-md="mute"]').textContent = v === 0 ? "🔇" : v < 0.5 ? "🔉" : "🔊";
    q('[data-md="stop"]').disabled = !t;
    ["prev", "back", "fwd", "next"].forEach(function (k) { q('[data-md="' + k + '"]').disabled = !t; });
    q("[data-md-dur]").textContent = fmt(t ? t.dur : 0);
    if (!drag) draw(t && t.dur ? t.pos / t.dur : 0, t ? t.dur : 0);
    var tr = q("[data-md-track]"); tr.setAttribute("aria-valuemax", String(Math.round(t ? t.dur : 0))); tr.setAttribute("aria-valuenow", String(Math.round(t ? t.pos : 0)));
    var key = t ? th + ":" + t.si : "off:" + th;
    if (key !== lastKey) {
      lastKey = key;
      var e = t && cat ? cat.songs[t.si] : null;
      q("[data-md-outro]").style.width = e && e.outro ? (e.outro / (e.bars + e.outro) * 100) + "%" : "0";
      q("[data-md-marks]").innerHTML = t && t.si === 5 ? Lo.suite.marks(th).slice(1).map(function (m) { return '<i style="left:' + (m.at / t.dur * 100) + '%" title="' + esc(m.name) + '"></i>'; }).join("") : "";
      q("[data-md-list]").innerHTML = cat ? cat.songs.filter(function (s) { return !s.locked; }).map(function (s) {
        return '<li><button type="button" data-md-si="' + (s.no - 1) + '"><span class="mdock__n"></span><span class="mdock__t">' + esc(s.title) + (s.suite ? ' <small>secret</small>' : "") + "</span><span class=\"mdock__d\">" + fmt(s.secs) + "</span></button></li>";
      }).join("") : "";
    }
    el.querySelectorAll("[data-md-si]").forEach(function (b) {
      var onIt = t && +b.getAttribute("data-md-si") === t.si;
      b.classList.toggle("is-on", !!onIt);
      b.querySelector(".mdock__n").textContent = onIt ? (t.paused ? "▶" : "♪") : String(+b.getAttribute("data-md-si") + 1);
    });
    q("[data-md-room]").hidden = !team() || location.pathname.indexOf("/soundtrack") === 0;
  }
  function place() {
    if (!el || el.hidden) return;
    if (!anchor || !document.body.contains(anchor)) anchor = document.querySelector(".lofi-btn");   // the header may have been swapped
    if (!anchor) return;
    if (window.innerWidth < 600) { el.style.left = el.style.top = el.style.right = ""; el.classList.add("is-sheet"); return; }
    el.classList.remove("is-sheet");
    var r = anchor.getBoundingClientRect(), w = el.offsetWidth;
    el.style.top = Math.round(r.bottom + 8) + "px";
    el.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))) + "px";
  }
  function open(a) {
    if (!L()) return;
    if (!el) build();
    anchor = a || document.querySelector(".lofi-btn");
    el.hidden = false; lastKey = null; paint(); place();
    if (anchor) anchor.setAttribute("aria-expanded", "true");
    clearInterval(iv); iv = setInterval(paint, 250);
    var f = el.querySelector(".mdock__play"); if (f) f.focus({ preventScroll: true });
  }
  function close() {
    if (!el || el.hidden) return;
    el.hidden = true; clearInterval(iv); iv = null; drag = null;
    if (anchor) anchor.setAttribute("aria-expanded", "false");
  }
  window.SamukaDock = {
    open: open, close: close, isOpen: function () { return !!(el && !el.hidden); },
    toggle: function (a) { if (el && !el.hidden) close(); else open(a); }
  };
})();
