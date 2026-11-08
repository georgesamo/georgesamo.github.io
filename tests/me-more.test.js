/* DOM tests: me.js round two (your data, tip, menu streak) and palette.js */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, beforeEach = T.beforeEach, afterEach = T.afterEach;
  var M = window.SamukaMe, P = window.SamukaPalette, C = window.SamukaAccountCore;
  var box, calls, downloads;

  function fake(o) {
    calls = [];
    window.SamukaAuth = {
      enabled: o.enabled !== false,
      user: function () { return o.user ? { id: "u1" } : null; },
      role: function () { return o.role || (o.user ? "user" : "guest"); },
      publicName: function () { return o.user ? o.name || "neo" : "guest"; },
      profile: function () { return { nickname: o.name || null }; },
      mock: function () { return !!o.mock; },
      client: function () { return o.client || null; },
      isOpen: function () { return !!o.modalOpen; },
      open: function (x) { calls.push(["open", x || null]); },
      close: function () { calls.push(["close"]); },
      signOut: function () { calls.push(["signOut"]); }
    };
    window.SamukaAch = { list: [{ key: "a" }], has: function () { return false; } };
  }
  function mount(html) { box.innerHTML = html; return box; }
  function key(target, k, mods) {
    var ev = new KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}));
    target.dispatchEvent(ev);
    return ev;
  }
  // capture downloads instead of saving files
  var origCreate = URL.createObjectURL;
  function catchDownloads() {
    downloads = [];
    URL.createObjectURL = function (blob) { downloads.push(blob); return "blob:test"; };
    document.addEventListener("click", stopDownload, true);
  }
  function stopDownload(e) { var a = e.target.closest && e.target.closest("a[download]"); if (a) { downloads.name = a.download; e.preventDefault(); } }

  beforeEach(function () {
    box = document.getElementById("sandbox");
    box.innerHTML = "";
    M._resetCache();
    fake({ user: true });
    try { localStorage.removeItem("samuka-tip-menu"); } catch (e) {}
  });
  afterEach(function () {
    box.innerHTML = "";
    M.dismissTip();
    M.menu.close(false);
    if (P) P.close(true);
    URL.createObjectURL = origCreate;
    document.removeEventListener("click", stopDownload, true);
    try { localStorage.removeItem("samuka-tip-menu"); } catch (e) {}
  });

  describe("me.js: download my data", function () {
    it("asks the server and saves a JSON file named after you", async function () {
      catchDownloads();
      var asked = null;
      fake({ user: true, name: "neo", client: { rpc: function (fn) { asked = fn; return Promise.resolve({ data: { scores: [1, 2] } }); } } });
      var b = mount(C.dataHtml({})).querySelector('[data-me-act="export"]');
      expect(await M.exportData(b)).toBe(true);
      expect(asked).toBe("export_my_data");
      expect(downloads.length).toBe(1);
      expect(downloads.name).toMatch(/^samuka-arcade-neo-\d{4}-\d{2}-\d{2}\.json$/);
      expect(JSON.parse(await downloads[0].text())).toEqual({ scores: [1, 2] });
      expect(b.textContent).toBe("✓ downloaded");
    });
    it("explains a failure and hints at the missing SQL", async function () {
      catchDownloads();
      fake({ user: true, client: { rpc: function () { return Promise.resolve({ error: { message: "Could not find the function export_my_data" } }); } } });
      var root = mount(C.dataHtml({}));
      expect(await M.exportData(root.querySelector('[data-me-act="export"]'))).toBe(false);
      expect(downloads.length).toBe(0);
      expect(root.querySelector("[data-me-danger]").textContent).toContain("run supabase/me.sql");
    });
    it("works in a local test session without a server", async function () {
      catchDownloads();
      fake({ user: true, mock: true });
      expect(await M.exportData(null)).toBe(true);
      expect(JSON.parse(await downloads[0].text()).local_test_session).toBe(true);
    });
    it("does nothing for guests", async function () {
      fake({ user: false });
      expect(await M.exportData(null)).toBe(false);
    });
  });

  describe("me.js: delete account", function () {
    it("asks for typed confirmation and only then enables the button", function () {
      var root = mount(C.dataHtml({}));
      root.querySelector('[data-me-act="delete"]').click();
      var form = root.querySelector("form[data-me-delete]"), btn = form.querySelector("[type=submit]"), input = form.elements.confirm;
      expect(document.activeElement).toBe(input);
      expect(btn.disabled).toBe(true);
      input.value = "ne"; input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(btn.disabled).toBe(true);
      input.value = "NEO"; input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(btn.disabled).toBe(false);
    });
    it("cancel removes the form", function () {
      var root = mount(C.dataHtml({}));
      root.querySelector('[data-me-act="delete"]').click();
      root.querySelector('[data-me-act="delete-cancel"]').click();
      expect(root.querySelector("form[data-me-delete]")).toBe(null);
    });
    it("refuses a wrong name without calling the server", async function () {
      var called = false;
      fake({ user: true, client: { rpc: function () { called = true; return Promise.resolve({}); } } });
      var root = mount(C.dataHtml({}));
      root.querySelector('[data-me-act="delete"]').click();
      var form = root.querySelector("form[data-me-delete]");
      form.elements.confirm.value = "someone-else";
      expect(await M.deleteAccount(form)).toBe(false);
      expect(called).toBe(false);
    });
    it("deletes on the server, closes the window and signs out", async function () {
      var asked = null;
      fake({ user: true, client: { rpc: function (fn) { asked = fn; return Promise.resolve({ data: null }); } } });
      var root = mount(C.dataHtml({}));
      root.querySelector('[data-me-act="delete"]').click();
      var form = root.querySelector("form[data-me-delete]");
      form.elements.confirm.value = "neo";
      expect(await M.deleteAccount(form)).toBe(true);
      expect(asked).toBe("delete_my_account");
      expect(calls).toEqual([["close"], ["signOut"]]);
    });
    it("keeps you signed in and explains when the server refuses", async function () {
      fake({ user: true, client: { rpc: function () { return Promise.resolve({ error: { message: "the owner account cannot be deleted from the site" } }); } } });
      var root = mount(C.dataHtml({}));
      root.querySelector('[data-me-act="delete"]').click();
      var form = root.querySelector("form[data-me-delete]");
      form.elements.confirm.value = "neo";
      expect(await M.deleteAccount(form)).toBe(false);
      expect(calls).toEqual([]);
      expect(root.textContent).toContain("owner account cannot be deleted");
      expect(form.querySelector("[type=submit]").disabled).toBe(false);
    });
    it("submitting the form runs the delete", async function () {
      fake({ user: true, mock: true });
      var root = mount(C.dataHtml({}));
      root.querySelector('[data-me-act="delete"]').click();
      var form = root.querySelector("form[data-me-delete]");
      form.elements.confirm.value = "neo";
      form.querySelector("[type=submit]").disabled = false;
      form.querySelector("[type=submit]").click();
      await M.waitFor(function () { return calls.length >= 2; }, 1000, 5);
      expect(calls).toEqual([["close"], ["signOut"]]);
    });
  });

  describe("me.js: first sign-in tip", function () {
    it("points at the avatar once, and 'got it' remembers", function () {
      var btn = mount('<button data-account>me</button>').querySelector("button");
      expect(M.showTip()).toBe(true);
      var tip = document.querySelector(".me-tip");
      expect(tip).toBeTruthy();
      expect(parseInt(tip.style.top, 10)).toBe(Math.round(btn.getBoundingClientRect().bottom + 10));   // just under the avatar
      tip.querySelector("[data-me-tip-close]").click();
      expect(document.querySelector(".me-tip")).toBe(null);
      expect(localStorage.getItem("samuka-tip-menu")).toBe("1");
      expect(M.showTip()).toBe(false);
    });
    it("opening the menu counts as having seen it", function () {
      var b = mount('<button data-account>me</button>').querySelector("button");
      M.showTip();
      M.menu.open(b);
      expect(document.querySelector(".me-tip")).toBe(null);
      expect(localStorage.getItem("samuka-tip-menu")).toBe("1");
    });
    it("stays away from guests, hidden buttons and an open account window", function () {
      mount('<button data-account hidden>me</button>');
      expect(M.showTip()).toBe(false);
      mount('<button data-account>me</button>');
      fake({ user: false });
      expect(M.showTip()).toBe(false);
      fake({ user: true, modalOpen: true });
      expect(M.showTip()).toBe(false);
    });
  });

  describe("me.js: the sidebar row stays put", function () {
    afterEach(function () { try { localStorage.removeItem("samuka-me"); } catch (e) {} });
    function notReady() { window.SamukaAuth.ready = function () { return false; }; }
    it("remembers you once signed in, and forgets you after signing out", function () {
      mount('<div data-me-tree></div>');
      M.paintTree();
      expect(JSON.parse(localStorage.getItem("samuka-me"))).toEqual({ name: "neo", n: 0, total: 1 });
      fake({ user: false });
      M.paintTree();
      expect(localStorage.getItem("samuka-me")).toBe(null);
    });
    it("while the session loads, draws the remembered you instead of 'sign in'", function () {
      localStorage.setItem("samuka-me", JSON.stringify({ name: "trinity", n: 3, total: 9 }));
      fake({ user: false }); notReady();
      var root = mount('<div data-me-tree></div>');
      M.paintTree();
      expect(root.querySelector(".tree__who-name").textContent).toBe("trinity");
      expect(root.querySelector('[data-me-act="signin"]')).toBe(null);
      expect(localStorage.getItem("samuka-me")).toBeTruthy();   // not wiped by the early paint
    });
    it("with nothing remembered, shows a placeholder until the session is known", function () {
      fake({ user: false }); notReady();
      var root = mount('<div data-me-tree></div>');
      M.paintTree();
      expect(root.querySelector(".tree__who--wait")).toBeTruthy();
      expect(root.querySelector("[data-me-tree]").hidden).toBe(false);
    });
    it("the phone sheet waits for the session instead of flashing 'sign in'", function () {
      fake({ user: false }); notReady();
      var root = mount('<div data-me-sheet hidden></div>');
      M.paintSheet();
      expect(root.querySelector("[data-me-sheet]").hidden).toBe(true);
      expect(root.querySelector('[data-me-act="signin"]')).toBe(null);
    });
    it("ignores a broken remembered value", function () {
      localStorage.setItem("samuka-me", "{not json");
      fake({ user: false }); notReady();
      var root = mount('<div data-me-tree></div>');
      M.paintTree();
      expect(root.querySelector(".tree__who--wait")).toBeTruthy();
    });
  });

  describe("hub.js: foldable sidebar folders", function () {
    var root = document.documentElement, before;
    beforeEach(function () { before = root.dataset.treeClosed; root.dataset.treeClosed = ""; });
    afterEach(function () { root.dataset.treeClosed = before || ""; try { localStorage.removeItem("samuka-tree-closed"); } catch (e) {} });
    it("clicking a folder folds it, remembers it, and clicking again unfolds", function () {
      var b = mount('<button data-tree-dir="arcade" aria-expanded="true">arcade</button><div data-tree-group="arcade">x</div>').querySelector("button");
      b.click();
      expect(root.dataset.treeClosed).toBe("arcade");
      expect(b.getAttribute("aria-expanded")).toBe("false");
      expect(localStorage.getItem("samuka-tree-closed")).toBe("arcade");
      b.click();
      expect(root.dataset.treeClosed).toBe("");
      expect(b.getAttribute("aria-expanded")).toBe("true");
    });
    it("re-applies the state to fresh sidebar markup after a page swap", function () {
      root.dataset.treeClosed = "about";
      var b = mount('<button data-tree-dir="about" aria-expanded="true">about</button>').querySelector("button");
      window.dispatchEvent(new CustomEvent("samuka:page"));
      expect(b.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("me.js: menu streak", function () {
    it("fills in the streak once the player card arrives", async function () {
      fake({ user: true, mock: true });
      var b = mount('<button>me</button>').querySelector("button");
      M.menu.open(b);
      await M.fetchCard("neo");
      await M.waitFor(function () { return /🔥/.test(M.menu.el().querySelector(".me-menu__head").textContent); }, 1000, 5);
      expect(M.menu.el().querySelector(".me-menu__head small").textContent).toBe("user · 🔥 2");
      expect(M.ctx().streak).toBe(2);
    });
  });

  describe("palette.js: go to…", function () {
    function rows() { return Array.prototype.map.call(document.querySelectorAll(".pal__list [data-pal-i] span"), function (s) { return s.textContent; }); }
    function type(text) { var i = document.querySelector(".pal__input"); i.value = text; i.dispatchEvent(new Event("input", { bubbles: true })); return i; }
    it("Ctrl+P opens it with the search focused, and toggles closed", function () {
      var ev = key(document.body, "p", { ctrlKey: true });
      expect(ev.defaultPrevented).toBe(true);
      expect(P.isOpen()).toBe(true);
      expect(document.activeElement.className).toBe("pal__input");
      expect(rows().length).toBeGreaterThan(3);
      key(document.body, "p", { ctrlKey: true });
      expect(P.isOpen()).toBe(false);
    });
    it("Cmd+P works too; plain P does not", function () {
      key(document.body, "p");
      expect(P.isOpen()).toBe(false);
      key(document.body, "p", { metaKey: true });
      expect(P.isOpen()).toBe(true);
    });
    it("any [data-open-palette] button opens it", function () {
      mount('<button data-open-palette>go</button>').querySelector("button").click();
      expect(P.isOpen()).toBe(true);
    });
    it("typing filters, best match first", function () {
      P.open();
      type("leader");
      expect(rows()[0]).toBe("Leaderboards");
      type("zzzz");
      expect(rows()).toEqual([]);
      expect(document.querySelector(".pal__empty")).toBeTruthy();
    });
    it("arrow keys move the highlight and Enter runs it", function () {
      P.open();
      var input = type("achiev");
      expect(rows()).toEqual(["Achievements"]);
      key(input, "ArrowDown");   // wraps on a single result
      expect(document.querySelector(".pal__list .is-on span").textContent).toBe("Achievements");
      expect(input.getAttribute("aria-activedescendant")).toBe("pal-o0");
      key(input, "Enter");
      expect(P.isOpen()).toBe(false);
      expect(calls).toEqual([["open", { tab: "badges" }]]);
    });
    it("clicking a row runs it", function () {
      P.open();
      type("sign out");
      document.querySelector(".pal__list [data-pal-i]").click();
      expect(calls).toEqual([["signOut"]]);
    });
    it("Escape closes and gives focus back", function () {
      var b = mount('<button id="here">x</button>').querySelector("button");
      b.focus();
      P.open();
      key(document.querySelector(".pal__input"), "Escape");
      expect(P.isOpen()).toBe(false);
      expect(document.activeElement).toBe(b);
    });
    it("runs page links through seamless navigation", function () {
      var went = null, prev = window.SamukaNav;
      window.SamukaNav = { go: function (u) { went = u; } };
      try { expect(P.run({ label: "x", href: "/leaderboards/" })).toBe(true); } finally { window.SamukaNav = prev; }
      expect(went).toBe("/leaderboards/");
    });
    it("starts games, the daily and races", function () {
      var log = [], prev = [window.SamukaArcade, window.SamukaScores, window.SamukaRace];
      window.SamukaArcade = { open: function (id) { log.push("play " + id); }, list: function () { return []; } };
      window.SamukaScores = { openDaily: function () { log.push("daily"); } };
      window.SamukaRace = { open: function () { log.push("race"); } };
      try { P.run({ act: "play:pitwall" }); P.run({ act: "daily" }); P.run({ act: "race" }); }
      finally { window.SamukaArcade = prev[0]; window.SamukaScores = prev[1]; window.SamukaRace = prev[2]; }
      expect(log).toEqual(["play pitwall", "daily", "race"]);
    });
    it("guests see sign in, players see their stuff", function () {
      fake({ user: false });
      P.open(); type("sign");
      expect(rows()).toContain("Sign in");
      P.close(true);
      fake({ user: true });
      P.open(); type("my");
      expect(rows()).toContain("My player card");
    });
  });
})();
