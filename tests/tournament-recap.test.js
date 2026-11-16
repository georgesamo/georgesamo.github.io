/* Tests: last week's tournament in the weekly recap (recap.js) and the "you won last week" toast
 * (tournament.js). The backend is a fake; nothing here talks to Supabase. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var TT = window.SamukaTournament, R = window.SamukaRecap;
  var GS = [{ id: "gems", name: "Gem Match", icon: "💎" }, { id: "sidekiq", name: "Sidekiq Rush", icon: "⚙️" }, { id: "pitwall", name: "Pit Wall", icon: "🏎" }];
  // tournament_standings(last week, 1)
  var S = {
    week: "2026-W45", current: false, players: 4,
    games: {
      gems: [{ rank: 1, name: "neo", role: "user", score: 5400, me: true }],
      pitwall: [{ rank: 1, name: "rubyist", role: "user", score: 81, me: false }],
      dephell: [{ rank: 1, name: "pm-nino", role: "nino", score: 300, me: false }]
    },
    mine: { gems: { rank: 1, score: 5400, of: 3 }, pitwall: { rank: 2, score: 60, of: 2 } }
  };

  function withAuth(u, fn) {
    var was = window.SamukaAuth;
    window.SamukaAuth = { enabled: true, user: function () { return u; }, mock: function () { return null; },
      role: function () { return "user"; }, publicName: function () { return "neo"; }, client: function () { return null; }, open: function () {} };
    var done = function () { window.SamukaAuth = was; };
    return Promise.resolve().then(fn).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  function withBackend(standings, fn) {
    var calls = [];
    TT._setBackend({ standings: function (w, n) { calls.push([w, n]); return typeof standings === "function" ? standings() : Promise.resolve(standings); } });
    var done = function () { TT._setBackend(null); };
    return Promise.resolve().then(function () { return fn(calls); }).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  function withTrack(fn) {
    var was = window.SamukaTrack, got = [];
    window.SamukaTrack = function (n) { got.push(n); };
    var done = function () { window.SamukaTrack = was; };
    return Promise.resolve().then(function () { return fn(got); }).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  function clean(uid) {
    try { localStorage.removeItem(TT._winKey({ id: uid })); } catch (e) {}
    document.querySelectorAll(".tourney-toast, .ach-toast").forEach(function (el) { el.remove(); });
  }
  var toasts = function () { return document.querySelectorAll(".tourney-toast"); };

  describe("tournament recap · last week's results", function () {
    it("list each game's winner in the arcade's order, with your place", function () {
      var lw = TT.lastWeekFrom(S, GS, "2026-W45");
      expect(lw.week).toBe("2026-W45");
      expect(lw.games.map(function (g) { return g.id + ":" + g.winner; })).toEqual(["gems:neo", "pitwall:rubyist", "dephell:pm-nino"]);
      expect(lw.games[0]).toEqual({ id: "gems", name: "Gem Match", icon: "💎", winner: "neo", role: "user", score: 5400, me: true, place: { rank: 1, of: 3, score: 5400 } });
      expect(lw.games[1].me).toBe(false);
      expect(lw.games[1].place).toEqual({ rank: 2, of: 2, score: 60 });
      expect(lw.games[2].place).toBe(null);
      expect(lw.played).toBe(true);
    });
    it("name a game the page doesn't know from its id, and skip games nobody played", function () {
      var lw = TT.lastWeekFrom(S, GS, "2026-W45");
      expect(lw.games[2].name).toBe("Dephell");
      expect(lw.games.map(function (g) { return g.id; })).not.toContain("sidekiq");
    });
    it("are empty when nobody played, and not played when you didn't", function () {
      var lw = TT.lastWeekFrom({ week: "2026-W45", games: {}, mine: {} }, GS, "2026-W45");
      expect(lw.games).toHaveLength(0);
      expect(lw.played).toBe(false);
      expect(TT.lastWeekFrom(null, GS, "2026-W45").week).toBe("2026-W45");
    });
    it("ask the server for last week's top row only", function () {
      return withBackend(S, function (calls) {
        return TT.lastWeek().then(function (lw) {
          expect(calls).toEqual([[TT.prevWeek().key, 1]]);
          expect(lw.games.length).toBe(3);
        });
      });
    });
  });

  describe("tournament recap · the recap card", function () {
    var NOW = new Date(2026, 10, 12, 15, 0).getTime();
    function model(over) {
      var c = { now: NOW, scores: [], badges: [], tracks: [], streak: null, names: {}, tourney: TT.lastWeekFrom(S, GS, "2026-W45"), signedIn: true };
      Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
      return R.build(c);
    }
    it("adds last week's winners under the week, with your placing", function () {
      var h = R.html(model({ scores: [{ game: "gems", score: 10, t: NOW - 3600e3 }] }));
      expect(h).toContain("Last week's tournament · Week 45");
      expect(h).toContain("won by <a href=\"/u/?n=rubyist\">rubyist</a>");
      expect(h).toContain("you won it");
      expect(h).toContain("you: #2 of 2 · 60");
      expect(h).toContain('href="/leaderboards/tournament/"');
      expect(h.indexOf("recap__stats") < h.indexOf("data-recap-tourney")).toBe(true);
    });
    it("shows it under the nudge when nothing's played yet this week", function () {
      var h = R.html(model());
      expect(h).toContain("Nothing played yet this week");
      expect(h).toContain("data-recap-tourney");
    });
    it("says so gracefully when nobody played last week", function () {
      var h = R.html(model({ tourney: { week: "2026-W45", games: [], played: false } }));
      expect(h).toContain("Nobody played last week's tournament");
      expect(h).toContain("This week's boards");
    });
    it("tells a signed-in player who sat it out, but not a guest", function () {
      var t = TT.lastWeekFrom({ week: "2026-W45", games: S.games, mine: {} }, GS, "2026-W45");
      expect(R.html(model({ tourney: t }))).toContain("You didn't play last week");
      expect(R.html(model({ tourney: t, signedIn: false }))).not.toContain("You didn't play");
    });
    it("never shows a guest a win or a place", function () {
      var h = R.html(model({ signedIn: false }));
      expect(h).not.toContain("you won it");
      expect(h).not.toContain("you: #");
      expect(h).toContain("won by");
    });
    it("leaves the section out when the tournament can't be reached", function () {
      var m = model({ tourney: null });
      expect(m.tourney).toBe(null);
      expect(R.html(m)).not.toContain("tournament");
    });
    it("escapes winners' names", function () {
      var t = TT.lastWeekFrom({ week: "2026-W45", games: { gems: [{ rank: 1, name: "<img onerror=x>", score: 9 }] }, mine: {} }, GS, "2026-W45");
      var h = R.tourneyHtml(R.build({ now: NOW, tourney: t }).tourney);
      expect(h).not.toContain("<img");
      expect(h).toContain("&lt;img");
    });
  });

  describe("tournament recap · winner toast", function () {
    it("reads like an achievement and links to the standings", function () {
      var one = TT.winToastHtml([{ name: "Gem Match", score: 5400 }], "2026-W45");
      expect(one).toContain("ach-toast__icon");
      expect(one).toContain("you won Week 45, 2026");
      expect(one).toContain("Gem Match · 5,400");
      expect(one).toContain('href="/leaderboards/tournament/"');
      expect(TT.winToastHtml([{ name: "Gem Match", score: 1 }, { name: "Pit Wall", score: 2 }], "2026-W45")).toContain("2 games · Gem Match, Pit Wall");
    });
    it("shows once per week to a signed-in winner, and tracks it", function () {
      clean("t-win");
      return withTrack(function (got) {
        return withAuth({ id: "t-win" }, function () {
          // last week's results, whatever today is (a fixed week here failed every test run from the week after next)
          return withBackend(Object.assign({}, S, { week: TT.prevWeek().key }), function (calls) {
            return TT.checkWin().then(function (shown) {
              expect(shown).toBe(true);
              expect(toasts().length).toBe(1);
              expect(toasts()[0].textContent).toContain("you won " + TT.weekLabel(TT.prevWeek().key));
              expect(got).toContain("tournament:win-toast");
              expect(localStorage.getItem(TT._winKey({ id: "t-win" }))).toBe(TT.weekOf().key);
              return TT.checkWin();
            }).then(function (again) {
              expect(again).toBe(false);
              expect(calls.length).toBe(1);   // no second lookup this week
              expect(toasts().length).toBe(1);
            });
          });
        });
      }).then(function () { clean("t-win"); }, function (e) { clean("t-win"); throw e; });
    });
    it("is per account: another player on the same device still gets theirs", function () {
      clean("t-a"); clean("t-b");
      localStorage.setItem(TT._winKey({ id: "t-a" }), TT.weekOf().key);
      return withAuth({ id: "t-b" }, function () {
        return withBackend(S, function () { return TT.checkWin(); });
      }).then(function (shown) {
        expect(shown).toBe(true);
        clean("t-a"); clean("t-b");
      });
    });
    it("never shows to guests, and doesn't even look", function () {
      clean("x");
      return withAuth(null, function () {
        return withBackend(S, function (calls) {
          return TT.checkWin().then(function (shown) { expect(shown).toBe(false); expect(calls.length).toBe(0); expect(toasts().length).toBe(0); });
        });
      });
    });
    it("stays quiet for a player who didn't win, and doesn't ask again this week", function () {
      clean("t-lose");
      var lost = { week: "2026-W45", games: { gems: [{ rank: 1, name: "rubyist", score: 9000, me: false }] }, mine: { gems: { rank: 2, score: 10, of: 2 } } };
      return withAuth({ id: "t-lose" }, function () {
        return withBackend(lost, function () {
          return TT.checkWin().then(function (shown) {
            expect(shown).toBe(false);
            expect(toasts().length).toBe(0);
            expect(localStorage.getItem(TT._winKey({ id: "t-lose" }))).toBe(TT.weekOf().key);
          });
        });
      }).then(function () { clean("t-lose"); });
    });
    it("tries again later when the tournament can't be reached", function () {
      clean("t-off");
      return withAuth({ id: "t-off" }, function () {
        return withBackend(function () { return Promise.reject(new Error("offline")); }, function () {
          return TT.checkWin().then(function (shown) {
            expect(shown).toBe(false);
            expect(localStorage.getItem(TT._winKey({ id: "t-off" }))).toBe(null);
          });
        });
      });
    });
    it("in calm mode appears without motion and waits to be dismissed", function () {
      clean("t-calm");
      var was = window.SamukaCalm;
      window.SamukaCalm = { on: function () { return true; }, pref: function () { return "on"; }, system: function () { return false; } };
      return withAuth({ id: "t-calm" }, function () {
        return withBackend(S, function () { return TT.checkWin(); });
      }).then(function () {
        var el = toasts()[0];
        expect(el.classList.contains("is-in")).toBe(true);   // no frame wait, no slide
        el.querySelector(".tourney-toast__x").click();
        return new Promise(function (r) { setTimeout(r, 30); });
      }).then(function () {
        expect(toasts().length).toBe(0);
        window.SamukaCalm = was; clean("t-calm");
      }, function (e) { window.SamukaCalm = was; clean("t-calm"); throw e; });
    });
  });
})();
