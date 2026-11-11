/* Samuka · the Feeds tab (desktop): one tab for News, Trailers, What's new and the Blog.
 * The markup is in _layouts/shell.html and nav.js swaps it on every page, so everything here is
 * delegated: click or Enter/Space/↓ opens the menu, ↑/↓ move, Esc or a click outside closes it.
 */
(function () {
  "use strict";
  function btn() { return document.querySelector("[data-feeds-btn]"); }
  function menu() { return document.getElementById("feeds-menu"); }
  function items() { var m = menu(); return m ? Array.prototype.slice.call(m.querySelectorAll("a")) : []; }
  function isOpen() { var m = menu(); return !!(m && !m.hidden); }
  function place() {
    var b = btn(), m = menu();
    if (!b || !m || m.hidden) return;
    var r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    m.style.top = Math.round(r.bottom + 4) + "px";
    m.style.left = Math.round(Math.max(8, Math.min(r.left, vw - m.offsetWidth - 8))) + "px";
  }
  function open(focusFirst) {
    var b = btn(), m = menu();
    if (!b || !m) return;
    m.hidden = false;
    b.setAttribute("aria-expanded", "true");
    place();
    if (focusFirst) { var here = m.querySelector(".is-here") || items()[0]; if (here) here.focus(); }
  }
  function close(refocus) {
    var b = btn(), m = menu();
    if (!m || m.hidden) return;
    m.hidden = true;
    if (b) { b.setAttribute("aria-expanded", "false"); if (refocus) b.focus(); }
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest("[data-feeds-btn]")) { if (isOpen()) close(false); else open(e.detail === 0); return; }   // detail 0: keyboard "click"
    if (t.closest("#feeds-menu a")) { close(false); return; }   // nav.js follows the link
    if (isOpen() && !t.closest("#feeds-menu")) close(false);
  });
  document.addEventListener("keydown", function (e) {
    var b = btn();
    if (b && document.activeElement === b && (e.key === "ArrowDown")) { e.preventDefault(); open(true); return; }
    if (!isOpen()) return;
    var list = items(), i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); (list[(i + 1) % list.length] || list[0]).focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (list[(i - 1 + list.length) % list.length] || list[0]).focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === "Tab") close(false);
  }, true);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", function () { if (isOpen()) close(false); }, { passive: true });
  window.addEventListener("samuka:page", function () { close(false); });

  window.SamukaFeeds = { open: open, close: close, isOpen: isOpen };
})();
