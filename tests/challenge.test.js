/* Tests: challenge a friend (assets/js/challenge.js) and the per-run seeds it relies on (arcade.js). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var C = window.SamukaChallenge, Ar = window.SamukaArcade;

  describe("challenge links", function () {
    it("round-trip a challenge through the link code", function () {
      var c = { game: "gems", seed: "gems-abc123", name: "Nino", score: 2140 };
      expect(C.decode(C.encode(c))).toEqual({ game: "gems", seed: "gems-abc123", name: "Nino", score: 2140, length: undefined });
    });
    it("keep Pit Wall's race length, defaulting to full", function () {
      expect(C.decode(C.encode({ game: "pitwall", seed: "pitwall-x", name: "a", score: 1, length: "sprint" })).length).toBe("sprint");
      expect(C.decode(C.encode({ game: "pitwall", seed: "pitwall-x", name: "a", score: 1 })).length).toBe("full");
    });
    it("survive non-ASCII names", function () {
      expect(C.decode(C.encode({ game: "schema", seed: "s-1", name: "ნინო ✨", score: 5 })).name).toBe("ნინო ✨");
    });
    it("reject garbage, unknown games and odd seeds", function () {
      expect(C.decode("")).toBe(null);
      expect(C.decode("not-base64!!")).toBe(null);
      expect(C.decode(btoa(JSON.stringify({ v: 1, g: "evil", s: "x", sc: 1 })))).toBe(null);
      expect(C.decode(C.encode({ game: "gems", seed: "<script>", name: "x", score: 1 }))).toBe(null);
      expect(C.decode(btoa(JSON.stringify({ v: 2, g: "gems", s: "x", sc: 1 })))).toBe(null);
    });
    it("clamp the score and trim the name", function () {
      var c = C.decode(C.encode({ game: "gems", seed: "gems-a", name: "x".repeat(40), score: 9999999 }));
      expect(c.score).toBe(200000);
      expect(c.name.length).toBe(24);
      expect(C.decode(C.encode({ game: "gems", seed: "gems-a", name: "   ", score: 1 })).name).toBe("a friend");
    });
    it("only offer runs that can be replayed", function () {
      expect(C.canChallenge({ game: "gems", seed: "gems-a", score: 10 })).toBe(true);
      expect(C.canChallenge({ game: "gems", seed: "gems-a", score: 0 })).toBe(false);
      expect(C.canChallenge({ game: "gems", score: 10 })).toBe(false);
      expect(C.canChallenge({ game: "pitwall", seed: "p", score: 10, kind: "quick" })).toBe(true);
      expect(C.canChallenge({ game: "pitwall", seed: "p", score: 10, kind: "gp" })).toBe(false);
    });
    it("point at the games page", function () {
      expect(C.link({ game: "gems", seed: "gems-a", name: "n", score: 1 }).indexOf(location.origin + "/games/?c=")).toBe(0);
    });
  });

  describe("per-run seeds (arcade.js)", function () {
    var api = null;
    Ar.register("t-seed", { title: "t-seed", mount: function (stage, a) { api = a; return {}; } });
    function draw(n) { var out = []; for (var i = 0; i < n; i++) out.push(api.rng()); return out; }

    it("give each free run its own seed", function () {
      Ar.open("t-seed");
      try {
        var s1 = Ar.seed(), s2 = api.newRun();
        expect(s1.indexOf("t-seed-")).toBe(0);
        expect(s2).not.toBe(s1);
      } finally { Ar.close(); }
    });
    it("replay the same numbers for the same seed, every run", function () {
      Ar.open("t-seed", { mode: "challenge", seed: "fixed-1" });
      try {
        var a = draw(5); api.newRun(); var b = draw(5);
        expect(Ar.seed()).toBe("fixed-1");
        expect(b).toEqual(a);
        // and the same as a fresh generator on that seed
        var g = Ar.seeded("fixed-1"), c = [g(), g(), g(), g(), g()];
        expect(c).toEqual(a);
      } finally { Ar.close(); }
    });
    it("keep challenge scores out of personal bests", function () {
      var before = Ar.best("t-seed");
      Ar.open("t-seed", { mode: "challenge", seed: "fixed-2" });
      try {
        var r = api.best(before + 500);
        expect(r.isNew).toBe(false);
        expect(Ar.best("t-seed")).toBe(before);
      } finally { Ar.close(); }
    });
  });
})();
