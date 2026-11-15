/* Tests: the weekly tournament (assets/js/tournament.js), its trophies on cards (account-core.js)
 * and the arcade rules it relies on (arcade.js: sign-in gate). Nothing here talks to Supabase:
 * the backend is swapped for a fake. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var TT = window.SamukaTournament, Ar = window.SamukaArcade, C = window.SamukaAccountCore;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var U = Date.UTC;

  // a signed-in (or signed-out) SamukaAuth for one test, put back afterwards
  function withAuth(signedIn, fn) {
    var was = window.SamukaAuth, opened = [];
    window.SamukaAuth = {
      enabled: true, user: function () { return signedIn ? { id: "u1" } : null; }, mock: function () { return null; },
      role: function () { return "user"; }, publicName: function () { return "neo"; }, client: function () { return null; },
      open: function (o) { opened.push(o); }
    };
    var done = function () { window.SamukaAuth = was; };
    try { var r = fn(opened); if (r && r.then) return r.then(function (v) { done(); return v; }, function (e) { done(); throw e; }); done(); return r; }
    catch (e) { done(); throw e; }
  }
  // the arcade's open() replaced by a spy for one test
  function spyOpen(fn) {
    var was = Ar.open, calls = [];
    Ar.open = function (id, opts) { calls.push({ id: id, opts: opts }); return true; };
    var done = function () { Ar.open = was; };
    try { var r = fn(calls); if (r && r.then) return r.then(function (v) { done(); return v; }, function (e) { done(); throw e; }); done(); return r; }
    catch (e) { done(); throw e; }
  }
  // a game-over card for tournament.js to write its line into
  function fakeOverlay() {
    var d = document.createElement("div");
    d.className = "arcade t-tour";
    d.innerHTML = '<div class="arcade__overlay"><div class="arcade__card"><h3>game over</h3></div></div>';
    document.getElementById("sandbox").appendChild(d);
    return d;
  }
  function over(game, score, seed, extra) {
    var d = { game: game, name: "over", mode: "tournament", score: score, seed: seed };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    window.dispatchEvent(new CustomEvent("samuka:game", { detail: d }));
  }
  function closed(game) { window.dispatchEvent(new CustomEvent("samuka:game", { detail: { game: game, name: "closed" } })); }

  describe("weekly tournament · the week (ISO 8601, UTC)", function () {
    it("names the week and its Monday-to-Monday bounds", function () {
      var w = TT.weekOf(U(2026, 10, 12, 15));
      expect(w.key).toBe("2026-W46");
      expect(w.start).toBe(U(2026, 10, 9));
      expect(w.end).toBe(U(2026, 10, 16));
    });
    it("ends at Sunday midnight UTC, whatever the local zone", function () {
      expect(TT.weekOf(U(2026, 10, 15, 23, 59, 59)).key).toBe("2026-W46");
      expect(TT.weekOf(U(2026, 10, 16, 0, 0, 0)).key).toBe("2026-W47");
      expect(TT.weekOf(U(2026, 10, 9, 0, 0, 0)).key).toBe("2026-W46");
    });
    it("handles the weeks around New Year like Postgres's IYYY-IW", function () {
      expect(TT.weekOf(U(2026, 0, 1)).key).toBe("2026-W01");    // Thursday
      expect(TT.weekOf(U(2026, 11, 31)).key).toBe("2026-W53");  // 2026 has 53 weeks
      expect(TT.weekOf(U(2027, 0, 3)).key).toBe("2026-W53");    // Sunday: still the old year's week
      expect(TT.weekOf(U(2027, 0, 4)).key).toBe("2027-W01");
      expect(TT.weekOf(U(2024, 11, 30)).key).toBe("2025-W01");  // Monday in December, next year's week 1
      expect(TT.weekOf(U(2021, 0, 3)).key).toBe("2020-W53");
    });
    it("steps back to the week before", function () {
      expect(TT.prevWeek(U(2026, 10, 12)).key).toBe("2026-W45");
      expect(TT.prevWeek(U(2027, 0, 5)).key).toBe("2026-W53");
    });
    it("says how long is left", function () {
      expect(TT.timeLeft(U(2026, 10, 15, 21, 30))).toBe("2 h 30 min");
      expect(TT.timeLeft(U(2026, 10, 9))).toBe("7 d 0 h");
      expect(TT.timeLeft(U(2026, 10, 13, 10))).toBe("2 d 14 h");
      expect(TT.timeLeft(U(2026, 10, 15, 23, 59, 30))).toBe("1 min");
    });
    it("labels a week for people", function () {
      expect(TT.weekLabel("2026-W46")).toBe("Week 46, 2026");
      expect(TT.weekLabel("2027-W01")).toBe("Week 1, 2027");
    });
  });

  describe("weekly tournament · seeds", function () {
    it("give one board per game per week", function () {
      expect(TT.seedFor("gems", "2026-W46")).toBe("gems-tournament-2026-W46");
      expect(TT.seedFor("gems", "2026-W46")).not.toBe(TT.seedFor("sidekiq", "2026-W46"));
      expect(TT.seedFor("gems", "2026-W46")).not.toBe(TT.seedFor("gems", "2026-W47"));
    });
    it("are valid challenge seeds, so a tournament run can be sent as a challenge", function () {
      expect(/^[\w.:-]{1,64}$/.test(TT.seedFor("pitwall", "2026-W46"))).toBe(true);
    });
    it("make the same random numbers for everyone", function () {
      var a = Ar.seeded(TT.seedFor("gems", "2026-W46")), b = Ar.seeded(TT.seedFor("gems", "2026-W46")), c = Ar.seeded(TT.seedFor("gems", "2026-W47"));
      var sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
      expect(sa).toEqual(sb);
      expect(sa).not.toBe(sc);
      expect(JSON.stringify(sa) === JSON.stringify(sc)).toBe(false);
    });
  });

  describe("weekly tournament · games", function () {
    it("cover every game the arcade has, not a fixed list", function () {
      var ids = TT.games().map(function (g) { return g.id; }).sort();
      var all = Ar.list().map(function (g) { return g.id; }).sort();
      expect(ids).toEqual(all);
      TT.games().forEach(function (g) { expect(g.name.length > 0).toBe(true); });
    });
    it("take names and icons from _data/games.yml when the page has it, in its order", function () {
      var ids = Ar.list().map(function (g) { return g.id; });
      var el = document.createElement("script");
      el.type = "application/json"; el.setAttribute("data-tourney-games", "");
      el.textContent = JSON.stringify([{ id: ids[ids.length - 1], name: "Named Game", icon: "🧪" }, { id: "not-in-arcade", name: "Ghost", icon: "👻" }]);
      document.getElementById("sandbox").appendChild(el);
      try {
        var gs = TT.games();
        expect(gs[0]).toEqual({ id: ids[ids.length - 1], name: "Named Game", icon: "🧪" });
        expect(gs.map(function (g) { return g.id; })).not.toContain("not-in-arcade");
        expect(gs.length).toBe(ids.length);
      } finally { el.remove(); }
    });
  });

  describe("weekly tournament · standings", function () {
    var rows = [
      { name: "a", role: "user", game: "gems", score: 900, at: 3 },
      { name: "a", role: "user", game: "gems", score: 1500, at: 5 },
      { name: "b", role: "nino", game: "gems", score: 1500, at: 4 },
      { name: "me", role: "user", game: "gems", score: 700, at: 6, mine: true },
      { name: "me", role: "user", game: "pitwall", score: 40, at: 7, mine: true }
    ];
    it("keep each player's best run, ties sharing a rank with the earlier run first", function () {
      var s = TT.standingsFrom(rows, "2026-W46", true, 10);
      expect(s.players).toBe(3);
      expect(s.games.gems.map(function (r) { return r.name + ":" + r.rank + ":" + r.score; })).toEqual(["b:1:1500", "a:1:1500", "me:3:700"]);
      expect(s.mine).toEqual({ gems: { rank: 3, score: 700, of: 3 }, pitwall: { rank: 1, score: 40, of: 1 } });
      expect(s.games.gems[2].me).toBe(true);
    });
    it("cut each board at the limit but still know your place", function () {
      var s = TT.standingsFrom(rows, "2026-W46", true, 1);
      expect(s.games.gems.length).toBe(1);
      expect(s.mine.gems.rank).toBe(3);
    });
  });

  describe("weekly tournament · playing", function () {
    it("needs an account, like the daily", function () {
      return withAuth(false, function (opened) {
        return spyOpen(function (calls) {
          expect(TT.play("gems")).toBe(false);
          expect(calls.length).toBe(0);
          expect(opened.length).toBe(1);
        });
      });
    });
    it("the arcade itself refuses a signed-out tournament run", function () {
      return withAuth(false, function (opened) {
        window.SamukaGameSrc = window.SamukaGameSrc || {};
        window.SamukaGameSrc["t-tour"] = { src: "fixtures/lazy-game.js", title: "t-tour.rb", blurb: "b" };
        try {
          expect(Ar.open("t-tour", { mode: "tournament", seed: "t-tour-tournament-2026-W46" })).toBe(false);
          expect(Ar.isOpen()).toBe(false);
          expect(opened.length).toBe(1);
        } finally { delete window.SamukaGameSrc["t-tour"]; }
      });
    });
    it("opens this week's board and counts the play", function () {
      return withAuth(true, function () {
        return spyOpen(function (calls) {
          window.__samukaTracked = [];
          expect(TT.play("gems")).toBe(true);
          var key = TT.weekOf().key;
          expect(calls[0].id).toBe("gems");
          expect(calls[0].opts.mode).toBe("tournament");
          expect(calls[0].opts.seed).toBe("gems-tournament-" + key);
          expect(calls[0].opts.length).toBe("full");
          expect(window.__samukaTracked).toContain("tournament:play:gems");
          closed("gems");
        });
      });
    });
    it("saves a finished run and shows your best and place", async function () {
      var saved = [], ov = fakeOverlay(), key = TT.weekOf().key;
      TT._setBackend({
        save: function (g, w, s) { saved.push([g, w, s]); return Promise.resolve(true); },
        standings: function () { return Promise.resolve({ games: {}, mine: { gems: { rank: 2, score: 1800, of: 5 } }, players: 5 }); },
        winners: function () { return Promise.resolve([]); }, trophies: function () { return Promise.resolve([]); }
      });
      try {
        await withAuth(true, function () {
          return spyOpen(async function () {
            TT.play("gems");
            over("gems", 1200, "gems-tournament-" + key);
            await wait(250);
          });
        });
        expect(saved).toEqual([["gems", key, 1200]]);
        var out = ov.querySelector(".tourney-out");
        expect(!!out).toBe(true);
        expect(out.textContent).toContain("Your best this week: 1,800");
        expect(out.textContent).toContain("#2 of 5");
      } finally { closed("gems"); TT._setBackend(null); ov.remove(); }
    });
    it("doesn't save a run on another board, a zero, or a Pit Wall race that isn't the full quick race", async function () {
      var saved = [], ov = fakeOverlay(), key = TT.weekOf().key;
      TT._setBackend({ save: function (g, w, s) { saved.push(s); return Promise.resolve(true); }, standings: function () { return Promise.resolve({ mine: {} }); } });
      try {
        await withAuth(true, function () {
          return spyOpen(async function () {
            TT.play("gems");
            over("gems", 500, "gems-abc123");   // not this week's board
            over("gems", 0, "gems-tournament-" + key);
            await wait(150);
            expect(ov.querySelector(".tourney-out").textContent).toContain("A zero doesn't go on the board.");
            closed("gems");
            TT.play("pitwall");
            over("pitwall", 300, "pitwall-tournament-" + key, { kind: "gp", length: "full" });
            await wait(150);
            expect(ov.querySelector(".tourney-out").textContent).toContain("Only the full quick race counts");
            over("pitwall", 300, "pitwall-tournament-" + key, { kind: "quick", length: "sprint" });
          });
        });
        expect(saved).toEqual([]);
      } finally { closed("pitwall"); TT._setBackend(null); ov.remove(); }
    });
    it("says so when a run couldn't be saved", function () {
      var html = TT.resultHtml({ saved: false, why: "The week ended while you played. A new board is up.", left: "1 min", gameName: "Gem Match" });
      expect(html).toContain("This run wasn't saved.");
      expect(html).toContain("The week ended while you played");
      expect(html).toContain('href="/leaderboards/tournament/"');
    });
  });

  describe("weekly tournament · the page", function () {
    var gs = [{ id: "gems", name: "Gem Match", icon: "💎" }, { id: "pitwall", name: "Pit Wall", icon: "🏁" }];
    var NOW = U(2026, 10, 12, 15);
    it("shows every game's standings with a play button and your place", function () {
      var html = TT.pageHtml({ players: 3, games: { gems: [{ rank: 1, name: "rubyist", role: "user", score: 4210, me: false }, { rank: 2, name: "neo", role: "user", score: 1200, me: true }] }, mine: { gems: { rank: 2, score: 1200, of: 3 } } }, [], gs, NOW);
      expect(html).toContain('data-tourney-play="gems"');
      expect(html).toContain('data-tourney-play="pitwall"');
      expect(html).toContain("Week 46, 2026");
      expect(html).toContain("3 d 9 h");
      expect(html).toContain("#2 of 3");
      expect(html).toContain("No runs yet");   // Pit Wall
      expect(html).toContain("<b>3</b> players so far");
    });
    it("lists last week's winners, one per game", function () {
      var html = TT.pageHtml(null, [{ week: "2026-W45", game: "gems", name: "pm-nino", role: "nino", score: 5100, players: 4, me: false }, { week: "2026-W45", game: "pitwall", name: "neo", role: "user", score: 90, players: 1, me: true }], gs, NOW);
      expect(html).toContain("Last week's winners");
      expect(html).toContain("Week 45, 2026");
      expect(html).toContain("pm-nino");
      expect(html.match(/<li class="tourney-champ/g).length).toBe(2);
      expect(html).toContain("tourney-champ is-me");
    });
    it("says when nobody won last week", function () {
      expect(TT.pageHtml(null, [], gs, NOW)).toContain("No winners yet");
    });
    it("escapes player names", function () {
      var html = TT.pageHtml({ games: { gems: [{ rank: 1, name: "<img src=x onerror=alert(1)>", role: "user", score: 1 }] }, mine: {} }, [{ week: "2026-W45", game: "gems", name: "<b>x</b>", score: 1 }], gs, NOW);
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<b>x</b>");
    });
    it("the lobby card counts down and links to the page", function () {
      var html = TT.cardHtml({ players: 1 }, NOW);
      expect(html).toContain("ends in");
      expect(html).toContain('href="/leaderboards/tournament/"');
      expect(html).toContain("1 player so far");
    });
  });

  describe("weekly tournament · trophies", function () {
    var card = { name: "neo", trophies: [{ week: "2026-W45", game: "gems", score: 5100, players: 4 }, { week: "2026-W44", game: "pitwall", score: 90, players: 1 }, { week: "bad", game: "gems" }] };
    it("list a player's wins on their card, newest first", function () {
      expect(C.trophiesOf(card).length).toBe(2);
      var html = C.cardExtrasHtml(card);
      expect(html).toContain("weekly tournament");
      expect(html).toContain("2 wins");
      expect(html).toContain("week 45, 2026");
      expect(html).toContain("5,100");
      expect(html.indexOf("Gem Match")).toBeGreaterThan(-1);
    });
    it("name a game the account core doesn't know yet", function () {
      expect(C.trophiesHtml({ trophies: [{ week: "2026-W45", game: "regex_golf", score: 3 }] })).toContain("Regex Golf");
    });
    it("show a 🏆 stat in the account window only for winners", function () {
      expect(C.statsHtml({ ach: { n: 1, total: 9 }, card: card })).toContain("🏆 2");
      expect(C.statsHtml({ ach: { n: 1, total: 9 }, card: card })).toContain("tournament wins");
      expect(C.statsHtml({ ach: { n: 1, total: 9 }, card: { games: 3 } })).not.toContain("🏆");
      expect(C.cardExtrasHtml({ games: 3 })).not.toContain("weekly tournament");
    });
    it("are added to a card from the backend, and never break it", async function () {
      TT._setBackend({ trophies: function (n) { return Promise.resolve(n === "neo" ? [{ week: "2026-W45", game: "gems", score: 1 }] : []); } });
      try {
        var c = await TT.withTrophies({ name: "neo" });
        expect(c.trophies.length).toBe(1);
        TT._setBackend({ trophies: function () { return Promise.reject(new Error("no function")); } });
        c = await TT.withTrophies({ name: "neo" });
        expect(c.trophies).toEqual([]);
        expect(await TT.withTrophies(null)).toBe(null);
      } finally { TT._setBackend(null); }
    });
    it("the local test backend gives the mock player last week's trophy and keeps runs on this device", async function () {
      var M = TT.mockBackend, key = TT.weekOf().key, was = localStorage.getItem("samuka-mock-tournament");
      try {
        localStorage.removeItem("samuka-mock-tournament");
        var wins = await M.winners(1);
        expect(wins.length).toBe(TT.games().length);
        wins.forEach(function (w) { expect(w.week).toBe(TT.prevWeek().key); });
        expect(await M.save("gems", "1999-W01", 10)).toBe(false);   // not this week
        expect(await M.save("gems", key, 10)).toBe(true);
      } finally { if (was == null) localStorage.removeItem("samuka-mock-tournament"); else localStorage.setItem("samuka-mock-tournament", was); }
    });
  });
})();
