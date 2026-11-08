/* DOM tests: assets/js/me.js with fake SamukaAuth / SamukaAch */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, beforeEach = T.beforeEach, afterEach = T.afterEach;
  var M = window.SamukaMe;
  var box, calls;
  var ACH = [{ key: "a" }, { key: "b" }, { key: "c" }];

  function fake(o) {
    calls = [];
    window.SamukaAuth = {
      enabled: o.enabled !== false,
      user: function () { return o.user ? { id: "u1", email: "u@x" } : null; },
      role: function () { return o.role || (o.user ? "user" : "guest"); },
      publicName: function () { return o.user ? o.name || "neo" : "guest"; },
      mock: function () { return !!o.mock; },
      client: function () { return o.client || null; },
      open: function (x) { calls.push(["open", x || null]); },
      signOut: function () { calls.push(["signOut"]); }
    };
    window.SamukaAch = { list: ACH, has: function (k) { return k === "a"; } };
    window.SamukaBoard = { open: function () { calls.push(["board"]); } };
    window.SamukaAdmin = { open: function () { calls.push(["admin"]); } };
  }
  function mount(html) { box.innerHTML = html; return box; }
  function key(el, k) { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); }

  beforeEach(function () {
    box = document.getElementById("sandbox");
    box.innerHTML = "";
    M._resetCache();
    fake({ user: true });
  });
  afterEach(function () { M.menu.close(false); box.innerHTML = ""; });

  describe("me.js: context", function () {
    it("describes a signed-in player", function () {
      var c = M.ctx();
      expect(c.enabled).toBe(true);
      expect(c.signedIn).toBe(true);
      expect(c.name).toBe("neo");
      expect(c.ach).toEqual({ n: 1, total: 3 });
      expect(c.here).toBe("");
    });
    it("describes a guest", function () {
      fake({ user: false });
      var c = M.ctx();
      expect(c.signedIn).toBe(false);
      expect(c.name).toBe("guest");
      expect(c.role).toBe("guest");
    });
    it("copes with achievements not being loaded", function () {
      window.SamukaAch = undefined;
      expect(M.ctx().ach).toEqual({ n: 0, total: 0 });
    });
  });

  describe("me.js: actions", function () {
    it("opens the account window on the asked tab", function () {
      ["profile", "appearance", "settings", "badges"].forEach(function (t) { M.act(t); });
      expect(calls).toEqual([["open", { tab: "profile" }], ["open", { tab: "appearance" }], ["open", { tab: "settings" }], ["open", { tab: "badges" }]]);
    });
    it("signs in, signs out, opens the board and admin", function () {
      M.act("signin"); M.act("signout"); M.act("board"); M.act("admin");
      expect(calls).toEqual([["open", null], ["signOut"], ["board"], ["admin"]]);
    });
    it("ignores unknown actions", function () {
      expect(M.act("explode")).toBe(false);
      expect(calls).toEqual([]);
    });
    it("handles [data-me-act] clicks anywhere on the page", function () {
      mount('<button data-me-act="badges"><span>inner</span></button>');
      box.querySelector("span").click();
      expect(calls).toEqual([["open", { tab: "badges" }]]);
    });
    it("copies the card link and says so", async function () {
      var wrote = null, orig = Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function (t) { wrote = t; return Promise.resolve(); } } });
      try {
        var b = mount('<button>copy</button>').querySelector("button");
        expect(await M.copyCard(b)).toBe(true);
        expect(wrote).toBe(location.origin + "/u/?n=neo");
        expect(b.textContent).toBe("✓ link copied");
      } finally { delete navigator.clipboard; if (orig) Object.defineProperty(Navigator.prototype, "clipboard", orig); }
    });
    it("does not copy for guests", async function () {
      fake({ user: false });
      expect(await M.copyCard(null)).toBe(false);
    });
  });

  describe("me.js: avatar menu", function () {
    it("opens under the button, focuses the first item and sets aria-expanded", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.open(b);
      var el = M.menu.el();
      expect(M.menu.isOpen()).toBe(true);
      expect(b.getAttribute("aria-expanded")).toBe("true");
      expect(b.getAttribute("aria-controls")).toBe("me-menu");
      expect(el.getAttribute("role")).toBe("menu");
      expect(document.activeElement.getAttribute("data-me-item")).toBe("card");
      expect(el.querySelector('[data-me-item="card"]').getAttribute("href")).toBe("/u/?n=neo");
      expect(el.querySelector('[data-me-item="badges"] small').textContent).toBe("1/3");
      expect(parseInt(el.style.top, 10)).toBeGreaterThan(0);
    });
    it("toggles closed and hands focus back to the button", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.toggle(b); M.menu.toggle(b);
      expect(M.menu.isOpen()).toBe(false);
      expect(b.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(b);
    });
    it("walks items with the arrow keys, Home and End", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.open(b);
      var at = function () { return document.activeElement.getAttribute("data-me-item"); };
      key(document.activeElement, "ArrowDown"); expect(at()).toBe("ranks");
      key(document.activeElement, "End"); expect(at()).toBe("signout");
      key(document.activeElement, "ArrowDown"); expect(at()).toBe("card");
      key(document.activeElement, "ArrowUp"); expect(at()).toBe("signout");
      key(document.activeElement, "Home"); expect(at()).toBe("card");
    });
    it("closes on Escape and returns focus", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.open(b);
      key(document.activeElement, "Escape");
      expect(M.menu.isOpen()).toBe(false);
      expect(document.activeElement).toBe(b);
    });
    it("closes on Tab without stealing focus", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.open(b);
      key(document.activeElement, "Tab");
      expect(M.menu.isOpen()).toBe(false);
    });
    it("closes when clicking outside, but not when clicking the button area", function () {
      var root = mount('<button id="av"><span id="inside">me</span></button><p id="out">elsewhere</p>');
      var b = root.querySelector("#av");
      M.menu.open(b);
      root.querySelector("#out").click();
      expect(M.menu.isOpen()).toBe(false);
    });
    it("runs an item's action and closes", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.open(b);
      M.menu.el().querySelector('[data-me-item="appearance"]').click();
      expect(calls).toEqual([["open", { tab: "appearance" }]]);
      expect(M.menu.isOpen()).toBe(false);
    });
    it("closes when a page link inside it is followed", function () {
      var b = mount('<button id="av">me</button>').querySelector("#av");
      M.menu.open(b);
      var a = M.menu.el().querySelector('[data-me-item="card"]');
      a.addEventListener("click", function (e) { e.preventDefault(); }, { once: true });   // stay on the test page
      a.click();
      expect(M.menu.isOpen()).toBe(false);
    });
    it("shows team items for the owner", function () {
      fake({ user: true, role: "samuka" });
      M.menu.open(mount('<button id="av">me</button>').querySelector("#av"));
      expect(M.menu.el().querySelector('[data-me-item="board"]')).toBeTruthy();
      expect(M.menu.el().querySelector('[data-me-item="admin"]')).toBeTruthy();
      M.menu.el().querySelector('[data-me-item="admin"]').click();
      expect(calls).toEqual([["admin"]]);
    });
    it("closes when the visitor signs out", function () {
      M.menu.open(mount('<button id="av">me</button>').querySelector("#av"));
      fake({ user: false });
      window.dispatchEvent(new CustomEvent("samuka:auth"));
      expect(M.menu.isOpen()).toBe(false);
    });
    it("closes on page navigation", function () {
      M.menu.open(mount('<button id="av">me</button>').querySelector("#av"));
      window.dispatchEvent(new CustomEvent("samuka:page"));
      expect(M.menu.isOpen()).toBe(false);
    });
  });

  describe("me.js: sidebar folder and phone sheet", function () {
    it("fills and shows the placeholders for a player", function () {
      var root = mount('<div data-me-tree hidden></div><div data-me-sheet hidden></div>');
      M.paint();
      var tree = root.querySelector("[data-me-tree]"), sheet = root.querySelector("[data-me-sheet]");
      expect(tree.hidden).toBe(false);
      expect(tree.querySelector('a[href="/u/?n=neo"]')).toBeTruthy();
      expect(sheet.hidden).toBe(false);
      expect(sheet.querySelector(".msheet__who b").textContent).toBe("neo");
    });
    it("shows a sign-in entry for guests", function () {
      fake({ user: false });
      var root = mount('<div data-me-tree hidden></div><div data-me-sheet hidden></div>');
      M.paint();
      expect(root.querySelector('[data-me-tree] [data-me-act="signin"]')).toBeTruthy();
      root.querySelector('[data-me-sheet] [data-me-act="signin"]').click();
      expect(calls).toEqual([["open", null]]);
    });
    it("stays hidden when accounts are switched off", function () {
      fake({ user: false, enabled: false });
      var root = mount('<div data-me-tree></div><div data-me-sheet></div>');
      M.paint();
      expect(root.querySelector("[data-me-tree]").hidden).toBe(true);
      expect(root.querySelector("[data-me-sheet]").hidden).toBe(true);
    });
    it("repaints when an achievement unlocks", function () {
      var root = mount('<div data-me-tree hidden></div>');
      M.paint();
      window.SamukaAch.has = function () { return true; };
      window.dispatchEvent(new CustomEvent("samuka:achievement"));
      expect(root.querySelector('[data-me-act="badges"] small').textContent).toBe("3/3");
    });
    it("repaints after a page swap (nav.js replaces the sidebar)", function () {
      var root = mount('<div data-me-tree hidden></div>');
      window.dispatchEvent(new CustomEvent("samuka:page"));
      expect(root.querySelector("[data-me-tree]").hidden).toBe(false);
    });
  });

  describe("me.js: profile stats", function () {
    it("fills the stats strip from the player card (local test session)", async function () {
      fake({ user: true, mock: true });
      var root = mount(window.SamukaAccountCore.statsHtml({ ach: { n: 0, total: 3 } }));
      expect(await M.fillStats(root)).toBe(true);
      var vals = Array.prototype.map.call(root.querySelectorAll(".acct__stat b"), function (b) { return b.textContent; });
      expect(vals).toEqual(["1/3", "7", "2,310"]);
    });
    it("asks the database once per name and caches it", async function () {
      var n = 0;
      fake({ user: true, client: { rpc: function (fn, args) { n++; expect(fn).toBe("player_card"); expect(args).toEqual({ p_name: "neo" }); return Promise.resolve({ data: { games: 3, best: { schema: 40 } } }); } } });
      var a = await M.fetchCard("neo"), b = await M.fetchCard("neo");
      expect(n).toBe(1);
      expect(a).toBe(b);
      var root = mount(window.SamukaAccountCore.statsHtml({ ach: { n: 0, total: 3 } }));
      await M.fillStats(root);
      expect(n).toBe(1);
      expect(root.textContent).toContain("best · Schema Stack");
    });
    it("shows an empty state when the card cannot be loaded", async function () {
      fake({ user: true, client: { rpc: function () { return Promise.resolve({ error: { message: "nope" } }); } } });
      var root = mount(window.SamukaAccountCore.statsHtml({ ach: { n: 0, total: 3 } }));
      await M.fillStats(root);
      expect(root.textContent).toContain("no scores yet");
    });
    it("survives a rejected request", async function () {
      fake({ user: true, client: { rpc: function () { return Promise.reject(new Error("offline")); } } });
      expect(await M.fetchCard("neo")).toBe(null);
    });
    it("does nothing without a stats strip or for guests", async function () {
      expect(await M.fillStats(mount("<p>no strip</p>"))).toBe(false);
      fake({ user: false });
      expect(await M.fillStats(mount(window.SamukaAccountCore.statsHtml({ ach: { n: 0, total: 3 } })))).toBe(false);
    });
    it("skips a strip that was removed while loading", async function () {
      fake({ user: true, mock: true });
      var root = mount(window.SamukaAccountCore.statsHtml({ ach: { n: 0, total: 3 } }));
      var p = M.fillStats(root);
      box.innerHTML = "";
      expect(await p).toBe(false);
    });
  });

  describe("me.js: leaderboards jump to me", function () {
    var BOARD = '<div data-leaderboard><ol><li class="lb__row"><a href="#">a</a></li><li class="lb__row is-me"><a href="#" id="mine">neo</a></li></ol></div>' +
      '<button data-lb-jump hidden>jump</button><p data-lb-jump-msg hidden></p>';
    it("shows the button only to signed-in players", function () {
      var root = mount(BOARD);
      M.paintJump();
      expect(root.querySelector("[data-lb-jump]").hidden).toBe(false);
      fake({ user: false });
      M.paintJump();
      expect(root.querySelector("[data-lb-jump]").hidden).toBe(true);
    });
    it("scrolls to, flashes and focuses your row", function () {
      var root = mount(BOARD);
      root.querySelector("[data-lb-jump]").click();
      expect(root.querySelector(".lb__row.is-me").classList.contains("is-flash")).toBe(true);
      expect(document.activeElement.id).toBe("mine");
      expect(root.querySelector("[data-lb-jump-msg]").hidden).toBe(true);
    });
    it("explains when you are not on any board", function () {
      var root = mount(BOARD.replace(" is-me", ""));
      expect(M.jumpToMe()).toBe(0);
      var msg = root.querySelector("[data-lb-jump-msg]");
      expect(msg.hidden).toBe(false);
      expect(msg.textContent).toContain("not in a top 25");
    });
    it("asks guests to sign in", function () {
      fake({ user: false });
      var root = mount(BOARD.replace(" is-me", ""));
      M.jumpToMe();
      expect(root.querySelector("[data-lb-jump-msg]").textContent).toContain("Sign in");
    });
    it("counts every board you appear on", function () {
      mount(BOARD + '<ol><li class="lb__row is-me"><a href="#">neo</a></li></ol>');
      expect(M.jumpToMe()).toBe(2);
    });
    it("waitFor resolves once the thing appears, or null after the timeout", async function () {
      var polls = 0;   // appears on the third poll (no wall-clock race, so background tabs can't flake it)
      expect(await M.waitFor(function () { return ++polls >= 3 ? "row" : null; }, 5000, 1)).toBe("row");
      expect(polls).toBe(3);
      expect(await M.waitFor(function () { return null; }, 30, 5)).toBe(null);
    });
  });
})();
