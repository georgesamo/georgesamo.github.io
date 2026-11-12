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
    it("point at the game's preview page, which forwards to /games/", function () {
      expect(C.link({ game: "gems", seed: "gems-a", name: "n", score: 1 }).indexOf(location.origin + "/c/gems/?c=")).toBe(0);
    });
  });

  describe("challenge results", function () {
    it("carry a challenge id in the link, and drop bad ones", function () {
      var id = C.newId();
      expect(/^[A-Za-z0-9_-]{12}$/.test(id)).toBe(true);
      expect(C.newId()).not.toBe(id);
      expect(C.decode(C.encode({ game: "gems", seed: "gems-a", name: "n", score: 5, id: id })).id).toBe(id);
      var raw = function (i) { return btoa(JSON.stringify({ v: 1, g: "gems", s: "gems-a", n: "n", sc: 5, i: i })); };
      expect("id" in C.decode(raw("short"))).toBe(false);
      expect("id" in C.decode(raw("bad id with spaces!"))).toBe(false);
      expect("id" in C.decode(C.encode({ game: "gems", seed: "gems-a", name: "n", score: 5 }))).toBe(false);
    });
    it("tell the sender who beat them, with a rematch on the same board", function () {
      var items = C.newsItems([{ id: "abcdefgh1234", game: "gems", seed: "gems-x", mine: 3900, theirs: 4210, name: "Nino", at: "2026-11-12T10:00:00Z" }]);
      expect(items.length).toBe(1);
      expect(items[0].text).toBe("Nino beat your Gem Match challenge: 4,210 vs your 3,900.");
      expect(items[0].href.indexOf("/games/?c=")).toBe(0);
      var back = C.decode(items[0].href.split("?c=")[1]);
      expect(back.game).toBe("gems");
      expect(back.seed).toBe("gems-x");
      expect(back.name).toBe("Nino");
      expect(back.score).toBe(4210);
    });
    it("keep Pit Wall's race length in the rematch", function () {
      var it0 = C.newsItems([{ id: "abcdefgh1234", game: "pitwall", seed: "p-1", length: "sprint", mine: 10, theirs: 20, name: "x", at: "t" }])[0];
      expect(C.decode(it0.href.split("?c=")[1]).length).toBe("sprint");
    });
    it("show at most three, escape names, and say how many more", function () {
      var rows = [];
      for (var i = 0; i < 5; i++) rows.push({ id: "abcdefgh000" + i, game: "sidekiq", seed: "s", mine: 1, theirs: 2, name: "<b>evil</b>", at: "t" });
      var d = document.createElement("div"); d.innerHTML = C.newsHtml(rows);
      expect(d.querySelectorAll("[data-chal-rematch]").length).toBe(3);
      expect(d.querySelector("b")).toBe(null);
      expect(d.textContent).toContain("<b>evil</b> beat your Sidekiq Rush challenge");
      expect(d.textContent).toContain("and 2 more");
      expect(C.newsHtml([])).toBe("");
    });
    it("the result card asks guests to sign in so the sender hears about it", function () {
      var real = window.SamukaAuth;
      window.SamukaAuth = undefined;
      try {
        var withId = { game: "gems", seed: "gems-a", name: "Nino", score: 100, id: "abcdefgh1234" };
        expect(C.resultHtml(withId, 150, "gems-a")).toContain("Sign in and win again");
        expect(C.resultHtml(withId, 50, "gems-a")).not.toContain("Sign in");
        expect(C.resultHtml({ game: "gems", seed: "gems-a", name: "Nino", score: 100 }, 150, "gems-a")).not.toContain("Sign in");
      } finally { window.SamukaAuth = real; }
    });

    // a stand-in for auth.js: a local test session as `role`
    function as(role) { return { user: function () { return role ? { id: "local-" + role } : null; }, mock: function () { return role; }, profile: function () { return null; }, publicName: function () { return "dev-loca"; }, client: function () { return null; } }; }
    it("the local test backend plays both sides: send, beat, see once", async function () {
      var real = window.SamukaAuth, B = C.mockBackend, saved = localStorage.getItem("samuka-mock-challenges");
      localStorage.removeItem("samuka-mock-challenges");
      try {
        var c = { id: "abcdefgh1234", game: "gems", seed: "gems-q", name: "Samuka", score: 3900 };
        window.SamukaAuth = as("samuka");
        expect(await B.register(c)).toBe(true);
        expect(await B.beaten(c.id, 5000)).toBe(false);          // not your own
        window.SamukaAuth = as("user");
        expect(await B.beaten(c.id, 3900)).toBe(false);          // a tie doesn't beat it
        expect(await B.beaten("nope-nope-nope", 9000)).toBe(false);
        expect(await B.beaten(c.id, 4210)).toBe(true);
        expect((await B.news()).length).toBe(0);                 // user sent nothing
        window.SamukaAuth = as("samuka");
        var rows = await B.news();
        expect(rows.length).toBe(1);
        expect(rows[0].name).toBe("User");
        expect(rows[0].theirs).toBe(4210);
        expect(rows[0].mine).toBe(3900);
        await B.seen(rows[0].at);
        expect((await B.news()).length).toBe(0);
        // a better score later shows up again
        window.SamukaAuth = as("user");
        await new Promise(function (r) { setTimeout(r, 5); });
        expect(await B.beaten(c.id, 5000)).toBe(true);
        window.SamukaAuth = as("samuka");
        expect((await B.news())[0].theirs).toBe(5000);
      } finally {
        window.SamukaAuth = real;
        if (saved == null) localStorage.removeItem("samuka-mock-challenges"); else localStorage.setItem("samuka-mock-challenges", saved);
      }
    });
    it("show the note, light the Games dot until it's seen, then mark it seen", async function () {
      if (document.hidden) return "skip";
      var real = window.SamukaAuth, seen = [], rows = [{ id: "abcdefgh1234", game: "gems", seed: "gems-q", mine: 3900, theirs: 4210, name: "Nino", at: "2026-11-12T10:00:00.123456+00:00" }];
      var box = document.getElementById("sandbox"), host = document.createElement("div");
      host.innerHTML = '<nav class="tree"><a href="/games/">Games</a></nav><div data-chal-news hidden></div>';
      box.appendChild(host);
      var note = host.querySelector("[data-chal-news]"), dot = host.querySelector("a");
      window.SamukaAuth = as("user");
      C._setBackend({ news: function () { return Promise.resolve(rows); }, seen: function (at) { seen.push(at); return Promise.resolve(true); }, register: function () {}, beaten: function () {} });
      try {
        note.hidden = true; note.style.display = "none";          // not on this page yet: just the dot
        C.refreshNews();
        await new Promise(function (r) { setTimeout(r, 20); });
        expect(dot.classList.contains("has-chal-dot")).toBe(true);
        expect(seen.length).toBe(0);
        note.style.display = "";                                  // the player opens Games
        C.paintNews();
        expect(note.hidden).toBe(false);
        expect(note.textContent).toContain("Nino beat your Gem Match challenge: 4,210 vs your 3,900.");
        expect(note.querySelector("[data-chal-rematch]").textContent).toBe("Win it back →");
        expect(seen).toEqual([rows[0].at]);
        expect(dot.classList.contains("has-chal-dot")).toBe(false);
        C.paintNews();                                            // still there this visit, not marked twice
        expect(note.hidden).toBe(false);
        expect(seen.length).toBe(1);
        note.querySelector("[data-chal-news-hide]").click();
        expect(note.hidden).toBe(true);
      } finally {
        C._setBackend(null); window.SamukaAuth = real; host.remove();
        C.paintNews();
      }
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
