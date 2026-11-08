/* Samuka · "me" navigation: avatar menu, sidebar `me` folder, phone sheet header,
 * profile stats and "jump to me" on the leaderboards. Markup comes from
 * account-core.js; this file only wires it to the page.
 *
 * Every [data-me-act] control anywhere on the site is handled here:
 *   profile · appearance · settings · badges  open the account window on that tab
 *   board · admin · signout · signin · copy
 */
(function () {
  "use strict";
  var C = window.SamukaAccountCore;
  if (!C) return;
  function A() { return window.SamukaAuth; }
  function signedIn() { var a = A(); return !!(a && a.user && a.user()); }

  /* ---------- context for the builders ---------- */
  function ach() { var x = window.SamukaAch; return x ? C.achCount(x.list, x.has) : { n: 0, total: 0 }; }
  function ctx() {
    var a = A(), on = signedIn();
    var name = on ? a.publicName() : "guest";
    return {
      enabled: !!(a && a.enabled), signedIn: on, name: name, role: a ? a.role() : "guest", ach: ach(),
      here: on && C.isMyCard(location.pathname, location.search, name) ? "card" : ""
    };
  }

  /* ---------- actions ---------- */
  var TAB_ACTS = { profile: 1, appearance: 1, settings: 1, badges: 1 };
  function act(name, el) {
    var a = A();
    if (TAB_ACTS[name]) { if (a) a.open({ tab: name }); return true; }
    if (name === "signin") { if (a) a.open(); return true; }
    if (name === "signout") { if (a) a.signOut(); return true; }
    if (name === "board") { if (window.SamukaBoard) window.SamukaBoard.open(); return true; }
    if (name === "admin") { if (window.SamukaAdmin) window.SamukaAdmin.open(); return true; }
    if (name === "copy") { copyCard(el); return true; }
    return false;
  }
  function copyCard(btn) {
    if (!signedIn()) return Promise.resolve(false);
    var url = location.origin + C.cardHref(A().publicName());
    var done = function (ok) { if (btn) btn.textContent = ok ? "✓ link copied" : url; return ok; };
    if (!navigator.clipboard) return Promise.resolve(done(false));
    return navigator.clipboard.writeText(url).then(function () { return done(true); }, function () { return done(false); });
  }

  /* ---------- avatar menu ---------- */
  var menu = { el: null, anchor: null };
  function menuEl() {
    if (menu.el) return menu.el;
    var el = document.createElement("div");
    el.className = "me-menu";
    el.id = "me-menu";
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", "Your account");
    el.hidden = true;
    el.addEventListener("keydown", onMenuKey);
    document.body.appendChild(el);
    return (menu.el = el);
  }
  function items() { return menu.el ? Array.prototype.slice.call(menu.el.querySelectorAll("[data-me-item]")) : []; }
  function place(anchor) {
    var el = menu.el, r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    var w = el.offsetWidth || 260;
    el.style.top = Math.round(r.bottom + 6) + "px";
    el.style.left = Math.round(Math.max(8, Math.min(r.right - w, vw - w - 8))) + "px";
  }
  function openMenu(anchor) {
    var el = menuEl();
    el.innerHTML = C.menuHtml(ctx());
    el.hidden = false;
    menu.anchor = anchor || null;
    if (anchor) { anchor.setAttribute("aria-expanded", "true"); anchor.setAttribute("aria-controls", "me-menu"); place(anchor); }
    var first = items()[0]; if (first) first.focus();
  }
  function closeMenu(restoreFocus) {
    if (!menu.el || menu.el.hidden) return;
    menu.el.hidden = true;
    if (menu.anchor) { menu.anchor.setAttribute("aria-expanded", "false"); if (restoreFocus) menu.anchor.focus(); }
    menu.anchor = null;
  }
  function isMenuOpen() { return !!(menu.el && !menu.el.hidden); }
  function toggleMenu(anchor) { if (isMenuOpen() && menu.anchor === anchor) closeMenu(true); else openMenu(anchor); }
  function onMenuKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return closeMenu(true); }
    if (e.key === "Tab") return closeMenu(false);
    var list = items(), i = C.nextIndex(list.indexOf(document.activeElement), list.length, e.key);
    if (i > -1) { e.preventDefault(); list[i].focus(); }
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    var actEl = t.closest && t.closest("[data-me-act]");
    var inMenu = menu.el && menu.el.contains(t);
    if (actEl && act(actEl.getAttribute("data-me-act"), actEl)) {
      e.preventDefault();
      if (inMenu) closeMenu(false);
      return;
    }
    if (inMenu && t.closest("a[href]")) { closeMenu(false); return; }     // nav.js follows the link
    if (isMenuOpen() && !inMenu && !(menu.anchor && menu.anchor.contains(t))) closeMenu(false);
  });
  window.addEventListener("resize", function () { if (isMenuOpen() && menu.anchor) place(menu.anchor); });
  window.addEventListener("samuka:page", function () { closeMenu(false); });

  /* ---------- sidebar folder and phone sheet ---------- */
  function paintTree() {
    var html = C.treeHtml(ctx());
    document.querySelectorAll("[data-me-tree]").forEach(function (el) { el.innerHTML = html; el.hidden = !html; });
  }
  function paintSheet() {
    var html = C.sheetHtml(ctx());
    document.querySelectorAll("[data-me-sheet]").forEach(function (el) { el.innerHTML = html; el.hidden = !html; });
  }

  /* ---------- profile stats (best scores come from the public player card) ---------- */
  var cards = {};   // name -> { at, promise }
  var CARD_TTL = 60000;
  function fetchCard(name) {
    var hit = cards[name];
    if (hit && Date.now() - hit.at < CARD_TTL) return hit.promise;
    var a = A(), c = a && a.client && !a.mock() ? a.client() : null, p;
    if (c) p = c.rpc("player_card", { p_name: name }).then(function (r) { return r.error ? null : r.data || null; }, function () { return null; });
    else p = Promise.resolve(a && a.mock && a.mock() ? { games: 7, best: { gems: 2310, sidekiq: 840 } } : null);   // local test session
    cards[name] = { at: Date.now(), promise: p };
    return p;
  }
  function fillStats(root) {
    var el = root && root.querySelector("[data-me-stats]");
    if (!el || !signedIn()) return Promise.resolve(false);
    var name = A().publicName();
    return fetchCard(name).then(function (card) {
      if (!el.isConnected) return false;
      el.outerHTML = C.statsHtml({ ach: ach(), card: card, cardHref: C.cardHref(name) });
      return true;
    });
  }

  /* ---------- leaderboards: jump to my rows ---------- */
  function myRows() { return Array.prototype.slice.call(document.querySelectorAll(".lb__row.is-me")); }
  function say(msg) {
    var m = document.querySelector("[data-lb-jump-msg]");
    if (m) { m.textContent = msg || ""; m.hidden = !msg; }
  }
  function jumpToMe() {
    var rows = myRows();
    if (!rows.length) { say(signedIn() ? "You're not in a top 25 yet. Play a round and come back!" : "Sign in to see where you rank."); return 0; }
    say("");
    var row = rows[0];
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    rows.forEach(function (r) { r.classList.remove("is-flash"); void r.offsetWidth; r.classList.add("is-flash"); });
    var link = row.querySelector("a"); if (link) link.focus({ preventScroll: true });
    return rows.length;
  }
  // resolves with the element once test() finds it, or null after `ms`
  function waitFor(test, ms, every) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        var hit = test();
        if (hit) return resolve(hit);
        if (Date.now() - t0 >= ms) return resolve(null);
        setTimeout(poll, every || 150);
      })();
    });
  }
  function paintJump() {
    document.querySelectorAll("[data-lb-jump]").forEach(function (b) { b.hidden = !signedIn(); });
  }
  var autoJumped = "";
  function autoJump() {
    if (location.hash !== "#me" || !document.querySelector("[data-leaderboard]") || autoJumped === location.href) return;
    autoJumped = location.href;
    waitFor(function () { return myRows()[0]; }, 8000).then(function () { jumpToMe(); });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-lb-jump]")) { e.preventDefault(); jumpToMe(); }
  });

  /* ---------- wiring ---------- */
  function paint() { paintTree(); paintSheet(); paintJump(); if (isMenuOpen()) menu.el.innerHTML = C.menuHtml(ctx()); }
  window.addEventListener("samuka:auth", function () { if (!signedIn()) closeMenu(false); paint(); autoJump(); });
  window.addEventListener("samuka:achievement", paint);
  window.addEventListener("samuka:page", function () { autoJumped = ""; paint(); autoJump(); });
  window.addEventListener("hashchange", autoJump);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();

  window.SamukaMe = {
    menu: { open: openMenu, close: closeMenu, toggle: toggleMenu, isOpen: isMenuOpen, el: function () { return menu.el; } },
    act: act, ctx: ctx, paint: paint, paintTree: paintTree, paintSheet: paintSheet, paintJump: paintJump,
    fillStats: fillStats, fetchCard: fetchCard, copyCard: copyCard, jumpToMe: jumpToMe, waitFor: waitFor,
    _resetCache: function () { cards = {}; }
  };
})();
