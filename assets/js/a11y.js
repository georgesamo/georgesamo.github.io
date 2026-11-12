/* Samuka · keyboard and screen-reader helpers shared by every page.
 *  - Tab stays inside an open modal dialog (any visible [aria-modal="true"]: game window,
 *    terminal, account window, Go to…, the phone "more" sheet, the first-visit tour).
 *  - SamukaA11y.announce(text) reads a short message out to screen readers (nav.js uses it
 *    to say which page just opened after a seamless page switch).
 */
(function () {
  "use strict";
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

  function shown(el) { return !!(el && el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden"; }
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) { return el.tabIndex >= 0 && shown(el); });
  }
  // the dialog Tab should stay in: the one holding focus, else the last one open
  function openDialog() {
    var list = Array.prototype.filter.call(document.querySelectorAll('[aria-modal="true"]'), shown);
    if (!list.length) return null;
    var a = document.activeElement;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].contains(a)) return list[i];
    return list[list.length - 1];
  }
  /* keeps Tab / Shift+Tab inside `box`; returns true when it moved focus itself */
  function trap(box, e) {
    var list = focusables(box);
    if (!list.length) { e.preventDefault(); if (box.tabIndex < 0 && !box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1"); box.focus(); return true; }
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (!box.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return true; }
    if (e.shiftKey && (a === first || a === box)) { e.preventDefault(); last.focus(); return true; }
    if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); return true; }
    return false;
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var box = openDialog();
    if (box) trap(box, e);
  });

  var live = null;
  function announce(text) {
    if (!live) {
      live = document.createElement("div");
      live.className = "sr-only";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      live.setAttribute("data-announcer", "");
      document.body.appendChild(live);
    }
    // clear first so the same text twice in a row is still read out
    live.textContent = "";
    setTimeout(function () { live.textContent = text; }, 60);
  }

  /* give focus back to whatever opened a window. If that control has gone (a button in the
   * phone sheet, which closes as the window opens), use the sheet's "more" button instead. */
  function restore(el) {
    if (el && el.isConnected && el.focus && shown(el)) { el.focus({ preventScroll: true }); return el; }
    var more = document.querySelector("[data-mnav-more]");
    if (more && shown(more)) { more.focus({ preventScroll: true }); return more; }
    return null;
  }

  window.SamukaA11y = { trap: trap, focusables: focusables, openDialog: openDialog, announce: announce, restore: restore };
})();
