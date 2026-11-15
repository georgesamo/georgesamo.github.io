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

  describe("Dependency Hell · difficulty", function () {
    function run(seed, lvl) { var rng = Ar.seeded(seed); return [0, 1, 2].map(function (r) { return L.generate(rng, r, lvl); }); }
    it("make normal the default, so the daily and old challenge seeds keep their Gemfiles", function () {
      var plain = three("deps-daily-2026-11-15").map(strip);
      expect(run("deps-daily-2026-11-15", "normal").map(strip)).toEqual(plain);
      expect(run("deps-daily-2026-11-15", "nightmare").map(strip)).toEqual(plain);   // unknown → normal
      expect(L.level("hard")).toBe("hard");
      expect(L.level(null)).toBe("normal");
      expect(L.level("constructor")).toBe("normal");
      expect(L.LEVEL_NAMES).toEqual(["easy", "normal", "hard"]);
      expect(L.LEVELS.normal.rounds).toEqual(L.ROUNDS);
      expect(L.LEVELS.normal.installs).toBe(L.MAX_INSTALLS);
    });
    it("give each level the same Gemfiles for the same seed, and a different set per level", function () {
      L.LEVEL_NAMES.forEach(function (lvl) {
        expect(run("deps-lvl-seed", lvl).map(strip)).toEqual(run("deps-lvl-seed", lvl).map(strip));
      });
      expect(JSON.stringify(run("deps-lvl-seed", "easy").map(strip)) === JSON.stringify(run("deps-lvl-seed", "hard").map(strip))).toBe(false);
    });
    it("keep every level fair: solvable, newest-everything fails, every rule matters, sizes grow easy → hard", function () {
      L.LEVEL_NAMES.forEach(function (lvl) {
        var cfg = L.LEVELS[lvl];
        for (var d = 0; d < (lvl === "hard" ? 20 : 40); d++) {
          run("deps-" + lvl + "-" + d, lvl).forEach(function (p, r) {
            var n = cfg.rounds[r].n, s = L.solve(p), max = n * (L.V - 1);
            expect(p.level).toBe(lvl);
            expect(p.gems.length).toBe(n);
            expect(p.tries < 200).toBe(true);                                 // found on the strict bar, not the fallback
            expect(s.feasible).toBeGreaterThan(0);
            expect(s.opt < max).toBe(true);
            expect(s.opt - s.minF >= cfg.span).toBe(true);
            expect(s.best.length <= cfg.best[0]).toBe(true);
            expect(s.matters.indexOf(false)).toBe(-1);
            s.best.forEach(function (v) { expect(L.broken(p, v)).toEqual([]); });
            expect(p.solution.opt).toBe(s.opt);
          });
        }
      });
      var gems = function (lvl) { return L.LEVELS[lvl].rounds.map(function (r) { return r.n; }); };
      expect(gems("easy")).toEqual([3, 4, 5]);
      expect(gems("normal")).toEqual([4, 5, 6]);
      expect(gems("hard")).toEqual([5, 6, 7]);
      expect(L.LEVELS.easy.installs > L.LEVELS.normal.installs).toBe(true);
      expect(L.LEVELS.hard.best[0]).toBe(1);                                  // one freshest lock to find
      expect(L.LEVELS.hard.focus).toBe(false);                                // and no rule hints
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
      var keptLevel = null; try { keptLevel = localStorage.getItem("samuka-deps-level"); localStorage.setItem("samuka-deps-level", "hard"); } catch (e) {}
      try {
        // a challenge is always normal, whatever this device last picked for free play
        expect(Ar.open("deps", { mode: "challenge", seed: "deps-test-run" })).toBe(true);
        for (var i = 0; i < 40 && !document.querySelector(".arcade [data-dh-start]"); i++) await wait(50);
        var stage = document.querySelector(".arcade [data-stage]");
        expect(stage.querySelector('input[name="dh-level"]')).toBe(null);   // no picker on a shared board
        stage.querySelector("[data-dh-start]").click();
        var dbg = Ar._debug(), want = three("deps-test-run").map(strip);
        expect(dbg.state().level).toBe("normal");
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
        expect(over.practice).toBe(undefined);
      } finally {
        Ar.close(); window.removeEventListener("samuka:game", on);
        try { if (keptLevel == null) localStorage.removeItem("samuka-deps-level"); else localStorage.setItem("samuka-deps-level", keptLevel); } catch (e) {}
      }
    });
    it("lets free play pick a difficulty, remembers it, and keeps easy / hard off the boards", async function () {
      var events = [], on = function (e) { if (e.detail.game === "deps") events.push(e.detail); };
      var key = function (k) { document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
      var LK = "samuka-deps-level", keptLevel = null, keptBest = null, keptEasy = null;
      try { keptLevel = localStorage.getItem(LK); keptBest = localStorage.getItem("samuka-best-deps"); keptEasy = localStorage.getItem("samuka-best-deps-easy"); localStorage.removeItem(LK); localStorage.removeItem("samuka-best-deps-easy"); } catch (e) {}
      window.addEventListener("samuka:game", on);
      window.__samukaTracked = [];
      try {
        expect(Ar.open("deps")).toBe(true);
        for (var i = 0; i < 40 && !document.querySelector(".arcade [data-dh-start]"); i++) await wait(50);
        var stage = document.querySelector(".arcade [data-stage]");
        var radios = stage.querySelectorAll('input[name="dh-level"]');
        expect(radios.length).toBe(3);
        expect(stage.querySelector('input[name="dh-level"]:checked').value).toBe("normal");   // nothing saved yet
        expect(stage.querySelectorAll(".dh__row").length).toBe(4);
        var easy = stage.querySelector('input[name="dh-level"][value="easy"]');
        easy.click();
        expect(localStorage.getItem(LK)).toBe("easy");
        expect(stage.querySelectorAll(".dh__row").length).toBe(3);             // the demo board follows the pick
        expect(stage.querySelector("[data-dh-sizes]").textContent).toBe("3, 4 and 5 gems");
        stage.querySelector("[data-dh-start]").click();
        var dbg = Ar._debug();
        expect(dbg.state().level).toBe("easy");
        expect(window.__samukaTracked).toContain("deps:difficulty:easy");
        expect(stage.querySelectorAll(".dh__row").length).toBe(3);
        expect(document.querySelector(".arcade [data-hud]").textContent).toContain("●●●●");   // four installs on easy
        var played = [];
        for (var r = 0; r < 3; r++) {
          played.push(strip(dbg.puzzle()));
          dbg.solve(); key("Enter");
          for (i = 0; i < 40 && !stage.querySelector("[data-dh-next]"); i++) await wait(50);
          stage.querySelector("[data-dh-next]").click();
        }
        var over = events.filter(function (d) { return d.name === "over"; })[0];
        expect(over.practice).toBe("easy");
        expect(over.level).toBe("easy");
        var rng = Ar.seeded(over.seed);                                       // the run replays from its seed at its level
        expect([0, 1, 2].map(function (q) { return strip(L.generate(rng, q, "easy")); })).toEqual(played);
        expect(window.SamukaChallenge.canChallenge({ game: "deps", seed: over.seed, score: over.score, practice: over.practice })).toBe(false);
        expect(+localStorage.getItem(Object.keys(localStorage).filter(function (k) { return /^samuka-best-(.+-)?deps-easy$/.test(k); })[0])).toBe(over.score);
        expect(localStorage.getItem("samuka-best-deps")).toBe(keptBest);       // the ranked best is untouched
        expect(events.some(function (d) { return d.name === "all_fresh"; })).toBe(false);   // no achievement from easy
        expect(stage.querySelector("[data-lb-mini]")).toBe(null);
        expect(stage.querySelector(".dh__practice")).not.toBe(null);
        // the end card goes back to the picker, which remembers easy
        stage.querySelector("[data-dh-menu]").click();
        expect(stage.querySelector('input[name="dh-level"]:checked').value).toBe("easy");
        Ar.close();
        // a fresh window remembers the pick too
        Ar.open("deps");
        for (i = 0; i < 40 && !document.querySelector(".arcade [data-dh-start]"); i++) await wait(50);
        expect(document.querySelector('.arcade input[name="dh-level"]:checked').value).toBe("easy");
      } finally {
        Ar.close(); window.removeEventListener("samuka:game", on);
        try {
          if (keptLevel == null) localStorage.removeItem(LK); else localStorage.setItem(LK, keptLevel);
          Object.keys(localStorage).forEach(function (k) { if (/^samuka-best-(.+-)?deps-easy$/.test(k)) localStorage.removeItem(k); });
          if (keptEasy != null) localStorage.setItem("samuka-best-deps-easy", keptEasy);
        } catch (e) {}
      }
    });
  });
})();
