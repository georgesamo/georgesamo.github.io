/* Tests: the daily streak reminder (assets/js/streak.js). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var K = window.SamukaStreak;
  // 2026-11-12 20:30 UTC: 3h 30m until the next daily
  var NOW = Date.UTC(2026, 10, 12, 20, 30);
  function st(over) {
    var c = { signedIn: true, streak: { current: 4, best: 9 }, done: false, on: true, hiddenDay: null, now: NOW };
    Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
    return K.state(c);
  }

  describe("streak reminder", function () {
    it("warns when a streak is going and today's daily isn't played", function () {
      var s = st();
      expect(s.show).toBe(true);
      expect(s.kind).toBe("risk");
      expect(s.dot).toBe(true);
      expect(s.text).toContain("4-day streak ends in 3h 30m");
    });
    it("gets urgent in the last three hours", function () {
      var s = st({ now: Date.UTC(2026, 10, 12, 22, 15) });
      expect(s.kind).toBe("urgent");
      expect(s.text).toContain("1h 45m");
      expect(st({ now: Date.UTC(2026, 10, 12, 23, 52) }).text).toContain("ends in 8m");
    });
    it("says the streak is safe once today's daily is done", function () {
      var s = st({ done: true });
      expect(s.kind).toBe("kept");
      expect(s.text).toContain("safe until tomorrow");
      expect(!!s.dot).toBe(false);
    });
    it("stays quiet without a streak, for guests, or when switched off", function () {
      expect(st({ streak: { current: 0, best: 3 } }).show).toBe(false);
      expect(st({ streak: null }).show).toBe(false);
      expect(st({ signedIn: false }).show).toBe(false);
      expect(st({ on: false }).show).toBe(false);
    });
    it("hides the note for the rest of the day, but keeps the dot", function () {
      var s = st({ hiddenDay: "2026-11-12" });
      expect(s.show).toBe(false);
      expect(s.dot).toBe(true);
      expect(st({ hiddenDay: "2026-11-11" }).show).toBe(true);
    });
    it("formats time left", function () {
      expect(K.fmtLeft(61)).toBe("1h 1m");
      expect(K.fmtLeft(59)).toBe("59m");
    });
  });

  describe("streak reminder in settings", function () {
    it("signed-in players get a switch, guests don't", function () {
      var S = window.SamukaSettings;
      var base = { mode: "dark", skin: "phthalo", skins: ["phthalo"], auth: true, music: null, glitches: true, cursors: null };
      function dom(h) { var d = document.createElement("div"); d.innerHTML = h; return d; }
      var on = Object.assign({}, base, { user: true, name: "neo", role: "user", streakRemind: false });
      expect(dom(S.html(on)).querySelector("[data-set-streak]").checked).toBe(false);
      var guest = Object.assign({}, base, { user: false, streakRemind: null });
      expect(dom(S.html(guest)).querySelector("[data-set-streak]")).toBe(null);
    });
  });
})();
