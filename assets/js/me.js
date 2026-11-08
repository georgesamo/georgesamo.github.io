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
    var name = on ? a.publicName() : "guest", streak = C.streakOf(myCard());
    return {
      enabled: !!(a && a.enabled), signedIn: on, name: name, role: a ? a.role() : "guest", ach: ach(),
      here: on && C.isMyCard(location.pathname, location.search, name) ? "card" : "",
      streak: streak ? streak.current : 0
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
    if (name === "export") { exportData(el); return true; }
    if (name === "delete") { askDelete(el); return true; }
    if (name === "delete-cancel") { var z = el.closest("[data-me-danger]"); if (z) z.innerHTML = ""; return true; }
    return false;
  }

  /* ---------- your data: download and delete ---------- */
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var link = document.createElement("a");
    link.href = url; link.download = name; link.rel = "external";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function exportData(btn) {
    if (!signedIn()) return Promise.resolve(false);
    var a = A(), c = db(), name = a.publicName();
    if (btn) { btn.disabled = true; btn.textContent = "preparing…"; }
    var p = c ? c.rpc("export_my_data").then(function (r) { if (r.error) throw r.error; return r.data; })
      : Promise.resolve({ exported_at: new Date().toISOString(), local_test_session: true, public_name: name, profile: a.profile(), achievements: window.SamukaAch ? window.SamukaAch.list.filter(function (x) { return window.SamukaAch.has(x.key); }).map(function (x) { return x.key; }) : [] });
    return p.then(function (data) {
      download(C.exportFileName(name), JSON.stringify(data, null, 2));
      if (btn) { btn.disabled = false; btn.textContent = "✓ downloaded"; }
      return true;
    }, function (err) {
      if (btn) { btn.disabled = false; btn.textContent = "⬇ download my data"; }
      dangerSay(btn, "✗ " + ((err && err.message) || "download failed") + (/function/.test((err && err.message) || "") ? " (run supabase/me.sql)" : ""));
      return false;
    });
  }
  function dangerSay(near, msg) {
    var z = near && near.closest && near.closest(".acct__data"), box = z && z.querySelector("[data-me-danger]");
    if (box) box.innerHTML = '<p class="acct__notice"><span class="err">' + C.esc(msg) + "</span></p>";
  }
  function askDelete(btn) {
    var box = btn && btn.closest(".acct__data") && btn.closest(".acct__data").querySelector("[data-me-danger]");
    if (!box || !signedIn()) return;
    box.innerHTML = C.deleteConfirmHtml(A().publicName());
    box.querySelector("input").focus();
  }
  function deleteAccount(form) {
    var a = A(), c = db(), btn = form.querySelector("[type=submit]");
    if (!C.confirmMatches(form.elements.confirm.value, a.publicName())) return Promise.resolve(false);
    btn.disabled = true; btn.textContent = "deleting…";
    var p = c ? c.rpc("delete_my_account").then(function (r) { if (r.error) throw r.error; }) : Promise.resolve();
    return p.then(function () {
      if (a.close) a.close();
      return Promise.resolve(a.signOut()).then(function () { return true; });
    }, function (err) {
      btn.disabled = false; btn.textContent = "delete for good";
      dangerSay(form, "✗ " + ((err && err.message) || "could not delete") + (/function/.test((err && err.message) || "") ? " (run supabase/me.sql)" : ""));
      return false;
    });
  }
  document.addEventListener("input", function (e) {
    var f = e.target.closest && e.target.closest("[data-me-delete]");
    if (f) f.querySelector("[type=submit]").disabled = !C.confirmMatches(e.target.value, A() && A().publicName());
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.closest && e.target.closest("[data-me-delete]");
    if (f) { e.preventDefault(); deleteAccount(f); }
  });
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
    dismissTip();
    // the streak in the header arrives with the player card
    if (signedIn() && myCard() === undefined) fetchCard(A().publicName()).then(function () {
      if (!isMenuOpen()) return;
      var head = el.querySelector(".me-menu__head"), tmp = document.createElement("div");
      tmp.innerHTML = C.menuHtml(ctx());
      if (head) head.replaceWith(tmp.querySelector(".me-menu__head"));
    });
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
    else p = Promise.resolve(a && a.mock && a.mock() ? { games: 7, best: { gems: 2310, sidekiq: 840 }, ranks: { gems: { rank: 3, of: 12, behind: 140 } }, streak: { current: 2, best: 5 } } : null);   // local test session
    p = p.then(function (card) { if (cards[name] && cards[name].promise === p) cards[name].card = card; return card; });
    cards[name] = { at: Date.now(), promise: p };
    return p;
  }
  // the last loaded card of the signed-in player, if any (menu header streak)
  function myCard() { var a = A(), hit = signedIn() && cards[a.publicName()]; return hit ? hit.card : undefined; }
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

  /* ---------- one-time tip pointing at the avatar menu after the first sign-in ---------- */
  var TIP_KEY = "samuka-tip-menu", tip = null;
  function tipSeen() { try { return localStorage.getItem(TIP_KEY) === "1"; } catch (e) { return true; } }
  function dismissTip() {
    try { localStorage.setItem(TIP_KEY, "1"); } catch (e) {}
    if (tip) { tip.remove(); tip = null; }
  }
  function visibleAvatar() {
    return Array.prototype.filter.call(document.querySelectorAll("[data-account]"), function (b) { return !b.hidden && b.offsetParent !== null; })[0] || null;
  }
  function showTip() {
    var a = A(), b = visibleAvatar();
    if (tip || !signedIn() || tipSeen() || !b || (a.isOpen && a.isOpen())) return false;
    var r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    tip = document.createElement("div");
    tip.className = "me-tip";
    tip.setAttribute("role", "status");
    tip.innerHTML = "<b>Your stuff lives here</b><span>Player card, ranks, badges and settings: click your avatar any time.</span>" +
      '<button type="button" class="btn" data-me-tip-close>got it</button>';
    document.body.appendChild(tip);
    tip.style.top = Math.round(r.bottom + 10) + "px";
    tip.style.left = Math.round(Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth + 28, vw - tip.offsetWidth - 8))) + "px";
    return true;
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-me-tip-close]")) dismissTip(); });

  /* ---------- wiring ---------- */
  function paint() { paintTree(); paintSheet(); paintJump(); if (isMenuOpen()) menu.el.innerHTML = C.menuHtml(ctx()); }
  window.addEventListener("samuka:auth", function () {
    if (!signedIn()) { closeMenu(false); if (tip) { tip.remove(); tip = null; } }
    paint(); autoJump();
    if (signedIn() && !tipSeen()) setTimeout(showTip, 1200);
  });
  window.addEventListener("samuka:achievement", paint);
  window.addEventListener("samuka:page", function () { autoJumped = ""; paint(); autoJump(); });
  window.addEventListener("hashchange", autoJump);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();

  window.SamukaMe = {
    menu: { open: openMenu, close: closeMenu, toggle: toggleMenu, isOpen: isMenuOpen, el: function () { return menu.el; } },
    act: act, ctx: ctx, paint: paint, paintTree: paintTree, paintSheet: paintSheet, paintJump: paintJump,
    fillStats: fillStats, fetchCard: fetchCard, copyCard: copyCard, jumpToMe: jumpToMe, waitFor: waitFor,
    exportData: exportData, deleteAccount: deleteAccount, showTip: showTip, dismissTip: dismissTip,
    _resetCache: function () { cards = {}; }
  };
})();
