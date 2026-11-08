/* Samuka · the Patch Bay (the lock on each theme's secret 6th track, the suite)
 *
 * A little synth rack: five song outputs on the left, the suite's five movement inputs on the right.
 * Drag a cable from a song to a movement (or click one, then the other). Each movement has a cryptic
 * label; "signal check" plays your patch and lights one LED per movement that's in the right slot,
 * without saying which. Patched right, the five jack tones sing the opening of the Ring Zero hook.
 *
 * The rack is cold until you've heard all five songs of that theme (SamukaLofi.suite.heard).
 * Open with SamukaPatchBay.open(theme), the `patchbay` terminal command, the hint toast that
 * appears once all five are heard, or the locked 6th row in the soundtrack room.
 */
(function () {
  "use strict";
  var ORDER = [0, 1, 3, 2, 4];                 // movement slot → song index (theme, chase, standoff, lowest, epilogue)
  var HOOK = [71, 69, 67, 66, 64];             // slot → note: B A G F# E, the first phrase of Ring Zero
  var CLUES = ["where it all begins", "don't look back", "the fastest hands win", "rock bottom", "432 · going home"];
  var ROMAN = ["I", "II", "III", "IV", "V"];
  var CABLE = ["#ff5f57", "#febc2e", "#3ad08f", "#4aa8ff", "#c49bff"];
  var ACCENT = { phthalo: "#3ad08f", knight: "#e5383b", golden: "#c49bff" };

  var dlg = null, theme = null, outs = [], patch = [null, null, null, null, null], sel = null, drag = null, checks = 0, solved = false, busy = false;
  var ac = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function L() { return window.SamukaLofi; }
  function S() { return L() && L().suite; }
  function themeInfo(th) { var s = S(); return s ? s.themes().filter(function (x) { return x.theme === th; })[0] : null; }

  /* ---------- the jack tones (a tiny plucked synth of its own) ---------- */
  function audio() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ac = new AC(); } catch (e) { ac = null; }
    return ac;
  }
  function pluck(m, when, vol, len) {
    var c = audio(); if (!c) return;
    if (c.state !== "running" && c.resume) { var p = c.resume(); if (p && p.catch) p.catch(function () {}); }
    var t = c.currentTime + (when || 0), info = themeInfo(theme), f = 440 * Math.pow(2, (m + (info ? info.tr : 0) - 69) / 12);
    var g = c.createGain(), lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(700, t + (len || 0.6));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.16, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (len || 0.6) + 0.3);
    [["triangle", 1, 1], ["sine", 2, 0.35], ["sawtooth", 1, 0.08]].forEach(function (p) {
      var o = c.createOscillator(), og = c.createGain(); o.type = p[0]; o.frequency.value = f * p[1]; og.gain.value = p[2];
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + (len || 0.6) + 0.4);
    });
    lp.connect(g); g.connect(c.destination);
  }
  function buzz(when) {   // a short "no signal" crackle
    var c = audio(); if (!c) return;
    var t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
    o.type = "square"; o.frequency.setValueAtTime(70, t); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
  }
  function noteOf(si) { return HOOK[ORDER.indexOf(si)]; }

  /* ---------- the dialog ---------- */
  function build() {
    dlg = document.createElement("div");
    dlg.className = "race pb";
    dlg.hidden = true;
    dlg.innerHTML = '<div class="race__backdrop" data-pb-close></div><div class="race__win pb__win" role="dialog" aria-modal="true" aria-labelledby="pb-title">' +
      '<div class="race__bar"><span class="dots"><i data-pb-close></i><i></i><i></i></span><span id="pb-title">bin/patchbay</span><button class="arcade__x" type="button" data-pb-close aria-label="Close the patch bay">esc</button></div>' +
      '<div class="pb__body" data-pb-body></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onClick);
    dlg.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", function () { if (dlg && !dlg.hidden) cables(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dlg && !dlg.hidden) { e.stopPropagation(); close(); } }, true);
  }
  function body() { return dlg.querySelector("[data-pb-body]"); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    if (a.join() === ORDER.join() || a.join() === "0,1,2,3,4") return shuffle(a);   // never hand out the answer
    return a;
  }

  function open(th) {
    var s = S();
    if (!s) return false;
    if (!dlg) build();
    theme = th && themeInfo(th) ? th : L().theme();
    var info = themeInfo(theme);
    dlg.style.setProperty("--pb", ACCENT[theme] || "var(--hl)");
    dlg.querySelector("#pb-title").textContent = "bin/patchbay · " + info.name.toLowerCase();
    patch = [null, null, null, null, null]; sel = null; checks = 0; busy = false;
    solved = s.open(theme);
    outs = solved ? ORDER.slice() : shuffle([0, 1, 2, 3, 4]);
    if (solved) patch = ORDER.slice();
    if (s.heard(theme) < 5 && !solved) cold(info); else paint();
    dlg.hidden = false;
    var f = dlg.querySelector(".pb__jack, .arcade__x"); if (f) f.focus();
    return true;
  }
  function close() { if (dlg) dlg.hidden = true; drag = null; }

  function cold(info) {
    var mask = S().heardMask(theme);
    body().innerHTML = '<p class="pb__lead">The rack is cold. <b>' + esc(info.name) + "</b>'s five songs haven't all come through yet.</p>" +
      '<ul class="pb__heard">' + info.titles.map(function (t, i) {
        var h = mask & (1 << i);
        return '<li class="' + (h ? "is-on" : "") + '"><span aria-hidden="true">' + (h ? "✓" : "·") + "</span> " + (h ? esc(t) : "track " + (i + 1) + " · not heard yet") + "</li>";
      }).join("") + "</ul>" +
      '<p class="muted pb__small">Turn on the site soundtrack (♪) with this theme on and let each song play for a few bars. ' + S().heard(theme) + "/5 heard.</p>";
  }

  function paint() {
    var info = themeInfo(theme), filled = patch.filter(function (x) { return x != null; }).length;
    body().innerHTML = '<p class="pb__lead">' + (solved ? "Every movement patched. <b>" + esc(info.suite) + "</b> is yours."
      : "The suite is in pieces. Patch each song into its movement, then run a signal check.") + "</p>" +
      '<div class="pb__rack" data-pb-rack><svg class="pb__cables" data-pb-svg aria-hidden="true"></svg>' +
      '<div class="pb__col"><p class="pb__label">out · songs</p>' + outs.map(function (si) {
        var used = patch.indexOf(si) > -1;
        return '<button type="button" class="pb__jack pb__jack--out' + (sel === si ? " is-sel" : "") + (used ? " is-used" : "") + '" data-out="' + si + '" style="--c:' + CABLE[si] + '" aria-pressed="' + (sel === si) + '">' +
          '<span class="pb__name">' + esc(info.titles[si]) + '</span><span class="pb__sock" data-sock></span></button>';
      }).join("") + "</div>" +
      '<div class="pb__col"><p class="pb__label">in · ' + esc(info.suite.toLowerCase()) + "</p>" + CLUES.map(function (clue, slot) {
        var si = patch[slot];
        return '<button type="button" class="pb__jack pb__jack--in' + (si != null ? " is-used" : "") + '" data-in="' + slot + '"' + (si != null ? ' style="--c:' + CABLE[si] + '"' : "") +
          ' aria-label="Movement ' + ROMAN[slot] + ": " + esc(clue) + (si != null ? ", patched to " + esc(info.titles[si]) : ", empty") + '">' +
          '<span class="pb__sock" data-sock></span><span class="pb__name"><b>' + ROMAN[slot] + "</b> " + esc(clue) + "</span></button>";
      }).join("") + "</div></div>" +
      '<div class="pb__foot"><span class="pb__leds" data-pb-leds aria-hidden="true">' + "<i></i><i></i><i></i><i></i><i></i></span>" +
      (solved ? '<button class="btn" type="button" data-pb-play>▶ play ' + esc(info.suite) + "</button>"
        : '<button class="btn" type="button" data-pb-run' + (filled < 5 ? " disabled" : "") + ">signal check</button>" +
          '<button class="btn btn--ghost" type="button" data-pb-clear' + (filled ? "" : " disabled") + ">unplug all</button>") + "</div>" +
      '<p class="pb__msg muted" data-pb-msg role="status">' + (solved ? "Track 6 now plays after the epilogue in this theme's rotation."
        : sel != null ? "Now pick a movement on the right for <b>" + esc(info.titles[sel]) + "</b>."
        : filled < 5 ? filled + "/5 patched · drag from a song to a movement, or click one then the other" : "All five patched. Run a signal check.") + "</p>";
    if (solved) leds(5, true);
    cables(); requestAnimationFrame(function () { cables(); });
  }
  function leds(n, ok) {
    var el = dlg.querySelector("[data-pb-leds]"); if (!el) return;
    el.querySelectorAll("i").forEach(function (i, k) { i.className = k < n ? (ok ? "is-ok" : "is-on") : ""; });
  }
  function msg(html) { var el = dlg.querySelector("[data-pb-msg]"); if (el) el.innerHTML = html; }

  /* ---------- cables ---------- */
  function center(el, box) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top }; }
  function path(a, b) {
    var dx = Math.max(40, Math.abs(b.x - a.x) * 0.45), sag = 18 + Math.abs(b.y - a.y) * 0.15;
    return "M" + a.x + " " + a.y + " C" + (a.x + dx) + " " + (a.y + sag) + " " + (b.x - dx) + " " + (b.y + sag) + " " + b.x + " " + b.y;
  }
  function cables(px, py) {
    var rack = dlg.querySelector("[data-pb-rack]"), svg = dlg.querySelector("[data-pb-svg]"); if (!rack || !svg) return;
    var box = rack.getBoundingClientRect(), html = "";
    svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
    patch.forEach(function (si, slot) {
      if (si == null) return;
      var a = rack.querySelector('[data-out="' + si + '"] [data-sock]'), b = rack.querySelector('[data-in="' + slot + '"] [data-sock]');
      if (a && b) html += '<path d="' + path(center(a, box), center(b, box)) + '" stroke="' + CABLE[si] + '"' + (solved ? ' class="is-live"' : "") + "/>";
    });
    if (drag && drag.moved && px != null) {
      var s = rack.querySelector('[data-out="' + drag.si + '"] [data-sock]');
      if (s) html += '<path class="is-drag" d="' + path(center(s, box), { x: px - box.left, y: py - box.top }) + '" stroke="' + CABLE[drag.si] + '"/>';
    }
    svg.innerHTML = html;
  }

  /* ---------- patching ---------- */
  function connect(si, slot) {
    var was = patch.indexOf(si); if (was > -1) patch[was] = null;   // one cable per song
    patch[slot] = si; sel = null;
    pluck(noteOf(si), 0, 0.12, 0.4);
    paint();
  }
  function onDown(e) {
    suppressClick = false;                                  // a fresh press: whatever drag came before is over
    if (solved || busy || e.button > 0) return;
    var j = e.target.closest("[data-out]"); if (!j) return;
    drag = { si: +j.getAttribute("data-out"), x: e.clientX, y: e.clientY, moved: false };
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) { drag.moved = true; dlg.classList.add("is-dragging"); }
    if (drag.moved) { e.preventDefault(); cables(e.clientX, e.clientY); }
  }
  function onUp(e) {
    if (!drag) return;
    var d = drag; drag = null; dlg.classList.remove("is-dragging");
    if (!d.moved) return;                                   // a plain click: handled by onClick
    suppressClick = true;                                   // swallow the click the browser may send after a drag
    var hit = document.elementFromPoint(e.clientX, e.clientY), inJ = hit && hit.closest && hit.closest("[data-in]");
    if (inJ && dlg.contains(inJ)) connect(d.si, +inJ.getAttribute("data-in")); else cables();
  }
  var suppressClick = false;

  function onClick(e) {
    if (e.target.closest("[data-pb-close]")) { close(); return; }
    if (e.target.closest("[data-pb-play]")) { var Lo = L(); if (Lo && Lo.play) Lo.play(theme, 5); close(); return; }
    if (suppressClick && e.detail !== 0) { suppressClick = false; return; }   // keyboard clicks (detail 0) always count
    suppressClick = false;
    if (solved || busy) return;
    var out = e.target.closest("[data-out]"), inJ = e.target.closest("[data-in]");
    if (out) { var si = +out.getAttribute("data-out"); sel = sel === si ? null : si; if (sel != null) pluck(noteOf(si), 0, 0.1, 0.35); paint(); focusJack('[data-out="' + si + '"]'); return; }
    if (inJ) {
      var slot = +inJ.getAttribute("data-in");
      if (sel != null) { connect(sel, slot); focusJack('[data-in="' + slot + '"]'); }
      else if (patch[slot] != null) { patch[slot] = null; buzz(); paint(); focusJack('[data-in="' + slot + '"]'); }
      return;
    }
    if (e.target.closest("[data-pb-clear]")) { patch = [null, null, null, null, null]; sel = null; leds(0); paint(); return; }
    if (e.target.closest("[data-pb-run]")) run();
  }
  function focusJack(q) { var el = dlg.querySelector(q); if (el) el.focus(); }

  function run() {
    if (patch.indexOf(null) > -1) return;
    busy = true; checks++;
    var right = patch.filter(function (si, slot) { return si === ORDER[slot]; }).length, gap = 0.34;
    leds(0);
    msg("signal check #" + checks + " · listening…");
    patch.forEach(function (si, slot) {
      pluck(noteOf(si), slot * gap, 0.16, slot === 4 ? 1.4 : 0.5);
      setTimeout(function () { var j = dlg.querySelector('[data-in="' + slot + '"]'); if (j) { j.classList.add("is-ping"); setTimeout(function () { j.classList.remove("is-ping"); }, 260); } }, slot * gap * 1000);
    });
    setTimeout(function () {
      busy = false;
      if (right === 5) return win();
      leds(right, false);
      if (!right) buzz();
      msg("signal check #" + checks + " · <b>" + right + "/5</b> movements in the right place. " + (right ? "The LEDs don't say which." : "Nothing locks in yet.") + " Listen to the melody and try again.");
    }, 5 * gap * 1000 + 200);
  }
  function win() {
    solved = true;
    var info = themeInfo(theme); S().unlock(theme);
    [52, 55, 59, 64, 71].forEach(function (m, i) { pluck(m, i * 0.05, 0.08, 2.4); });
    paint();
    msg("✓ <b>" + esc(info.suite) + "</b> unlocked in " + checks + " signal check" + (checks === 1 ? "" : "s") + ". Track 6 now plays after the epilogue in this theme.");
  }

  /* ---------- the hint, once all five songs of a theme have been heard ---------- */
  function hint(th) {
    var info = themeInfo(th); if (!info) return;
    var el = document.createElement("div");
    el.className = "ach-toast pb-hint";
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="ach-toast__icon" aria-hidden="true">🎛</span><span><small>all five ' + esc(info.name) + ' songs heard</small><b>a sixth track is hiding</b>' +
      '<button class="btn" type="button">open the patch bay</button></span>';
    document.body.appendChild(el);
    el.querySelector("button").addEventListener("click", function () { el.remove(); open(th); });
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    setTimeout(function () { el.classList.remove("is-in"); }, 9000);
    setTimeout(function () { el.remove(); }, 9600);
  }
  window.addEventListener("samuka:suite", function (e) { var d = e.detail || {}; if (d.type === "ready") hint(d.theme); });

  window.SamukaPatchBay = { open: open, close: close, isOpen: function () { return !!(dlg && !dlg.hidden); },
    // for tests: the answer and the clue labels
    _order: ORDER.slice(), _clues: CLUES.slice() };
})();
