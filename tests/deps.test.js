/* Tests: Dependency Hell (assets/js/games/dependency-hell.js): the puzzle generator, the solver,
 * the scoring, and one seeded run played through the arcade window. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var L = window.SamukaDepsLogic, Ar = window.SamukaArcade;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function three(seed) { var rng = Ar.seeded(seed); return [0, 1, 2].map(function (r) { return L.generate(rng, r); }); }
  function strip(p) { return { gems: p.gems.map(function (g) { return g.name; }), rules: p.rules }; }

  describe("Dependency Hell · rules", function () {
    it("read each kind of rule the way the board says it", function () {
      expect(L.holds({ k: "min", a: 0, i: 2 }, [2, 0])).toBe(true);
      expect(L.holds({ k: "min", a: 0, i: 2 }, [1, 0])).toBe(false);
      expect(L.holds({ k: "max", a: 1, j: 3 }, [0, 2])).toBe(true);
      expect(L.holds({ k: "max", a: 1, j: 3 }, [0, 3])).toBe(false);
      // "a >= i needs b >= j": only binds when a is at least i
      expect(L.holds({ k: "need", a: 0, i: 2, b: 1, j: 2 }, [1, 0])).toBe(true);
      expect(L.holds({ k: "need", a: 0, i: 2, b: 1, j: 2 }, [2, 1])).toBe(false);
      expect(L.holds({ k: "need", a: 0, i: 2, b: 1, j: 2 }, [3, 2])).toBe(true);
      // "a >= i needs b < j"
      expect(L.holds({ k: "cap", a: 0, i: 1, b: 1, j: 2 }, [1, 2])).toBe(false);
      expect(L.holds({ k: "cap", a: 0, i: 1, b: 1, j: 2 }, [1, 1])).toBe(true);
      expect(L.holds({ k: "cap", a: 0, i: 1, b: 1, j: 2 }, [0, 3])).toBe(true);
    });
    it("solve a hand-made Gemfile exactly", function () {
      var g = function (n) { return { name: n, vers: ["1", "2", "3", "4"] }; };
      var p = { gems: [g("a"), g("b")], rules: [{ k: "min", a: 0, i: 2 }, { k: "cap", a: 0, i: 3, b: 1, j: 1 }, { k: "need", a: 1, i: 2, b: 0, j: 3 }] };
      var s = L.solve(p);
      // a ∈ {2,3}; a = 3 forces b = 0; b >= 2 needs a = 3, which can't have it → (2,0) (2,1) (3,0)
      expect(s.feasible).toBe(3);
      expect(s.opt).toBe(3);
      expect(s.best).toEqual([[3, 0], [2, 1]]);
      expect(s.minF).toBe(2);
      expect(s.matters).toEqual([true, true, true]);
    });
    it("name the rules like a Gemfile and a gemspec", function () {
      var p = { gems: [{ name: "sidekiq", vers: ["6.5", "7.1", "7.3", "8.0"] }, { name: "redis", vers: ["4.8", "5.0", "5.2", "5.4"] }] };
      expect(L.ruleText(p, { k: "min", a: 0, i: 1 })).toEqual({ gemfile: true, text: 'gem "sidekiq", ">= 7.1"' });
      expect(L.ruleText(p, { k: "max", a: 1, j: 3 })).toEqual({ gemfile: true, text: 'gem "redis", "< 5.4"' });
      expect(L.ruleText(p, { k: "need", a: 0, i: 2, b: 1, j: 2 })).toEqual({ gemfile: false, lhs: "sidekiq >= 7.3", rhs: "redis >= 5.2" });
      expect(L.ruleText(p, { k: "cap", a: 0, i: 3, b: 1, j: 1 }).rhs).toBe("redis < 5.0");
    });
  });

  describe("Dependency Hell · generator", function () {
    it("give the same three Gemfiles for the same seed, and different ones for another", function () {
      var a = three("deps-daily-2026-11-15").map(strip), b = three("deps-daily-2026-11-15").map(strip), c = three("deps-daily-2026-11-16").map(strip);
      expect(a).toEqual(b);
      expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false);
    });
    it("make every daily for two months fair: solvable, not trivial, every rule matters", function () {
      for (var d = 0; d < 60; d++) {
        three("deps-daily-" + d).forEach(function (p, r) {
          var n = L.ROUNDS[r].n, s = L.solve(p), max = n * (L.V - 1);
          expect(p.gems.length).toBe(n);
          expect(s.feasible).toBeGreaterThan(0);
          expect(s.opt < max).toBe(true);                                   // newest-everything never resolves
          expect(L.broken(p, p.gems.map(function () { return L.V - 1; })).length).toBeGreaterThan(0);
          expect(s.opt - s.minF >= 3).toBe(true);                           // a stale safe lock scores clearly less
          expect(s.matters.indexOf(false)).toBe(-1);
          s.best.forEach(function (v) { expect(L.broken(p, v)).toEqual([]); expect(L.sum(v)).toBe(s.opt); });
          expect(p.solution.opt).toBe(s.opt);                               // what the game scores against
        });
      }
    });
    it("draw from a small set of real gem names, each version list oldest to newest", function () {
      L.POOL.forEach(function (g) {
        expect(g[1].length).toBe(L.V);
        var n = g[1].map(function (v) { var p = v.split("."); return +p[0] * 1000 + +p[1]; });
        for (var i = 1; i < n.length; i++) expect(n[i] > n[i - 1]).toBe(true);
      });
    });
  });

  describe("Dependency Hell · scoring", function () {
    it("pay full marks for the freshest lock on the first install, fast", function () {
      expect(L.roundScore({ resolved: true, sum: 9, opt: 9, minF: 3, fails: 0, secs: 0, round: 0 })).toBe(1300);
      expect(L.roundScore({ resolved: true, sum: 9, opt: 9, minF: 3, fails: 0, secs: 0, round: 2 })).toBe(2600);
    });
    it("scale freshness between the stalest and the freshest lock that resolve", function () {
      expect(L.roundScore({ resolved: true, sum: 3, opt: 9, minF: 3, fails: 0, secs: 100, round: 0 })).toBe(400);
      expect(L.roundScore({ resolved: true, sum: 6, opt: 9, minF: 3, fails: 0, secs: 100, round: 0 })).toBe(700);
    });
    it("take 150 per failed install, never below 100, and nothing for a Gemfile given up", function () {
      expect(L.roundScore({ resolved: true, sum: 9, opt: 9, minF: 3, fails: 2, secs: 100, round: 0 })).toBe(700);
      expect(L.roundScore({ resolved: true, sum: 3, opt: 9, minF: 3, fails: 2, secs: 100, round: 0 })).toBe(100);
      expect(L.roundScore({ resolved: false, sum: 9, opt: 9, minF: 3, fails: 3, secs: 1, round: 2 })).toBe(0);
      expect(L.roundScore({ resolved: true, sum: 9, opt: 9, minF: 3, fails: 0, secs: 40, round: 0 })).toBe(1180);   // speed bonus 300 - 3 × 40
    });
    it("draw one share line per Gemfile", function () {
      expect(L.gridLine({ resolved: true, sum: 9, opt: 9, fails: 0 })).toBe("🟩");
      expect(L.gridLine({ resolved: true, sum: 8, opt: 9, fails: 1 })).toBe("⬛🟨");
      expect(L.gridLine({ resolved: false, fails: 3 })).toBe("⬛⬛🟥");
    });
  });

  describe("Dependency Hell · in the arcade", function () {
    it("is listed with the other games and accepted in challenge links", function () {
      expect(Ar.list().map(function (g) { return g.id; })).toContain("deps");
      var C = window.SamukaChallenge, c = { game: "deps", seed: "deps-abc123", name: "Nino", score: 4210 };
      expect(C.decode(C.encode(c))).toEqual({ game: "deps", seed: "deps-abc123", name: "Nino", score: 4210, length: undefined });
      expect(C.canChallenge({ game: "deps", seed: "deps-a", score: 10 })).toBe(true);
    });
    it("plays a seeded run from the keyboard: a failed install, then three locks that resolve", async function () {
      var events = [], on = function (e) { if (e.detail.game === "deps") events.push(e.detail); };
      var key = function (k) { document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
      window.addEventListener("samuka:game", on);
      try {
        expect(Ar.open("deps", { mode: "challenge", seed: "deps-test-run" })).toBe(true);
        for (var i = 0; i < 40 && !document.querySelector(".arcade [data-dh-start]"); i++) await wait(50);
        var stage = document.querySelector(".arcade [data-stage]");
        stage.querySelector("[data-dh-start]").click();
        var dbg = Ar._debug(), want = three("deps-test-run").map(strip);
        expect(strip(dbg.puzzle())).toEqual(want[0]);                       // the run is the seed's Gemfiles
        expect(stage.querySelectorAll(".dh__row").length).toBe(4);
        expect(dbg.pins()).toEqual([3, 3, 3, 3]);                            // bundle update: everything newest
        key("ArrowDown"); key("1");
        expect(dbg.pins()[1]).toBe(0);
        expect(stage.querySelector('.dh__row[data-row="1"]').classList.contains("is-cur")).toBe(true);
        key("ArrowUp"); key("ArrowLeft");
        expect(dbg.pins()[0]).toBe(2);
        // pin everything newest again and install: newest never resolves
        key("4"); key("ArrowDown"); key("4");
        key("Enter");
        expect(dbg.state().fails).toBe(1);
        key("Enter");                                                        // the same lock again: no install spent
        expect(dbg.state().fails).toBe(1);
        expect(stage.querySelectorAll(".dh__list li.is-broken").length).toBeGreaterThan(0);
        expect(stage.querySelector("[data-out]").className).toContain("is-err");
        for (var r = 0; r < 3; r++) {
          dbg.solve(); key("Enter");
          expect(dbg.state().results.length).toBe(r + 1);
          for (i = 0; i < 40 && !stage.querySelector("[data-dh-next]"); i++) await wait(50);
          stage.querySelector("[data-dh-next]").click();
        }
        var over = events.filter(function (d) { return d.name === "over"; })[0];
        expect(!!over).toBe(true);
        expect(over.mode).toBe("challenge");
        expect(over.seed).toBe("deps-test-run");
        expect(over.grid.split("\n")).toEqual(["⬛🟩", "🟩", "🟩"]);
        expect(over.score).toBeGreaterThan(5000);
        expect(events.some(function (d) { return d.name === "all_fresh"; })).toBe(true);
      } finally { Ar.close(); window.removeEventListener("samuka:game", on); }
    });
  });
})();
