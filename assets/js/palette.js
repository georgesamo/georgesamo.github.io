/* Samuka · "go to…" command palette (Ctrl/Cmd + P, or any [data-open-palette] button).
 * A plain search over pages, games, your account and a few toggles, for people who
 * don't want the terminal. Items and ranking come from account-core.js.
 */
(function () {
  "use strict";
  var C = window.SamukaAccountCore;
  if (!C) return;
  var el = null, input = null, list = null, results = [], active = 0, lastFocus = null;

  function ctx() {
    var A = window.SamukaAuth, Ar = window.SamukaArcade, on = !!(A && A.user && A.user());
    return {
      enabled: !!(A && A.enabled), signedIn: on, name: on ? A.publicName() : "guest", role: A ? A.role() : "guest",
      games: Ar && Ar.list ? Ar.list() : []
    };
  }
  function build() {
    el = document.createElement("div");
    el.className = "pal";
    el.hidden = true;
    el.innerHTML = '<div class="pal__backdrop" data-pal-close></div>' +
      '<div class="pal__win" role="dialog" aria-modal="true" aria-label="Go to">' +
        '<input class="pal__input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Go to… pages, games, your stuff">' +
        '<ul class="pal__list" id="pal-list" role="listbox"></ul>' +
        '<p class="pal__foot"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</p>' +
      "</div>";
    document.body.appendChild(el);
    input = el.querySelector("input"); list = el.querySelector("ul");
    input.addEventListener("input", function () { active = 0; draw(); });
    input.addEventListener("keydown", onKey);
    el.addEventListener("click", function (e) {
      if (e.target.closest("[data-pal-close]")) return close();
      var li = e.target.closest("[data-pal-i]");
      if (li) run(results[+li.getAttribute("data-pal-i")]);
    });
    el.addEventListener("mousemove", function (e) {
      var li = e.target.closest("[data-pal-i]");
      if (li && +li.getAttribute("data-pal-i") !== active) { active = +li.getAttribute("data-pal-i"); mark(); }
    });
  }
  function draw() {
    results = C.searchPalette(C.paletteItems(ctx()), input.value, 9);
    if (active >= results.length) active = 0;
    list.innerHTML = results.length ? results.map(function (it, i) {
      return '<li role="option" id="pal-o' + i + '" data-pal-i="' + i + '"><span>' + C.esc(it.label) + "</span><small>" + C.esc(it.hint || "") + "</small></li>";
    }).join("") : '<li class="pal__empty">No matches. Try "leader", "card" or "theme".</li>';
    mark();
  }
  function mark() {
    Array.prototype.forEach.call(list.querySelectorAll("[data-pal-i]"), function (li, i) {
      li.classList.toggle("is-on", i === active);
      li.setAttribute("aria-selected", String(i === active));
      if (i === active) li.scrollIntoView({ block: "nearest" });
    });
    if (results.length) input.setAttribute("aria-activedescendant", "pal-o" + active); else input.removeAttribute("aria-activedescendant");
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return close(); }
    if (e.key === "Enter") { e.preventDefault(); if (results[active]) run(results[active]); return; }
    var i = C.nextIndex(active, results.length, e.key);
    if (i > -1 && e.key !== "Home" && e.key !== "End") { e.preventDefault(); active = i; mark(); }
  }

  // what an item does when chosen
  function run(it) {
    if (!it) return false;
    close(true);
    if (it.href) { if (window.SamukaNav) window.SamukaNav.go(it.href); else location.href = it.href; return true; }
    var act = it.act || "", Ar = window.SamukaArcade;
    if (act.indexOf("play:") === 0) { if (Ar) Ar.open(act.slice(5)); return true; }
    if (act === "daily") { if (window.SamukaScores) window.SamukaScores.openDaily(); return true; }
    if (act === "race") { if (window.SamukaRace) window.SamukaRace.open(); return true; }
    if (act === "theme") { var t = document.querySelector("[data-toggle-theme]"); if (t) t.click(); return true; }
    if (act === "terminal") { if (window.SamukaTerminal) window.SamukaTerminal.open(); return true; }
    if (window.SamukaMe) return window.SamukaMe.act(act, document.activeElement);
    return false;
  }

  function open() {
    if (!el) build();
    if (!el.hidden) return;
    lastFocus = document.activeElement;
    input.value = ""; active = 0;
    el.hidden = false;
    draw();
    input.focus();
  }
  function close(keepFocus) {
    if (!el || el.hidden) return;
    el.hidden = true;
    if (!keepFocus && lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function isOpen() { return !!(el && !el.hidden); }

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      if (isOpen()) close(); else open();
    }
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-open-palette]")) { e.preventDefault(); open(); }
  });
  window.addEventListener("samuka:page", function () { close(true); });

  window.SamukaPalette = { open: open, close: close, isOpen: isOpen, run: run, results: function () { return results; } };
})();
