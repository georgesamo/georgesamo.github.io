/* Unit tests: assets/js/account-core.js (pure helpers and HTML builders) */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var C = window.SamukaAccountCore;
  function dom(html) { var d = document.createElement("div"); d.innerHTML = html; return d; }
  function texts(root, sel) { return Array.prototype.map.call(root.querySelectorAll(sel), function (e) { return e.textContent.trim(); }); }
  var LIST = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];

  describe("account-core: small rules", function () {
    it("escapes HTML special characters", function () {
      expect(C.esc('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
      expect(C.esc(null)).toBe("");
      expect(C.esc(0)).toBe("0");
    });
    it("formats numbers with thousands separators", function () {
      expect(C.fmt(2310)).toBe("2,310");
      expect(C.fmt(undefined)).toBe("0");
    });
    it("knows which roles are on the team", function () {
      expect(C.isTeam("samuka")).toBe(true);
      expect(C.isTeam("nino")).toBe(true);
      expect(C.isTeam("user")).toBe(false);
      expect(C.isTeam("guest")).toBe(false);
      expect(C.isTeam(undefined)).toBe(false);
    });
    it("labels roles and falls back to the raw role", function () {
      expect(C.roleLabel("samuka")).toBe("samuka · owner");
      expect(C.roleLabel("nino")).toBe("nino · PM");
      expect(C.roleLabel("wizard")).toBe("wizard");
      expect(C.roleLabel()).toBe("guest");
    });
    it("takes the upper-case initial, or ? when empty", function () {
      expect(C.initial("samuka")).toBe("S");
      expect(C.initial("  bob")).toBe("B");
      expect(C.initial("")).toBe("?");
      expect(C.initial(null)).toBe("?");
    });
    it("builds an encoded player card link", function () {
      expect(C.cardHref("dev one")).toBe("/u/?n=dev%20one");
      expect(C.cardHref("a&b")).toBe("/u/?n=a%26b");
      expect(C.cardHref()).toBe("/u/?n=");
    });
    it("recognises your own card page", function () {
      expect(C.isMyCard("/u/", "?n=bob", "bob")).toBe(true);
      expect(C.isMyCard("/u/", "", "bob")).toBe(true);          // bare /u/ redirects to your card
      expect(C.isMyCard("/u", "?n=", "bob")).toBe(true);
      expect(C.isMyCard("/u/", "?n=alice", "bob")).toBe(false);
      expect(C.isMyCard("/leaderboards/", "?n=bob", "bob")).toBe(false);
      expect(C.isMyCard("/u/", "?n=bob", "")).toBe(false);
    });
    it("cleans nicknames the way the database expects", function () {
      expect(C.cleanNickname("  Neo_99 ")).toBe("Neo_99");
      expect(C.cleanNickname("<script>")).toBe("script");
      expect(C.cleanNickname("ünï cødé!")).toBe("n cd");
      expect(C.cleanNickname("x".repeat(40))).toHaveLength(24);
      expect(C.cleanNickname(null)).toBe("");
      expect(C.cleanNickname("a.b-c d")).toBe("a.b-c d");
    });
    it("counts unlocked achievements", function () {
      expect(C.achCount(LIST, function (k) { return k === "a" || k === "c"; })).toEqual({ n: 2, total: 4 });
      expect(C.achCount(LIST)).toEqual({ n: 0, total: 4 });
      expect(C.achCount(null, function () { return true; })).toEqual({ n: 0, total: 0 });
    });
    it("picks the best game by score", function () {
      expect(C.bestGame({ gems: 100, sidekiq: 900, schema: 5 })).toEqual({ key: "sidekiq", label: "Sidekiq Rush", score: 900 });
      expect(C.bestGame({ pitwall: "12" })).toEqual({ key: "pitwall", label: "Pit Wall", score: 12 });
      expect(C.bestGame({ unknown: 9999 })).toBe(null);
      expect(C.bestGame({})).toBe(null);
      expect(C.bestGame(null)).toBe(null);
    });
    it("moves roving focus with arrows, Home and End", function () {
      expect(C.nextIndex(0, 3, "ArrowDown")).toBe(1);
      expect(C.nextIndex(2, 3, "ArrowDown")).toBe(0);          // wraps
      expect(C.nextIndex(0, 3, "ArrowUp")).toBe(2);
      expect(C.nextIndex(-1, 3, "ArrowDown")).toBe(0);         // nothing focused yet
      expect(C.nextIndex(1, 3, "Home")).toBe(0);
      expect(C.nextIndex(1, 3, "End")).toBe(2);
      expect(C.nextIndex(0, 3, "ArrowRight", true)).toBe(1);
      expect(C.nextIndex(0, 3, "ArrowLeft", true)).toBe(2);
      expect(C.nextIndex(0, 3, "ArrowRight")).toBe(-1);         // vertical menus ignore left/right
      expect(C.nextIndex(0, 3, "a")).toBe(-1);
      expect(C.nextIndex(0, 0, "ArrowDown")).toBe(-1);
    });
  });

  describe("account-core: tabs", function () {
    it("finds tab definitions by key", function () {
      expect(C.tabOf("badges").label).toBe("Badges");
      expect(C.tabOf("nope")).toBe(null);
    });
    it("routes extras to their tab, defaulting to settings, and survives broken ones", function () {
      var out = C.collectExtras([
        { fn: function () { return "<b>A</b>"; }, tab: "badges" },
        { fn: function () { return "<i>B</i>"; } },
        { fn: function () { return "<u>C</u>"; }, tab: "made-up" },
        { fn: function () { throw new Error("boom"); }, tab: "team" },
        { fn: function () { return ""; }, tab: "team" },
        { fn: function (s) { return s.role === "samuka" ? "admin" : ""; }, tab: "team" }
      ], { role: "user" });
      expect(out).toEqual({ badges: "<b>A</b>", settings: "<i>B</i><u>C</u>" });
      expect(C.collectExtras(null, {})).toEqual({});
    });
    it("shows core tabs always and optional tabs only when filled", function () {
      var keys = function (v) { return v.map(function (t) { return t.key; }); };
      expect(keys(C.visibleTabs({}))).toEqual(["profile", "appearance", "settings"]);
      expect(keys(C.visibleTabs({ badges: "x" }))).toEqual(["profile", "appearance", "settings", "badges"]);
      expect(keys(C.visibleTabs({ team: "x", badges: "y" }))).toEqual(["profile", "appearance", "settings", "badges", "team"]);
      expect(keys(C.visibleTabs())).toEqual(["profile", "appearance", "settings"]);
    });
    it("falls back to profile when the wanted tab is hidden", function () {
      var v = C.visibleTabs({});
      expect(C.pickTab("appearance", v)).toBe("appearance");
      expect(C.pickTab("team", v)).toBe("profile");
      expect(C.pickTab(undefined, v)).toBe("profile");
    });
    it("renders an accessible tablist with one selected, focusable tab", function () {
      var d = dom(C.tabsHtml(C.visibleTabs({ badges: "x" }), "appearance"));
      var tabs = d.querySelectorAll('[role="tab"]');
      expect(d.querySelector('[role="tablist"]')).toBeTruthy();
      expect(tabs.length).toBe(4);
      var sel = d.querySelectorAll('[aria-selected="true"]');
      expect(sel.length).toBe(1);
      expect(sel[0].getAttribute("data-acct-tab")).toBe("appearance");
      expect(sel[0].getAttribute("tabindex")).toBe("0");
      expect(d.querySelector('[data-acct-tab="profile"]').getAttribute("tabindex")).toBe("-1");
      expect(sel[0].getAttribute("aria-controls")).toBe("acct-panel");
      expect(sel[0].id).toBe("acct-tab-appearance");
    });
  });

  describe("account-core: panels", function () {
    var who = { name: "Samuka <3", publicName: "neo dev", email: "s@x.io", role: "samuka", nickname: 'ne"o', ach: { n: 3, total: 30 } };
    it("profile: shows identity, links to the card, and escapes user text", function () {
      var d = dom(C.profileHtml(who));
      expect(d.querySelector("h3").textContent).toBe("Samuka <3");
      expect(d.querySelector(".acct__avatar").textContent).toBe("S");
      expect(d.querySelector(".acct__badge").textContent).toBe("samuka · owner");
      expect(d.querySelector(".acct__badge").className).toContain("acct__badge--samuka");
      var links = Array.prototype.map.call(d.querySelectorAll("a[href]"), function (a) { return a.getAttribute("href"); });
      expect(links).toContain("/u/?n=neo%20dev");
      expect(links).toContain("/leaderboards/#me");
      expect(d.querySelector('input[name="nickname"]').value).toBe('ne"o');
      expect(d.querySelector('[data-me-act="copy"]')).toBeTruthy();
      expect(d.querySelectorAll("script").length).toBe(0);
    });
    it("stats: loading, empty and filled states", function () {
      var loading = dom(C.statsHtml({ ach: { n: 1, total: 4 } }));
      expect(texts(loading, ".acct__stat b")).toEqual(["1/4", "…", "…"]);
      var none = dom(C.statsHtml({ ach: { n: 0, total: 4 }, card: null }));
      expect(texts(none, ".acct__stat b")).toEqual(["0/4", "0", "–"]);
      expect(none.textContent).toContain("no scores yet");
      var full = dom(C.statsHtml({ ach: { n: 2, total: 4 }, card: { games: 1234, best: { gems: 2310, sidekiq: 50 } }, cardHref: "/u/?n=x" }));
      expect(texts(full, ".acct__stat b")).toEqual(["2/4", "1,234", "2,310"]);
      expect(full.textContent).toContain("best · Gem Match");
      expect(full.querySelector('[data-me-act="badges"]')).toBeTruthy();
      expect(full.querySelector('a[href="/u/?n=x"]')).toBeTruthy();
      expect(full.querySelector("[data-me-stats]")).toBeTruthy();
    });
    it("appearance: checks the current mode and skin", function () {
      var d = dom(C.appearanceHtml({ mode: "light", skin: "knight", skins: ["phthalo", "knight"] }));
      expect(d.querySelector('input[name="mode"]:checked').value).toBe("light");
      expect(d.querySelector('input[name="skin"]:checked').value).toBe("knight");
      expect(d.querySelectorAll('input[name="skin"]').length).toBe(2);
      expect(d.querySelector(".acct__theme--knight b").textContent).toBe("Dark Knight");
      expect(d.querySelector(".acct__hint")).toBe(null);
    });
    it("appearance: hints at the hidden skin only while it is locked", function () {
      expect(dom(C.appearanceHtml({ mode: "dark", skin: "phthalo", skins: ["phthalo"], secretLeft: true })).querySelector(".acct__hint")).toBeTruthy();
      expect(dom(C.appearanceHtml({ mode: "dark", skin: "crt", skins: ["phthalo", "crt"], secretLeft: false })).querySelector(".acct__hint")).toBe(null);
    });
    it("settings: reflects the glitch preference", function () {
      expect(dom(C.settingsHtml({ glitches: true })).querySelector('input[name="glitches"]').checked).toBe(true);
      expect(dom(C.settingsHtml({ glitches: false })).querySelector('input[name="glitches"]').checked).toBe(false);
      expect(dom(C.settingsHtml({})).querySelector("[data-acct-glitch]")).toBeTruthy();
    });
    it("footer: sign out, plus a note in local test sessions", function () {
      expect(dom(C.footerHtml({})).querySelector("[data-acct-out]")).toBeTruthy();
      expect(dom(C.footerHtml({ mock: true })).textContent).toContain("local test session");
      expect(dom(C.footerHtml()).textContent).not.toContain("local test session");
    });
    it("guest: lists the perks, the email form and GitHub only when enabled", function () {
      var d = dom(C.guestHtml({ github: false }));
      expect(d.querySelectorAll(".acct__perks li").length).toBe(5);
      expect(d.querySelector("form[data-acct-email] input[type=email]")).toBeTruthy();
      expect(d.querySelector("[data-acct-github]")).toBe(null);
      expect(d.querySelector(".acct__notice")).toBe(null);
      var g = dom(C.guestHtml({ github: true, notice: "<b>locked</b>" }));
      expect(g.querySelector("[data-acct-github] svg path")).toBeTruthy();
      expect(g.querySelector(".acct__notice b").textContent).toBe("locked");
    });
  });

  describe("account-core: avatar menu", function () {
    function keys(c) { return C.menuItems(c).map(function (i) { return i.key; }); }
    it("gives every player their card, ranks, badges, appearance, settings and sign out", function () {
      expect(keys({ name: "bob", role: "user" })).toEqual(["card", "ranks", "badges", "appearance", "profile", "signout"]);
    });
    it("adds the board for the team and admin only for the owner", function () {
      expect(keys({ name: "n", role: "nino" })).toEqual(["card", "ranks", "badges", "appearance", "profile", "board", "signout"]);
      expect(keys({ name: "s", role: "samuka" })).toEqual(["card", "ranks", "badges", "appearance", "profile", "board", "admin", "signout"]);
    });
    it("shows the badge count as a hint", function () {
      var b = C.menuItems({ name: "x", role: "user", ach: { n: 4, total: 30 } }).filter(function (i) { return i.key === "badges"; })[0];
      expect(b.hint).toBe("4/30");
    });
    it("renders links for pages, buttons for actions, and separators between groups", function () {
      var d = dom(C.menuHtml({ name: "a b", role: "samuka", ach: { n: 1, total: 2 } }));
      var items = d.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBe(8);
      expect(d.querySelector('[data-me-item="card"]').tagName).toBe("A");
      expect(d.querySelector('[data-me-item="card"]').getAttribute("href")).toBe("/u/?n=a%20b");
      expect(d.querySelector('[data-me-item="ranks"]').getAttribute("href")).toBe("/leaderboards/#me");
      expect(d.querySelector('[data-me-item="badges"]').getAttribute("data-me-act")).toBe("badges");
      expect(d.querySelector('[data-me-item="signout"]').getAttribute("data-me-act")).toBe("signout");
      expect(d.querySelectorAll(".me-menu__sep").length).toBe(2);   // before team, before sign out
      Array.prototype.forEach.call(items, function (el) { expect(el.getAttribute("tabindex")).toBe("-1"); });
      expect(d.querySelector(".me-menu__head b").textContent).toBe("a b");
    });
    it("escapes the name in the menu header", function () {
      var d = dom(C.menuHtml({ name: "<img src=x onerror=1>", role: "user" }));
      expect(d.querySelector("img")).toBe(null);
      expect(d.querySelector(".me-menu__head b").textContent).toBe("<img src=x onerror=1>");
    });
  });

  describe("account-core: sidebar folder and phone sheet", function () {
    it("renders nothing when accounts are off", function () {
      expect(C.treeHtml({ enabled: false, signedIn: true, name: "x" })).toBe("");
      expect(C.sheetHtml({ enabled: false })).toBe("");
    });
    it("folds and unfolds sidebar folders", function () {
      expect(C.toggleFolder("", "arcade")).toBe("arcade");
      expect(C.toggleFolder("arcade", "about")).toBe("arcade about");
      expect(C.toggleFolder("arcade about", "arcade")).toBe("about");
      expect(C.toggleFolder("  arcade   about ", "about")).toBe("arcade");
      expect(C.toggleFolder(null, "team")).toBe("team");
      expect(C.toggleFolder("arcade", "")).toBe("arcade");
    });
    it("invites guests to sign in", function () {
      var t = dom(C.treeHtml({ enabled: true, signedIn: false }));
      expect(t.querySelector('[data-me-act="signin"]')).toBeTruthy();
      expect(t.querySelectorAll("a").length).toBe(0);
      expect(dom(C.sheetHtml({ enabled: true, signedIn: false })).querySelector('[data-me-act="signin"]')).toBeTruthy();
    });
    it("is a single compact row: avatar, name and badges, linking to your card", function () {
      var t = dom(C.treeHtml({ enabled: true, signedIn: true, name: "neo", ach: { n: 5, total: 30 } }));
      expect(t.children.length).toBe(1);
      var row = t.querySelector("a.tree__who");
      expect(row.getAttribute("href")).toBe("/u/?n=neo");
      expect(row.querySelector(".acct__avatar").textContent).toBe("N");
      expect(row.querySelector(".tree__who-name").textContent).toBe("neo");
      expect(row.querySelector("small").textContent).toBe("5/30");
      expect(t.querySelector(".is-here")).toBe(null);
    });
    it("escapes the name in the sidebar row", function () {
      var t = dom(C.treeHtml({ enabled: true, signedIn: true, name: "<i>x</i>" }));
      expect(t.querySelector("i")).toBe(null);
      expect(t.querySelector(".tree__who-name").textContent).toBe("<i>x</i>");
    });
    it("marks your card as the current page", function () {
      var t = dom(C.treeHtml({ enabled: true, signedIn: true, name: "neo", here: "card" }));
      expect(t.querySelector('a.is-here').getAttribute("href")).toBe("/u/?n=neo");
    });
    it("phone sheet: who you are plus four shortcuts", function () {
      var s = dom(C.sheetHtml({ enabled: true, signedIn: true, name: "neo", role: "nino", ach: { n: 2, total: 9 } }));
      expect(s.querySelector(".msheet__who b").textContent).toBe("neo");
      expect(s.querySelector(".msheet__who small").textContent).toBe("nino · PM · 2/9 badges");
      expect(s.querySelectorAll(".msheet__quick > *").length).toBe(4);
      expect(s.querySelector('.msheet__quick a[href="/u/?n=neo"]')).toBeTruthy();
      expect(s.querySelector('.msheet__quick [data-me-act="profile"]')).toBeTruthy();
    });
  });
})();
