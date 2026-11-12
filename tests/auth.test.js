/* Integration tests: the real auth.js + me.js + achievements/board/admin in an iframe,
 * signed in through auth.js's local test session (?as=user|samuka|nino|guest).
 * Needs a local http server (the test session only exists on localhost / 127.0.0.1).
 */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, afterEach = T.afterEach;
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var frame = null;

  function load(as) {
    return new Promise(function (resolve, reject) {
      if (frame) frame.remove();
      frame = document.createElement("iframe");
      frame.className = "fixture";
      frame.src = "fixtures/account.html?as=" + as;
      frame.onload = function () {
        var w = frame.contentWindow, t0 = Date.now();
        (function wait() {
          if (w.SamukaAuth && w.SamukaAuth.ready()) return resolve(w);
          if (Date.now() - t0 > 5000) return reject(new Error("fixture did not boot"));
          setTimeout(wait, 20);
        })();
      };
      document.body.appendChild(frame);
    });
  }
  function q(w, sel) { return w.document.querySelector(sel); }
  function qa(w, sel) { return Array.prototype.slice.call(w.document.querySelectorAll(sel)); }
  function tabs(w) { return qa(w, "[data-acct-tab]").map(function (b) { return b.getAttribute("data-acct-tab"); }); }
  function key(w, el, k) { el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); }
  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  // wrap a test so it is skipped (not failed) when opened from file://
  function local(fn) { return function () { return LOCAL ? fn() : "skip"; }; }

  afterEach(function () { if (frame) { frame.remove(); frame = null; } try { sessionStorage.removeItem("samuka-mock"); } catch (e) {} });

  describe("auth.js: guests", function () {
    it("the avatar button opens the sign-in window with perks, not a menu", local(async function () {
      var w = await load("guest");
      var b = q(w, "[data-account]");
      expect(b.hidden).toBe(false);
      expect(b.textContent).toBe("sign in");
      expect(b.hasAttribute("aria-haspopup")).toBe(false);
      b.click();
      expect(w.SamukaAuth.isOpen()).toBe(true);
      expect(w.SamukaMe.menu.isOpen()).toBe(false);
      expect(qa(w, ".acct__perks li").length).toBe(5);
      expect(q(w, "form[data-acct-email]")).toBeTruthy();
      expect(qa(w, "[data-acct-tab]").length).toBe(0);
      expect(q(w, "#acct-title").textContent).toContain("Sign in");
    }));
    it("the sidebar offers sign-in", local(async function () {
      var w = await load("guest");
      expect(q(w, '[data-me-tree] [data-me-act="signin"]')).toBeTruthy();
      q(w, '[data-me-tree] [data-me-act="signin"]').click();
      expect(w.SamukaAuth.isOpen()).toBe(true);
    }));
  });

  describe("auth.js: players", function () {
    it("the avatar button opens the quick menu with links to your own pages", local(async function () {
      var w = await load("user");
      var b = q(w, "[data-account]");
      expect(b.getAttribute("aria-haspopup")).toBe("menu");
      b.click();
      expect(w.SamukaMe.menu.isOpen()).toBe(true);
      expect(w.SamukaAuth.isOpen()).toBe(false);
      var name = w.SamukaAuth.publicName();
      expect(q(w, '#me-menu [data-me-item="card"]').getAttribute("href")).toBe("/u/?n=" + encodeURIComponent(name));
      expect(qa(w, "#me-menu [data-me-item]").map(function (e) { return e.getAttribute("data-me-item"); })).toEqual(["card", "ranks", "badges", "settings", "profile", "signout"]);
      b.click();
      expect(w.SamukaMe.menu.isOpen()).toBe(false);
    }));
    it("opens on the profile tab with stats, quick links and the nickname", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open();
      expect(tabs(w)).toEqual(["profile", "appearance", "settings", "badges"]);   // no team tab
      expect(w.SamukaAuth.tab()).toBe("profile");
      expect(q(w, '[data-acct-tab="profile"]').getAttribute("aria-selected")).toBe("true");
      expect(w.document.activeElement.getAttribute("data-acct-tab")).toBe("profile");
      expect(q(w, '#acct-panel input[name="nickname"]')).toBeTruthy();
      expect(q(w, "#acct-title").textContent).toContain("Profile");
      await tick(30);
      var vals = qa(w, ".acct__stat b").map(function (b) { return b.textContent; });
      expect(vals[1]).toBe("7");          // sample card in the local test session
      expect(vals[2]).toBe("#3");         // best rank
      expect(vals[3]).toBe("🔥 2");       // daily streak
    }));
    it("menu → Achievements opens the badges tab with the grid", local(async function () {
      var w = await load("user");
      q(w, "[data-account]").click();
      q(w, '#me-menu [data-me-item="badges"]').click();
      expect(w.SamukaMe.menu.isOpen()).toBe(false);
      expect(w.SamukaAuth.isOpen()).toBe(true);
      expect(w.SamukaAuth.tab()).toBe("badges");
      expect(qa(w, "#acct-panel .ach").length).toBe(w.SamukaAch.list.length);
      expect(q(w, "#acct-panel .acct__lead").textContent).toContain("unlocked");
    }));
    it("arrow keys move between tabs; appearance holds mode and skins", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open();
      key(w, q(w, '[data-acct-tab="profile"]'), "ArrowRight");
      expect(w.SamukaAuth.tab()).toBe("appearance");
      expect(w.document.activeElement.getAttribute("data-acct-tab")).toBe("appearance");
      expect(q(w, '#acct-panel input[name="mode"][value="dark"]').checked).toBe(true);
      expect(q(w, '#acct-panel input[name="skin"][value="phthalo"]').checked).toBe(true);
      expect(q(w, "#acct-panel .acct__hint")).toBeTruthy();       // CRT still locked
      key(w, w.document.activeElement, "End");
      expect(w.SamukaAuth.tab()).toBe("badges");
      key(w, w.document.activeElement, "ArrowRight");
      expect(w.SamukaAuth.tab()).toBe("profile");                 // wraps
    }));
    it("changing the mode keeps you on the appearance tab", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open({ tab: "appearance" });
      var light = q(w, '#acct-panel input[name="mode"][value="light"]');
      light.checked = true;
      light.dispatchEvent(new w.Event("change", { bubbles: true }));
      expect(w.Samuka.mode()).toBe("light");
      expect(w.SamukaAuth.tab()).toBe("appearance");
      expect(q(w, '#acct-panel input[name="mode"][value="light"]').checked).toBe(true);
    }));
    it("settings holds the glitch toggle and modules that did not pick a tab", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open({ tab: "settings" });
      expect(q(w, '#acct-panel input[name="glitches"]')).toBeTruthy();
      expect(q(w, "#acct-panel [data-fixture-extra]")).toBeTruthy();
    }));
    it("an unknown or hidden tab falls back to profile", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open({ tab: "team" });
      expect(w.SamukaAuth.tab()).toBe("profile");
    }));
    it("saving a nickname cleans it and updates your links", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open();
      var input = q(w, '#acct-panel input[name="nickname"]');
      input.value = "  Neo<>!_1 ";
      input.dispatchEvent(new w.Event("change", { bubbles: true }));
      expect(w.SamukaAuth.profile().nickname).toBe("Neo_1");
      expect(w.SamukaAuth.publicName()).toBe("Neo_1");
      expect(q(w, '[data-me-tree] a[href="/u/?n=Neo_1"]')).toBeTruthy();
      expect(q(w, '#acct-panel a[href="/u/?n=Neo_1"]')).toBeTruthy();
    }));
    it("closing the window gives focus back to where it was", local(async function () {
      var w = await load("user");
      var b = q(w, "[data-account]");
      b.focus();
      w.SamukaAuth.open();
      expect(w.document.activeElement).not.toBe(b);
      q(w, ".acct__x").click();
      expect(w.SamukaAuth.isOpen()).toBe(false);
      expect(w.document.activeElement).toBe(b);
    }));
    it("following a link inside the window closes it", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open();
      var a = q(w, '#acct-panel a[href^="/u/"]');
      a.addEventListener("click", function (e) { e.preventDefault(); }, { once: true });
      a.click();
      expect(w.SamukaAuth.isOpen()).toBe(false);
    }));
    it("the sidebar and phone sheet show your stuff", local(async function () {
      var w = await load("user");
      var name = w.SamukaAuth.publicName();
      expect(q(w, "[data-me-tree]").hidden).toBe(false);
      expect(q(w, "[data-me-tree] .tree__who-name").textContent).toBe(name);
      expect(q(w, "[data-me-sheet] .msheet__who b").textContent).toBe(name);
    }));
    it("sign out from the menu clears your stuff everywhere", local(async function () {
      var w = await load("user");
      q(w, "[data-account]").click();
      q(w, '#me-menu [data-me-item="signout"]').click();
      await tick(30);
      expect(w.SamukaAuth.user()).toBe(null);
      expect(w.SamukaMe.menu.isOpen()).toBe(false);
      // leaving the local test session switches accounts off entirely (there is no real backend)
      expect(q(w, '[data-me-tree] a[href^="/u/"]')).toBe(null);
      expect(q(w, "[data-me-sheet] .msheet__who")).toBe(null);
    }));
  });

  describe("guest play and claiming scores", function () {
    var PENDING = "samuka-scores-pending";
    afterEach(function () { try { localStorage.removeItem(PENDING); } catch (e) {} });
    // a tiny stand-in for Gem Match that ends right away with a score
    function toyGame(w, score) {
      w.SamukaArcade.register("gems", { title: "Toy", mount: function (stage, api) {
        setTimeout(function () { api.best(score); api.overlay("<h3>game over</h3><button>again</button>"); }, 10);
        return {};
      } });
    }
    it("guests can play free games; the daily and races still ask to sign in", local(async function () {
      var w = await load("guest");
      toyGame(w, 1234);
      expect(w.SamukaArcade.open("gems")).toBe(true);
      expect(w.SamukaArcade.isOpen()).toBe(true);
      w.SamukaArcade.close();
      expect(w.SamukaArcade.open("gems", { mode: "daily" })).toBe(false);
      expect(w.SamukaAuth.isOpen()).toBe(true);
      expect(q(w, ".acct__notice").textContent).toContain("Daily puzzles and live races");
    }));
    it("a guest's score is kept on the device and the game-over card offers to save it", local(async function () {
      var w = await load("guest");
      toyGame(w, 1234);
      w.SamukaArcade.open("gems");
      var claim = await new Promise(function (r) { var t0 = Date.now(); (function p() { var c = q(w, ".arcade__claim"); if (c || Date.now() - t0 > 3000) return r(c); setTimeout(p, 30); })(); });
      expect(claim).toBeTruthy();
      expect(claim.textContent).toContain("1,234");
      expect(w.SamukaScores.guestScores().map(function (p) { return p.row; })).toEqual([{ game: "gems", mode: "free", score: 1234 }]);
      claim.querySelector('[data-me-act="signin"]').click();
      expect(w.SamukaAuth.isOpen()).toBe(true);
    }));
    it("zero scores, dailies and races are never kept for guests", local(async function () {
      var w = await load("guest");
      expect(w.SamukaScores.keepGuestScore({ game: "gems", score: 0, mode: "free" })).toBe(false);
      expect(w.SamukaScores.keepGuestScore({ game: "gems", score: 50, mode: "daily" })).toBe(false);
      expect(w.SamukaScores.keepGuestScore({ game: "gems", score: 50, mode: "race" })).toBe(false);
      expect(w.SamukaScores.guestScores()).toEqual([]);
    }));
    it("signing in moves guest scores to the account and says so", local(async function () {
      var now = Date.now();
      localStorage.setItem(PENDING, JSON.stringify([
        { uid: "guest", row: { game: "gems", mode: "free", score: 900 }, t: now },
        { uid: "guest", row: { game: "sidekiq", mode: "free", score: 70 }, t: now },
        { uid: "guest", row: { game: "gems", mode: "free", score: 5 }, t: now - 40 * 864e5 },      // too old
        { uid: "someone-else", row: { game: "gems", mode: "free", score: 1 }, t: now }            // another account's retry
      ]));
      var w = await load("user"), inserted = [];
      var qb = { select: function () { return qb; }, eq: function () { return qb; }, neq: function () { return qb; }, order: function () { return qb; }, limit: function () { return qb; },
        insert: function (row) { inserted.push(row); return Promise.resolve({ error: null }); } };
      w.SamukaAuth.mock = function () { return false; };
      w.SamukaAuth.client = function () { return { from: function () { return qb; }, rpc: function () { return Promise.resolve({ data: [] }); } }; };
      await w.SamukaScores.flushPending();
      expect(inserted).toEqual([{ game: "gems", mode: "free", score: 900 }, { game: "sidekiq", mode: "free", score: 70 }]);
      expect(JSON.parse(localStorage.getItem(PENDING)).map(function (p) { return p.uid; })).toEqual(["someone-else"]);
      expect(q(w, ".ach-toast b") && qa(w, ".ach-toast b").some(function (b) { return b.textContent === "2 guest scores moved to your account"; })).toBe(true);
    }));
    it("a failed claim is kept for the account and retried later", local(async function () {
      localStorage.setItem(PENDING, JSON.stringify([{ uid: "guest", row: { game: "gems", mode: "free", score: 900 }, t: Date.now() }]));
      var w = await load("user");
      w.SamukaAuth.mock = function () { return false; };
      w.SamukaAuth.client = function () { return { from: function () { return { insert: function () { return Promise.resolve({ error: { message: "offline" } }); } }; } }; };
      await w.SamukaScores.flushPending();
      var left = JSON.parse(localStorage.getItem(PENDING));
      expect(left.length).toBe(1);
      expect(left[0].uid).toBe(w.SamukaAuth.user().id);
    }));
  });

  describe("auth.js: your data and badges", function () {
    it("settings ends with download and delete for players", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open({ tab: "settings" });
      var panel = q(w, "#acct-panel");
      expect(panel.lastElementChild.className).toBe("acct__data");
      expect(q(w, '#acct-panel [data-me-act="export"]')).toBeTruthy();
      expect(q(w, '#acct-panel [data-me-act="delete"]')).toBeTruthy();
    }));
    it("the owner can download but not delete", local(async function () {
      var w = await load("samuka");
      w.SamukaAuth.open({ tab: "settings" });
      expect(q(w, '#acct-panel [data-me-act="export"]')).toBeTruthy();
      expect(q(w, '#acct-panel [data-me-act="delete"]')).toBe(null);
    }));
    it("deleting from the settings tab signs you out (local test session)", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open({ tab: "settings" });
      q(w, '#acct-panel [data-me-act="delete"]').click();
      var form = q(w, "#acct-panel form[data-me-delete]");
      form.elements.confirm.value = w.SamukaAuth.publicName();
      form.elements.confirm.dispatchEvent(new w.Event("input", { bubbles: true }));
      form.querySelector("[type=submit]").click();
      await tick(50);
      expect(w.SamukaAuth.user()).toBe(null);
      expect(w.SamukaAuth.isOpen()).toBe(false);
    }));
    it("the badges tab shows what to unlock next", local(async function () {
      var w = await load("user");
      w.SamukaAuth.open({ tab: "badges" });
      expect(q(w, "#acct-panel .acct__next")).toBeTruthy();
      expect(q(w, "#acct-panel .acct__next").textContent).toContain("next up");
    }));
  });

  describe("auth.js: team roles", function () {
    it("samuka gets the team tab with board and admin, and both in the menu", local(async function () {
      var w = await load("samuka");
      w.SamukaAuth.open({ tab: "team" });
      expect(tabs(w)).toEqual(["profile", "appearance", "settings", "badges", "team"]);
      expect(w.SamukaAuth.tab()).toBe("team");
      expect(q(w, "#acct-panel [data-open-board]")).toBeTruthy();
      expect(q(w, "#acct-panel [data-open-admin]")).toBeTruthy();
      w.SamukaAuth.close();
      q(w, "[data-account]").click();
      expect(q(w, '#me-menu [data-me-item="board"]')).toBeTruthy();
      expect(q(w, '#me-menu [data-me-item="admin"]')).toBeTruthy();
      expect(q(w, "#me-menu .me-menu__head small").textContent).toBe("samuka · owner");
    }));
    it("nino gets the board but not admin", local(async function () {
      var w = await load("nino");
      w.SamukaAuth.open({ tab: "team" });
      expect(q(w, "#acct-panel [data-open-board]")).toBeTruthy();
      expect(q(w, "#acct-panel [data-open-admin]")).toBe(null);
      w.SamukaAuth.close();
      q(w, "[data-account]").click();
      expect(q(w, '#me-menu [data-me-item="admin"]')).toBe(null);
    }));
    it("the board button in the team tab opens the board and closes the window", local(async function () {
      var w = await load("nino");
      w.SamukaAuth.open({ tab: "team" });
      q(w, "#acct-panel [data-open-board]").click();
      await tick(10);
      expect(w.SamukaAuth.isOpen()).toBe(false);
      expect(q(w, ".kb") && !q(w, ".kb").hidden).toBe(true);
    }));
  });
})();
