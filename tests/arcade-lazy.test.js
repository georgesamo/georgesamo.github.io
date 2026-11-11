/* Tests: games load on demand (arcade.js + window.SamukaGameSrc). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var Ar = window.SamukaArcade;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function src(id, url) { window.SamukaGameSrc = window.SamukaGameSrc || {}; window.SamukaGameSrc[id] = { src: url, title: id + ".rb", blurb: "b" }; }

  describe("games load on demand", function () {
    it("list games before their code is loaded", function () {
      src("t-listed", "fixtures/does-not-exist.js");
      var ids = Ar.list().map(function (g) { return g.id; });
      expect(ids).toContain("t-listed");
      expect(Ar.loaded("t-listed")).toBe(false);
    });
    it("open the window at once, then mount when the code arrives", async function () {
      src("t-lazy", "fixtures/lazy-game.js");
      var events = [], on = function (e) { events.push(e.detail.game + ":" + e.detail.name); };
      window.addEventListener("samuka:game", on);
      try {
        expect(Ar.open("t-lazy")).toBe(true);
        expect(Ar.isOpen()).toBe(true);
        expect(Ar.current()).toBe("t-lazy");
        expect(!!document.querySelector(".arcade .arcade__loading")).toBe(true);
        for (var i = 0; i < 40 && !document.querySelector(".arcade .t-lazy"); i++) await wait(50);
        expect(!!document.querySelector(".arcade .t-lazy")).toBe(true);
        expect(Ar.loaded("t-lazy")).toBe(true);
        expect(events).toEqual(["t-lazy:start"]);
      } finally { Ar.close(); window.removeEventListener("samuka:game", on); }
    });
    it("send nothing for a game closed while loading", async function () {
      src("t-slow", "fixtures/does-not-exist.js?slow");
      var events = [], on = function (e) { events.push(e.detail.game + ":" + e.detail.name); };
      window.addEventListener("samuka:game", on);
      try {
        Ar.open("t-slow"); Ar.close();
        await wait(300);
        expect(Ar.isOpen()).toBe(false);
        expect(events).toEqual([]);
      } finally { window.removeEventListener("samuka:game", on); }
    });
    it("offer a retry when the code can't be loaded", async function () {
      src("t-missing", "fixtures/does-not-exist.js");
      Ar.open("t-missing");
      try {
        for (var i = 0; i < 40 && !document.querySelector(".arcade .arcade__card [data-play]"); i++) await wait(50);
        var retry = document.querySelector(".arcade .arcade__card [data-play]");
        expect(retry && retry.getAttribute("data-play")).toBe("t-missing");
        expect(Ar.current()).toBe(null);
      } finally { Ar.close(); }
    });
  });
})();
