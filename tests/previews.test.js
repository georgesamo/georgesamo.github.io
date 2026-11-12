/* Tests: link-preview helpers in player.js (the card drawing scripts/player-cards.mjs uses). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var P = window.SamukaPlayer;
  var CARD = { name: "neo", role: "user", joined: "2026-11-01T00:00:00Z", games: 12, best: { gems: 2310, sidekiq: 840 }, achievements: ["first_game"] };

  describe("player card previews", function () {
    it("short links only for names that are safe in a path", function () {
      expect(P.shortLink("neo")).toBe("/u/neo/");
      expect(P.shortLink("Neo_1.x-2")).toBe("/u/Neo_1.x-2/");
      expect(P.shortLink("dev one")).toBe("/u/?n=dev%20one");
      expect(P.pathSafe("a/b")).toBe(false);
      expect(P.pathSafe("")).toBe(false);
    });
    it("draws the downloadable card at 1040x560", function () {
      var cv = P.draw(CARD);
      expect(cv.width).toBe(1040);
      expect(cv.height).toBe(560);
    });
    it("draws the link preview at 1200x630, not blank", function () {
      var cv = P.draw(CARD, { og: true, host: "georgesamo.github.io" });
      expect(cv.width).toBe(1200);
      expect(cv.height).toBe(630);
      // the card sits in the middle: a pixel on its border is drawn, the page margin is background
      var g = cv.getContext("2d"), mid = g.getImageData(600, 315, 1, 1).data;
      expect(mid[3]).toBe(255);
      expect(cv.toDataURL("image/png").indexOf("data:image/png")).toBe(0);
    });
    it("share link falls back to the query form when there's no preview page", function () {
      var name = "nobody-" + Date.now();
      return P.shareUrl(name).then(function (url) {
        expect(url).toBe(location.origin + "/u/?n=" + encodeURIComponent(name));
      });
    });
  });
})();
