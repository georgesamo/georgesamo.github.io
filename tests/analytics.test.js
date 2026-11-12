/* Tests: feature-use tracking (SamukaTrack in assets/js/analytics.js). On localhost nothing is sent;
 * uses are kept in window.__samukaTracked instead. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  function fresh() { window.__samukaTracked = []; return window.__samukaTracked; }

  describe("feature tracking", function () {
    it("is always defined, so callers never need to check", function () {
      expect(typeof window.SamukaTrack).toBe("function");
    });
    it("records a use by its short name", function () {
      var got = fresh();
      window.SamukaTrack("feeds:open");
      expect(window.__samukaTracked).toEqual(["feeds:open"]);
      expect(got.length).toBe(1);
    });
    it("trims names to 60 characters and collapses spaces", function () {
      fresh();
      window.SamukaTrack("  a   b  ");
      window.SamukaTrack(new Array(80).join("x"));
      expect(window.__samukaTracked[0]).toBe("a b");
      expect(window.__samukaTracked[1].length).toBe(60);
    });
    it("ignores empty names", function () {
      fresh();
      window.SamukaTrack(""); window.SamukaTrack(null); window.SamukaTrack();
      expect(window.__samukaTracked.length).toBe(0);
    });
    it("counts a once-per-tab use only the first time", function () {
      fresh();
      var n = "test:once:" + Date.now();
      window.SamukaTrack(n, true); window.SamukaTrack(n, true); window.SamukaTrack(n);
      expect(window.__samukaTracked).toEqual([n, n]);
    });
    it("counts a click that follows a streak dot", function () {
      fresh();
      var a = document.createElement("a");
      a.href = "#streak-dot-test"; a.className = "has-streak-dot";
      document.body.appendChild(a);
      a.addEventListener("click", function (e) { e.preventDefault(); });
      a.click(); a.remove();
      expect(window.__samukaTracked).toContain("streak:dot-click");
    });
    it("the tour reports starting and how it ended", function () {
      fresh();
      if (window.SamukaTour) { window.SamukaTour.start(); window.SamukaTour.end(); }
      expect(window.__samukaTracked).toContain("tour:start");
      expect(window.__samukaTracked).toContain("tour:closed");
    });
  });
})();
