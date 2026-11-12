/* Tests: the "Your week" recap on the Today page (assets/js/recap.js). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var R = window.SamukaRecap;
  // Thursday 12 Nov 2026, 15:00 local time; the week started Monday 9 Nov 00:00 local
  var NOW = new Date(2026, 10, 12, 15, 0).getTime();
  var MON = new Date(2026, 10, 9, 0, 0).getTime();
  var LAST_MON = new Date(2026, 10, 2, 0, 0).getTime();
  var at = function (y, mo, d, h) { return new Date(y, mo, d, h || 12).getTime(); };
  var NAMES = { gems: "Gem Match", sidekiq: "Sidekiq Rush", pitwall: "Pit Wall" };
  function build(over) {
    var c = { now: NOW, scores: [], badges: [], tracks: [], streak: null, names: NAMES };
    Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
    return R.build(c);
  }

  describe("weekly recap · week bounds", function () {
    it("starts the week on Monday at local midnight", function () {
      expect(R.weekStart(NOW)).toBe(MON);
      expect(R.prevWeekStart(NOW)).toBe(LAST_MON);
    });
    it("counts Sunday night as the old week and Monday as the new one", function () {
      expect(R.weekStart(new Date(2026, 10, 15, 23, 59).getTime())).toBe(MON);
      expect(R.weekStart(new Date(2026, 10, 16, 0, 0).getTime())).toBe(new Date(2026, 10, 16).getTime());
      expect(R.weekStart(MON)).toBe(MON);
    });
    it("lands on midnight across a month and a year change", function () {
      expect(R.weekStart(new Date(2027, 0, 1, 9).getTime())).toBe(new Date(2026, 11, 28).getTime());
      var d = new Date(R.weekStart(new Date(2026, 2, 31, 9).getTime()));   // DST weeks in many zones
      expect(d.getDay()).toBe(1);
      expect(d.getHours()).toBe(0);
    });
  });

  describe("weekly recap · model", function () {
    it("keeps the best score per game played this week, highest first", function () {
      var m = build({ scores: [
        { game: "gems", score: 1200, t: at(2026, 10, 9) }, { game: "gems", score: 2400, t: at(2026, 10, 11) },
        { game: "sidekiq", score: 3100, t: at(2026, 10, 12, 9) }
      ] });
      expect(m.empty).toBe(false);
      expect(m.played).toBe(3);
      expect(m.games.map(function (g) { return g.game + ":" + g.best; })).toEqual(["sidekiq:3100", "gems:2400"]);
      expect(m.games[1].name).toBe("Gem Match");
    });
    it("marks a game up only when it beats last week's best", function () {
      var m = build({ scores: [
        { game: "gems", score: 2400, t: at(2026, 10, 10) }, { game: "gems", score: 2000, t: at(2026, 10, 4) },
        { game: "sidekiq", score: 500, t: at(2026, 10, 10) }, { game: "sidekiq", score: 900, t: at(2026, 10, 3) },
        { game: "pitwall", score: 40, t: at(2026, 10, 10) }
      ] });
      var by = {}; m.games.forEach(function (g) { by[g.game] = g; });
      expect(by.gems.up).toBe(true); expect(by.gems.last).toBe(2000);
      expect(by.sidekiq.up).toBe(false); expect(by.sidekiq.last).toBe(900);
      expect(by.pitwall.up).toBe(false); expect(by.pitwall.last).toBe(0);
      expect(m.played).toBe(3);   // last week's games don't count
    });
    it("a tie with last week is not an improvement", function () {
      var m = build({ scores: [{ game: "gems", score: 900, t: at(2026, 10, 10) }, { game: "gems", score: 900, t: at(2026, 10, 5) }] });
      expect(m.games[0].up).toBe(false);
    });
    it("ignores scores older than last week, from the future, or without a game", function () {
      var m = build({ scores: [
        { game: "gems", score: 9999, t: at(2026, 9, 20) }, { game: "gems", score: 9999, t: NOW + 1000 },
        { score: 50, t: at(2026, 10, 10) }, { game: "gems", score: 100, t: at(2026, 10, 10) }
      ] });
      expect(m.played).toBe(1);
      expect(m.games[0].best).toBe(100);
      expect(m.games[0].last).toBe(0);
    });
    it("is empty with nothing played this week, even with a streak or older scores", function () {
      var m = build({ scores: [{ game: "gems", score: 800, t: at(2026, 10, 5) }], streak: { current: 3, kind: "risk" } });
      expect(m.empty).toBe(true);
      expect(m.games).toHaveLength(0);
    });
    it("only lists badges and tracks unlocked since Monday", function () {
      var m = build({ scores: [{ game: "gems", score: 10, t: at(2026, 10, 10) }],
        badges: [{ key: "first_game", title: "bundle exec play", t: at(2026, 10, 10) }, { key: "daily", title: "Daily standup", t: at(2026, 10, 1) }],
        tracks: [{ title: "Old cut", t: at(2026, 10, 8, 23) }, { title: "New cut", t: MON }] });
      expect(m.badges.map(function (b) { return b.key; })).toEqual(["first_game"]);
      expect(m.tracks.map(function (t) { return t.title; })).toEqual(["New cut"]);
    });
    it("drops a zero streak", function () {
      expect(build({ streak: { current: 0, kind: "risk" } }).streak).toBe(null);
      expect(build({ streak: { current: 5, kind: "kept" } }).streak.current).toBe(5);
    });
  });

  describe("weekly recap · markup", function () {
    it("nudges to the daily instead of an empty card", function () {
      var h = R.html(build());
      expect(h).toContain("Nothing played yet this week");
      expect(h).toContain("data-daily");
      expect(h).not.toContain("recap__games");
    });
    it("shows the arrow only for games that beat last week", function () {
      var h = R.html(build({ scores: [
        { game: "gems", score: 2400, t: at(2026, 10, 10) }, { game: "gems", score: 2000, t: at(2026, 10, 4) },
        { game: "sidekiq", score: 300, t: at(2026, 10, 10) }
      ] }));
      expect(h).toContain("2,400");
      expect(h).toContain("beat last week's 2,000");
      expect((h.match(/▲/g) || []).length).toBe(1);
      expect(h).toContain("first week");
      expect(h).toContain("<b>2</b> games played");
    });
    it("shows the streak, badges and tracks when there are some, and leaves them out when not", function () {
      var base = { scores: [{ game: "gems", score: 10, t: at(2026, 10, 10) }] };
      var bare = R.html(build(base));
      expect(bare).toContain("<b>1</b> game played");
      expect(bare).not.toContain("streak");
      expect(bare).not.toContain("badge");
      expect(bare).not.toContain("unlocked");
      base.streak = { current: 4, kind: "risk" };
      base.badges = [{ key: "daily", icon: "📅", title: "Daily standup", t: at(2026, 10, 10) }];
      base.tracks = [{ title: "Root Access (Phthalo)", t: at(2026, 10, 10) }];
      var full = R.html(build(base));
      expect(full).toContain("4-day</b> streak, play today's daily to keep it");
      expect(full).toContain("<b>1</b> badge: ");
      expect(full).toContain("Daily standup");
      expect(full).toContain("1</b> track unlocked");
      base.streak = { current: 4, kind: "kept" };
      expect(R.html(build(base))).toContain("streak, today's done");
    });
    it("escapes names that reach the page", function () {
      var h = R.html(build({ scores: [{ game: "x", score: 1, t: at(2026, 10, 10) }], names: { x: "<img onerror=1>" },
        badges: [{ key: "k", title: "<b>bad</b>", t: at(2026, 10, 10) }] }));
      expect(h).not.toContain("<img");
      expect(h).not.toContain("<b>bad</b>");
    });
  });
})();
