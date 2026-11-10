/* Samuka · the soundtrack player dock
 * Opens from the ♪ button in the header on every page: what's playing, a seek bar, shuffle ⏮ ⏯ ⏭ repeat,
 * ±10 s, volume, off, and the current theme's tracks. Drives window.SamukaLofi.
 * On phones it is a compact sheet at the bottom: the track list folds away, ⌄ (or a swipe down) minimises it,
 * and the music keeps playing. Icons are drawn in SVG and take their weight and shape from the theme (lofi.css).
 * The soundtrack room (/soundtrack/, team only) has the same controls, bigger, for every track.
 */
(function () {
  "use strict";
  var ACCENT = { phthalo: "#3ad08f", knight: "#e5383b", golden: "#c49bff" };
  var el = null, anchor = null, iv = null, drag = null, lastKey = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function L() { return window.SamukaLofi; }
  function pref(k, v) {
    try { if (v != null) localStorage.setItem(k, v ? "1" : "0"); return localStorage.getItem(k); } catch (e) { return null; }
  }
  function repeat(v) { return pref("samuka-st-repeat", v) === "1"; }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function team() { var A = window.SamukaAuth; return !!(A && A.user && A.user() && (A.role() === "samuka" || A.role() === "nino")); }
  function sheet() { return window.innerWidth < 600; }

  // 24-unit line icons: strokes take the theme's weight, caps and joins (see .mdock svg in lofi.css)
  var ICON = {
    play: '<path class="f" d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path class="f" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
    prev: '<path class="f" d="M18 6v12l-8.5-6z"/><path d="M6.5 6v12"/>',
    next: '<path class="f" d="M6 6v12l8.5-6z"/><path d="M17.5 6v12"/>',
    shuffle: '<path d="M3 7h3c2.2 0 3.4 1.2 4.8 3.4l2.4 3.2C14.6 15.8 15.8 17 18 17h3M3 17h3c1.3 0 2.2-.4 3-1.2M14.6 8.2c.9-.8 1.9-1.2 3.4-1.2h3"/><path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>',
    repeat: '<path d="M4 11.5V10a3 3 0 0 1 3-3h12.5M20 12.5V14a3 3 0 0 1-3 3H4.5"/><path d="M16.5 4 19.5 7l-3 3M7.5 20l-3-3 3-3"/><path class="one" d="M11.2 10.6 12.6 9.6v5"/>',
    back: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4h4"/><text x="12.3" y="15.2">10</text>',
    fwd: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M20 4v4h-4"/><text x="11.7" y="15.2">10</text>',
    vol: '<path class="f" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.8 7.8 0 0 1 0 11"/>',
    volLow: '<path class="f" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>',
    mute: '<path class="f" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    off: '<path d="M12 3.5v8"/><path d="M7 6.6a7.5 7.5 0 1 0 10 0"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path class="dot" d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    min: '<path d="M6 9.5 12 15.5 18 9.5"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICON[name] + "</svg>"; }
  function btn(attr, name, label, cls) {
    return '<button type="button" ' + attr + (cls ? ' class="' + cls + '"' : "") + ' aria-label="' + label + '" title="' + label + '">' + svg(name) + "</button>";
  }

  function build() {
    el = document.createElement("div");
    el.className = "mdock"; el.hidden = true;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Soundtrack player");
    el.innerHTML =
      '<div class="mdock__grab" aria-hidden="true"></div>' +
      '<div class="mdock__top"><div class="mdock__head"><span class="mdock__eyebrow" data-md-eyebrow></span><b class="mdock__title" data-md-title></b><span class="mdock__sub" data-md-sub></span></div>' +
        btn('data-md="list" aria-pressed="true"', "list", "Show the tracks", "mdock__sm") +
        btn('data-md="min"', "min", "Minimise the player (the music keeps playing)", "mdock__sm") + "</div>" +
      '<div class="mdock__seek"><span data-md-pos>0:00</span><div class="mdock__track" data-md-track role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0"><div class="mdock__rail"><i class="mdock__outro" data-md-outro></i><i class="mdock__fill" data-md-fill></i></div><div class="mdock__marks" data-md-marks></div><i class="mdock__thumb" data-md-thumb></i></div><span data-md-dur>0:00</span></div>' +
      '<div class="mdock__ctrl">' +
        btn('data-md="shuffle" aria-pressed="false"', "shuffle", "Shuffle", "mdock__sm mdock__tog") +
        btn('data-md="prev"', "prev", "Previous track (restart if past 3 s)") +
        btn('data-md="play"', "pause", "Pause", "mdock__play") +
        btn('data-md="next"', "next", "Next track") +
        btn('data-md="repeat" aria-pressed="false"', "repeat", "Repeat this track", "mdock__sm mdock__tog") +
      "</div>" +
      '<div class="mdock__row">' +
        btn('data-md="back"', "back", "Back 10 seconds", "mdock__sm") +
        btn('data-md="mute"', "vol", "Mute", "mdock__sm") + '<input type="range" min="0" max="100" data-md-vol aria-label="Volume">' +
        btn('data-md="fwd"', "fwd", "Forward 10 seconds", "mdock__sm") +
        btn('data-md="stop"', "off", "Turn the music off", "mdock__sm") +
      "</div>" +
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
    // on a phone, a swipe down on the sheet's top minimises it
    var sw = null;
    el.addEventListener("pointerdown", function (e) {
      if (!el.classList.contains("is-sheet") || !e.target.closest(".mdock__grab, .mdock__top") || e.target.closest("button")) return;
      sw = { y: e.clientY, id: e.pointerId };
    });
    el.addEventListener("pointermove", function (e) {
      if (!sw || e.pointerId !== sw.id) return;
      var dy = Math.max(0, e.clientY - sw.y); el.style.transform = dy ? "translateY(" + dy + "px)" : "";
    });
    function swEnd(e) {
      if (!sw || e.pointerId !== sw.id) return;
      var dy = e.clientY - sw.y; sw = null; el.style.transform = "";
      if (dy > 50) close();
    }
    el.addEventListener("pointerup", swEnd); el.addEventListener("pointercancel", function () { sw = null; el.style.transform = ""; });
    document.addEventListener("pointerdown", function (e) { if (!el.hidden && !el.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); }, true);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.hidden) { e.stopPropagation(); close(); if (anchor) anchor.focus(); } }, true);
    window.addEventListener("resize", place);
    window.addEventListener("samuka:lofi", function () { if (!el.hidden) paint(); });
    window.addEventListener("samuka:suite", function () { lastKey = null; if (!el.hidden) paint(); });
  }
  // the list is open by default on desktop, folded on a phone; each remembers its own choice
  function listOpen(v) { var k = sheet() ? "samuka-dock-list-m" : "samuka-dock-list"; var r = pref(k, v); return r == null ? !sheet() : r === "1"; }
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
      else if (a === "shuffle") { if (Lo.shuffle) Lo.shuffle(!Lo.shuffle()); }
      else if (a === "mute") { var v = Lo.volume(); if (v > 0) { el.dataset.vol = v; Lo.volume(0); } else Lo.volume(+el.dataset.vol || 0.8); }
      else if (a === "stop") { Lo.stop(); }
      else if (a === "list") { listOpen(!listOpen()); place(); }
      else if (a === "min") { close(); if (anchor) anchor.focus({ preventScroll: true }); return; }
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
  function setIcon(b, name, label) {
    if (b.getAttribute("data-icon") !== name) { b.setAttribute("data-icon", name); b.innerHTML = svg(name); }
    if (label) { b.setAttribute("aria-label", label); b.title = label; }
  }
  function paint() {
    if (!el || el.hidden) return;
    var Lo = L(), t = Lo.track(), th = t ? t.theme : Lo.theme(), cat = Lo.catalog().filter(function (c) { return c.theme === th; })[0];
    el.style.setProperty("--md", ACCENT[th] || "var(--accent)");
    var q = function (s) { return el.querySelector(s); };
    q("[data-md-eyebrow]").textContent = t ? t.themeName + " · track " + t.no + "/" + t.of + (t.paused ? " · paused" : "") : "soundtrack · off";
    q("[data-md-title]").textContent = t ? t.name : "Music is off";
    q("[data-md-sub]").textContent = t ? t.style + " · " + t.bpm + " bpm" : "press play: your theme's songs";
    var playing = t && !t.paused;
    setIcon(q('[data-md="play"]'), playing ? "pause" : "play", playing ? "Pause" : "Play");
    q('[data-md="repeat"]').setAttribute("aria-pressed", String(repeat()));
    var sh = q('[data-md="shuffle"]'); sh.hidden = !Lo.shuffle; sh.setAttribute("aria-pressed", String(!!(Lo.shuffle && Lo.shuffle())));
    var v = Lo.volume(), vi = q("[data-md-vol]"); if (document.activeElement !== vi) vi.value = Math.round(v * 100);
    setIcon(q('[data-md="mute"]'), v === 0 ? "mute" : v < 0.5 ? "volLow" : "vol", v === 0 ? "Unmute" : "Mute");
    q('[data-md="stop"]').disabled = !t;
    ["prev", "back", "fwd", "next"].forEach(function (k) { q('[data-md="' + k + '"]').disabled = !t; });
    var lo = listOpen(); el.classList.toggle("is-folded", !lo);
    var lb = q('[data-md="list"]'); lb.setAttribute("aria-pressed", String(lo)); lb.title = lo ? "Hide the tracks" : "Show the tracks"; lb.setAttribute("aria-label", lb.title);
    q("[data-md-dur]").textContent = fmt(t ? t.dur : 0);
    if (!drag) draw(t && t.dur ? t.pos / t.dur : 0, t ? t.dur : 0);
    var tr = q("[data-md-track]"); tr.setAttribute("aria-valuemax", String(Math.round(t ? t.dur : 0))); tr.setAttribute("aria-valuenow", String(Math.round(t ? t.pos : 0)));
    var key = t ? th + ":" + t.si : "off:" + th;
    if (key !== lastKey) {
      lastKey = key;
      var e = t && cat ? cat.songs[t.si] : null;
      q("[data-md-outro]").style.width = e && e.outro ? (e.outro / (e.bars + e.outro) * 100) + "%" : "0";
      q("[data-md-marks]").innerHTML = t && t.si === 5 ? Lo.suite.marks(th).slice(1).map(function (m) { return '<i style="left:' + (m.at / t.dur * 100) + '%" title="' + esc(m.name) + '"></i>'; }).join("") : "";
      q("[data-md-list]").innerHTML = cat ? cat.songs.filter(function (s) { return !s.locked; }).sort(function (a, b) { return a.no - b.no; }).map(function (s) {
        return '<li><button type="button" data-md-si="' + s.si + '" data-md-no="' + s.no + '"><span class="mdock__n"></span><span class="mdock__t">' + esc(s.title) + (s.suite ? ' <small>secret</small>' : s.bonus ? ' <small>bonus</small>' : "") + "</span><span class=\"mdock__d\">" + fmt(s.secs) + "</span></button></li>";
      }).join("") : "";
    }
    el.querySelectorAll("[data-md-si]").forEach(function (b) {
      var onIt = t && +b.getAttribute("data-md-si") === t.si;
      b.classList.toggle("is-on", !!onIt);
      b.querySelector(".mdock__n").textContent = onIt ? (t.paused ? "▶" : "♪") : b.getAttribute("data-md-no");
    });
    q("[data-md-room]").hidden = !team() || location.pathname.indexOf("/soundtrack") === 0;
  }
  function place() {
    if (!el || el.hidden) return;
    if (!anchor || !document.body.contains(anchor)) anchor = document.querySelector(".lofi-btn");   // the header may have been swapped
    if (!anchor) return;
    if (sheet()) { el.style.left = el.style.top = el.style.right = ""; el.classList.add("is-sheet"); paint(); return; }
    el.classList.remove("is-sheet");
    var r = anchor.getBoundingClientRect(), w = el.offsetWidth;
    el.style.top = Math.round(r.bottom + 8) + "px";
    el.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))) + "px";
    paint();
  }
  function open(a) {
    if (!L()) return;
    if (!el) build();
    anchor = a || document.querySelector(".lofi-btn");
    el.hidden = false; lastKey = null; place(); paint();
    if (anchor) anchor.setAttribute("aria-expanded", "true");
    clearInterval(iv); iv = setInterval(paint, 250);
    var f = el.querySelector(".mdock__play"); if (f) f.focus({ preventScroll: true });
  }
  function close() {
    if (!el || el.hidden) return;
    el.hidden = true; clearInterval(iv); iv = null; drag = null; el.style.transform = "";
    if (anchor) anchor.setAttribute("aria-expanded", "false");
  }
  window.SamukaDock = {
    open: open, close: close, isOpen: function () { return !!(el && !el.hidden); },
    toggle: function (a) { if (el && !el.hidden) close(); else open(a); }
  };
})();
