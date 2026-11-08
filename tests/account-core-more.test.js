/* Unit tests: account-core.js, round two (ranks, streaks, your data, progress, palette) */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var C = window.SamukaAccountCore;
  function dom(html) { var d = document.createElement("div"); d.innerHTML = html; return d; }
  function texts(root, sel) { return Array.prototype.map.call(root.querySelectorAll(sel), function (e) { return e.textContent.trim(); }); }

  describe("account-core: ranks and streaks", function () {
    it("picks your best placing, breaking ties by the smallest gap", function () {
      expect(C.topRank({ gems: { rank: 3, of: 12, behind: 140 }, sidekiq: { rank: 1, of: 9, behind: 0 } })).toEqual({ key: "sidekiq", label: "Sidekiq Rush", rank: 1, of: 9, behind: 0 });
      expect(C.topRank({ gems: { rank: 2, of: 5, behind: 90 }, schema: { rank: 2, of: 8, behind: 10 } }).key).toBe("schema");
      expect(C.topRank({ nope: { rank: 1 }, gems: { rank: 0 } })).toBe(null);
      expect(C.topRank(null)).toBe(null);
    });
    it("describes a placing in words", function () {
      expect(C.rankLine({ rank: 1, of: 9, behind: 0 })).toBe("#1 of 9 · leading");
      expect(C.rankLine({ rank: 3, of: 12, behind: 1400 })).toBe("#3 of 12 · 1,400 pts behind #2");
      expect(C.rankLine({ rank: 2, of: 4, behind: 0 })).toBe("#2 of 4 · tied");
      expect(C.rankLine(null)).toBe("");
    });
    it("reads the streak, defaulting missing numbers to 0", function () {
      expect(C.streakOf({ streak: { current: 4, best: 9 } })).toEqual({ current: 4, best: 9 });
      expect(C.streakOf({ streak: {} })).toEqual({ current: 0, best: 0 });
      expect(C.streakOf({})).toBe(null);
      expect(C.streakOf(null)).toBe(null);
    });
    it("formats how long ago something happened", function () {
      var now = Date.parse("2026-11-08T12:00:00Z");
      expect(C.ago("2026-11-08T11:59:30Z", now)).toBe("just now");
      expect(C.ago("2026-11-08T11:15:00Z", now)).toBe("45m ago");
      expect(C.ago("2026-11-08T07:00:00Z", now)).toBe("5h ago");
      expect(C.ago("2026-11-05T12:00:00Z", now)).toBe("3d ago");
      expect(C.ago("2026-11-09T12:00:00Z", now)).toBe("just now");   // clock skew never goes negative
      expect(C.ago("not a date", now)).toBe("");
    });
    it("stats strip: rank beats best score, and a streak adds a fourth tile", function () {
      var d = dom(C.statsHtml({ ach: { n: 1, total: 2 }, card: { games: 3, best: { gems: 50 }, ranks: { gems: { rank: 2, of: 7, behind: 5 } }, streak: { current: 3, best: 4 } } }));
      expect(texts(d, ".acct__stat b")).toEqual(["1/2", "3", "#2", "🔥 3"]);
      expect(d.textContent).toContain("of 7 · Gem Match");
      expect(d.textContent).toContain("best 4");
      expect(d.querySelector("[data-daily]")).toBeTruthy();
      expect(d.querySelector('a[title="#2 of 7 · 5 pts behind #1"]')).toBeTruthy();
    });
    it("stats strip: no flame for a broken streak, best score when ranks are missing", function () {
      var d = dom(C.statsHtml({ ach: { n: 0, total: 2 }, card: { games: 1, best: { gems: 50 }, streak: { current: 0, best: 2 } } }));
      expect(texts(d, ".acct__stat b")).toEqual(["0/2", "1", "50", "0"]);
    });
    it("player card extras: ranks, streak and recent games", function () {
      var now = Date.parse("2026-11-08T12:00:00Z");
      var d = dom(C.cardExtrasHtml({
        ranks: { pitwall: { rank: 1, of: 3, behind: 0 }, gems: { rank: 4, of: 10, behind: 20 } },
        streak: { current: 1, best: 6 },
        recent: [{ game: "gems", score: 1234, mode: "daily", at: "2026-11-08T10:00:00Z" }, { game: "mystery", score: 5, mode: "free", at: "2026-11-01T12:00:00Z" }]
      }, now));
      expect(texts(d, ".pcard-ranks li span")).toEqual(["Gem Match", "Pit Wall"]);   // fixed game order
      expect(texts(d, ".pcard-ranks li b")).toEqual(["#4 of 10 · 20 pts behind #3", "#1 of 3 · leading"]);
      expect(d.querySelector(".pcard-streak").textContent).toBe("🔥 1 day now · best 6");
      expect(texts(d, ".pcard-recent time")).toEqual(["2h ago", "7d ago"]);
      expect(d.querySelector(".pcard-recent li small").textContent).toBe("daily");
      expect(d.querySelectorAll(".pcard-recent li")[1].textContent).toContain("mystery");
    });
    it("player card extras: nothing for an older server or no card", function () {
      expect(C.cardExtrasHtml({ best: {} })).toBe("");
      expect(C.cardExtrasHtml(null)).toBe("");
    });
    it("menu header shows the streak only when it is running", function () {
      expect(dom(C.menuHtml({ name: "a", role: "user", streak: 5 })).querySelector(".me-menu__head small").textContent).toBe("user · 🔥 5");
      expect(dom(C.menuHtml({ name: "a", role: "user", streak: 0 })).querySelector(".me-menu__head small").textContent).toBe("user");
    });
  });

  describe("account-core: your data", function () {
    it("offers download and delete to players", function () {
      var d = dom(C.dataHtml({ owner: false }));
      expect(d.querySelector('[data-me-act="export"]')).toBeTruthy();
      expect(d.querySelector('[data-me-act="delete"]')).toBeTruthy();
      expect(d.querySelector("[data-me-danger]")).toBeTruthy();
    });
    it("never offers delete to the owner", function () {
      var d = dom(C.dataHtml({ owner: true }));
      expect(d.querySelector('[data-me-act="export"]')).toBeTruthy();
      expect(d.querySelector('[data-me-act="delete"]')).toBe(null);
      expect(d.textContent).toContain("can't be deleted");
    });
    it("the confirm form starts disabled and escapes the name", function () {
      var d = dom(C.deleteConfirmHtml('<b>"x"</b>'));
      expect(d.querySelector("[type=submit]").disabled).toBe(true);
      expect(d.querySelector("code").textContent).toBe('<b>"x"</b>');
      expect(d.querySelector("b code")).toBe(null);
      expect(d.querySelector("form[data-me-delete] input[name=confirm]")).toBeTruthy();
    });
    it("confirmation must match the name (case and spaces forgiven)", function () {
      expect(C.confirmMatches("  NEO ", "neo")).toBe(true);
      expect(C.confirmMatches("neo1", "neo")).toBe(false);
      expect(C.confirmMatches("", "")).toBe(false);
      expect(C.confirmMatches(null, "neo")).toBe(false);
    });
    it("names the export file safely", function () {
      var d = new Date("2026-11-08T12:00:00Z");
      expect(C.exportFileName("dev one/..", d)).toBe("samuka-arcade-dev_one_..-2026-11-08.json");
      expect(C.exportFileName("", d)).toBe("samuka-arcade-me-2026-11-08.json");
    });
    it("guest fine print points to Settings instead of email", function () {
      var d = dom(C.guestHtml({}));
      expect(d.querySelector(".acct__fine").textContent).toContain("under Settings");
      expect(d.querySelector(".acct__fine a")).toBe(null);
    });
  });

  describe("account-core: achievement progress", function () {
    var LIST = [
      { key: "hello_world", icon: "👋", title: "Hello", how: "sign in" },
      { key: "retry_100", icon: "♻", title: "Retried 100 jobs", how: "retry" },
      { key: "gems_4000", icon: "💎", title: "Perfection", how: "4000" },
      { key: "vim", icon: "⌨", title: ":q!", how: "vim", secret: true }
    ];
    it("measures progress, capped at the goal", function () {
      expect(C.achProgress("retry_100", { retries: 63 })).toEqual({ cur: 63, max: 100, pct: 63 });
      expect(C.achProgress("gems_4000", { gems: 9000 })).toEqual({ cur: 4000, max: 4000, pct: 100 });
      expect(C.achProgress("gems_4000", {})).toEqual({ cur: 0, max: 4000, pct: 0 });
      expect(C.achProgress("hello_world", { retries: 5 })).toBe(null);
    });
    it("next up is the closest one with progress", function () {
      var has = function (k) { return k === "hello_world"; };
      var n = C.nextUp(LIST, has, { retries: 20, gems: 3000 });
      expect(n.ach.key).toBe("gems_4000");
      expect(n.prog.pct).toBe(75);
    });
    it("next up falls back to the first one left, never a secret", function () {
      expect(C.nextUp(LIST, function () { return false; }, {}).ach.key).toBe("hello_world");
      expect(C.nextUp(LIST, function (k) { return k !== "vim"; }, {})).toBe(null);
    });
    it("renders the hint with an accessible bar", function () {
      var d = dom(C.nextUpHtml({ ach: LIST[1], prog: { cur: 63, max: 100, pct: 63 } }));
      var bar = d.querySelector('[role="progressbar"]');
      expect(bar.getAttribute("aria-valuenow")).toBe("63");
      expect(bar.querySelector("i").style.width).toBe("63%");
      expect(d.textContent).toContain("63 / 100");
      expect(d.textContent).toContain("Retried 100 jobs");
      expect(dom(C.nextUpHtml(null)).textContent).toContain("Only secrets left");
    });
  });

  describe("account-core: command palette", function () {
    var games = [{ id: "gems", title: "gem-match.rb" }, { id: "pitwall", title: "pit-wall.rb" }, { id: "newgame", title: "new-game.rb" }];
    it("uses friendly game names, falling back to the arcade title", function () {
      var l = labels(C.paletteItems({ games: games }));
      expect(l).toContain("Play Gem Match");
      expect(l).toContain("Play new-game.rb");
      expect(l).not.toContain("Play gem-match.rb");
    });
    function labels(list) { return list.map(function (i) { return i.label; }); }
    it("guests get pages, games and sign in, but none of your stuff", function () {
      var l = labels(C.paletteItems({ enabled: true, signedIn: false, games: games }));
      expect(l).toContain("Leaderboards");
      expect(l).toContain("Play Pit Wall");
      expect(l).toContain("Sign in");
      expect(l).not.toContain("My player card");
      expect(l).not.toContain("Sign out");
    });
    it("no sign in when accounts are off", function () {
      expect(labels(C.paletteItems({ enabled: false, signedIn: false }))).not.toContain("Sign in");
    });
    it("players get their card (with their name) and settings; team tools follow the role", function () {
      var items = C.paletteItems({ enabled: true, signedIn: true, name: "neo x", role: "user", games: games });
      expect(items.filter(function (i) { return i.label === "My player card"; })[0].href).toBe("/u/?n=neo%20x");
      expect(labels(items)).toContain("Download my data");
      expect(labels(items)).not.toContain("Our board");
      var nino = labels(C.paletteItems({ enabled: true, signedIn: true, name: "n", role: "nino" }));
      expect(nino).toContain("Our board");
      expect(nino).not.toContain("Admin");
      expect(labels(C.paletteItems({ enabled: true, signedIn: true, name: "s", role: "samuka" }))).toContain("Admin");
    });
    it("ranks prefix matches over word, substring, keyword and subsequence matches", function () {
      var items = [{ label: "Pit Wall" }, { label: "Play Pit Wall" }, { label: "Leaderboards", kw: "scores" }, { label: "Appearance", kw: "theme" }, { label: "Spit" }];
      expect(labels(C.searchPalette(items, "pit"))).toEqual(["Pit Wall", "Play Pit Wall", "Spit"]);
      expect(labels(C.searchPalette(items, "theme"))).toEqual(["Appearance"]);
      expect(labels(C.searchPalette(items, "scor"))).toEqual(["Leaderboards"]);
      expect(labels(C.searchPalette(items, "ldb"))).toEqual(["Leaderboards"]);       // subsequence
      expect(labels(C.searchPalette(items, "  PIT  "))).toEqual(["Pit Wall", "Play Pit Wall", "Spit"]);
      expect(C.searchPalette(items, "zzz")).toEqual([]);
    });
    it("empty query lists everything in order, up to the limit", function () {
      var items = [{ label: "a" }, { label: "b" }, { label: "c" }];
      expect(labels(C.searchPalette(items, ""))).toEqual(["a", "b", "c"]);
      expect(labels(C.searchPalette(items, "", 2))).toEqual(["a", "b"]);
      expect(C.searchPalette(null, "a")).toEqual([]);
    });
  });
})();
