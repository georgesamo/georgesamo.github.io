/* The secret suite (track 6, lofi.js) and the Patch Bay puzzle that unlocks it (patchbay.js) */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, beforeEach = T.beforeEach, afterEach = T.afterEach;
  var KEY = "samuka-suite", saved;
  function L() { return window.SamukaLofi; }
  function P() { return window.SamukaPatchBay; }
  function set(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function dlg() { return document.querySelector(".pb"); }
  function click(sel) { var el = dlg().querySelector(sel); if (!el) throw new Error("no " + sel); el.click(); }
  function patchAll(order) { order.forEach(function (si, slot) { click('[data-out="' + si + '"]'); click('[data-in="' + slot + '"]'); }); }

  beforeEach(function () { saved = localStorage.getItem(KEY); localStorage.removeItem(KEY); window.SamukaAch = { list: [], has: function () { return false; } }; });
  afterEach(function () {
    if (P() && P().isOpen()) P().close();
    if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
  });

  describe("suite · catalog", function () {
    it("lists a locked sixth track in every theme", function () {
      L().catalog().forEach(function (th) {
        expect(th.songs).toHaveLength(11);
        var s = th.songs[5];
        expect(s.suite).toBe(true); expect(s.locked).toBe(true); expect(s.heard).toBe(0); expect(s.bars).toBe(270);
      });
    });
    it("is a full-length piece in balanced chapters: each a minute to a minute and three quarters", function () {
      ["phthalo", "knight", "golden"].forEach(function (th) {
        var c = L().catalog().filter(function (x) { return x.theme === th; })[0].songs, s = c[5], m = L().suite.marks(th);
        expect(s.secs > 540 && s.secs < 720).toBe(true);
        expect(s.secs).toBeGreaterThan(Math.max.apply(null, c.slice(0, 5).map(function (x) { return x.secs; })));
        m.forEach(function (x, i) { var len = (i + 1 < m.length ? m[i + 1].at : s.secs) - x.at; expect(len > 55 && len < 115).toBe(true); });
      });
      expect(L().catalog()[0].songs[5].bpm).toBe("60–172");
    });
    it("makes every song about half a minute longer with a section of its own", function () {
      var want = [["rise", "soar"], ["the chase", "cornered"], ["skyline", "open sky"], ["liquid", "rush"], ["letters"]];
      want.forEach(function (ids, si) { var got = L().layout("phthalo", si).bars.map(function (b) { return b.id; }); ids.forEach(function (id) { expect(got.indexOf(id) >= 0).toBe(true); }); });
      var secs = L().catalog()[0].songs.slice(0, 5).map(function (x) { return x.secs; });
      expect(secs.every(function (x) { return x >= 155; })).toBe(true);
    });
    it("plays Golden 10% slower than before (0.99x), so Ring Zero runs at 109", function () {
      expect(L().catalog()[2].songs[0].bpm).toBe(109);
    });
    it("gives every song an outro that counts towards its length", function () {
      L().catalog().forEach(function (th) { th.songs.slice(0, 5).forEach(function (s) { expect(s.outro >= 2).toBe(true); }); });
    });
    it("marks where each chapter of the director's cut starts, in order", function () {
      var m = L().suite.marks("golden");
      expect(m).toHaveLength(8);
      expect(m[0].at).toBe(0);
      expect(m.every(function (x, i) { return !i || x.at > m[i - 1].at; })).toBe(true);
      expect(m[0].name).toBe("cold open"); expect(m[7].name).toBe("dawn");
    });
    it("gives each palette's cut a chapter of its own", function () {
      expect(["phthalo", "knight", "golden"].map(function (th) { return L().suite.marks(th)[3].name; })).toEqual(["the monologue", "the warehouse", "the dance break"]);
      expect(L().suite.marks("phthalo")[2].name).toBe(L().suite.marks("knight")[2].name);
    });
    it("exposes player controls", function () {
      ["pause", "resume", "prev", "next", "seekTime", "skip", "setLoop", "volume"].forEach(function (k) { expect(typeof L()[k]).toBe("function"); });
      expect(L().isPaused()).toBe(false);
    });
    it("names each theme's suite", function () {
      expect(L().catalog().map(function (t) { return t.songs[5].title; })).toEqual(["Root Access", "The Long Night", "Alchemy"]);
    });
    it("keeps the patch bay's story order: theme → chase → standoff → lowest → epilogue", function () {
      expect(P()._order).toEqual([0, 1, 3, 2, 4]);
    });
  });

  describe("bonus tracks", function () {
    function secs(si) { return L().catalog()[0].songs[si].secs; }
    it("adds five locked bonus tracks, one per arcade game and the monologue, in every theme", function () {
      L().catalog().forEach(function (th) {
        var b = th.songs.slice(6);
        expect(b.map(function (s) { return s.game; })).toEqual(["sidekiq", "gems", "schema", "pitwall", "bundle"]);
        expect(b[4].hint).toContain("bundle install");
        b.forEach(function (s, i) { expect(s.bonus).toBe(true); expect(s.locked).toBe(true); expect(s.no).toBe(6); expect(s.si).toBe(6 + i); expect(s.outro >= 2).toBe(true); });
      });
    });
    it("knows where every file-backed track hands over, for the phone player's files", function () {
      var h = L().handoffs();
      expect(Object.keys(h).length).toBe(33);
      // an outro keeps its song's tempo: Ring Zero hands over after 80 + 4 bars at 110 bpm (the file starts at 0.05 s)
      expect(Math.abs(h["phthalo-1"] - (0.05 + 84 * 4 * 60 / 110)) < 0.01).toBe(true);
      expect(Math.abs(h["golden-4"] - (0.05 + 124 * 4 * 60 / (172 * 0.99))) < 0.01).toBe(true);
      expect(h["knight-6"] > 500).toBe(true);
    });
    it("starts with shuffle off and remembers the choice", function () {
      var was = L().shuffle();
      expect(L().shuffle(true)).toBe(true);
      expect(localStorage.getItem("samuka-shuffle")).toBe("1");
      L().shuffle(was);
    });
    it("lists the suite last, after the bonus tracks", function () {
      L().catalog().forEach(function (th) {
        var order = th.songs.slice().sort(function (a, b) { return a.ord - b.ord; }).map(function (s) { return s.si; });
        expect(order).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 5]);
      });
      expect(L().order.prev("phthalo", 5)).toBe(4);   // nothing unlocked: back to the last song
    });
    it("runs to the asked lengths: about three minutes each, the race faster (116 bpm), the monologue short", function () {
      expect(secs(6) >= 180 && secs(6) <= 210).toBe(true);
      expect(L().catalog()[0].songs[6].bpm).toBe("124–146");
      expect(secs(7) >= 160 && secs(7) <= 185).toBe(true);
      expect(secs(8) >= 150 && secs(8) <= 180).toBe(true);
      expect(L().catalog()[0].songs[8].bpm).toBe("136–160");
      expect(Math.abs(secs(9) - 223) <= 6).toBe(true);
      expect(L().catalog()[0].songs[9].bpm).toBe(116);
      expect(secs(10) >= 90 && secs(10) <= 110).toBe(true);
    });
    it("follows each game: three queues and a Redis flush, matches and power-ups, levels and a rollback", function () {
      var ids = function (si) { return L().layout("phthalo", si).bars.map(function (b) { return b.id; }); };
      ["workers", "backlog", "autoscale", "rate limit", "redis flush", "batch ×2", "drained"].forEach(function (id) { expect(ids(6).indexOf(id) >= 0).toBe(true); });
      ["new board", "matching", "cascade", "power-ups", "bundle", "last moves", "board clear"].forEach(function (id) { expect(ids(7).indexOf(id) >= 0).toBe(true); });
      ["level 1", "level up", "level 2", "db:rollback", "level 3", "four rows", "deployed"].forEach(function (id) { expect(ids(8).indexOf(id) >= 0).toBe(true); });
    });
    it("runs the race's replay for half a minute (backwards, scrubbing, fast-forwarding), about halfway through, in every palette", function () {
      ["phthalo", "knight", "golden"].forEach(function (th) {
        var lay = L().layout(th, 9), rep = lay.bars.filter(function (b) { return b.id === "the replay"; });
        expect(rep).toHaveLength(15);
        var a = rep[0].t, b = lay.bars[lay.bars.indexOf(rep[14]) + 1].t, mid = (a + b) / 2 / lay.end;
        expect(b - a >= 28 && b - a <= 36).toBe(true);
        expect(mid > 0.4 && mid < 0.6).toBe(true);
      });
    });
    it("unlocks a bonus track in every theme when a run of its game ends", function () {
      var got = null, h = function (e) { if (e.detail.type === "bonus") got = e.detail; };
      window.addEventListener("samuka:suite", h);
      window.dispatchEvent(new CustomEvent("samuka:game", { detail: { game: "schema", name: "start" } }));
      expect(L().bonus.open("schema")).toBe(false);
      window.dispatchEvent(new CustomEvent("samuka:game", { detail: { game: "schema", name: "over", score: 300 } }));
      window.removeEventListener("samuka:suite", h);
      expect(L().bonus.open("schema")).toBe(true);
      expect(got.si).toBe(8);
      L().catalog().forEach(function (th) { expect(th.songs[8].locked).toBe(false); expect(th.songs[6].locked).toBe(true); });
      expect(L().bonus.unlock("schema")).toBe(false);
      document.querySelectorAll(".ach-toast").forEach(function (el) { el.remove(); });
    });
    it("rotates through the five songs only while nothing is unlocked", function () {
      var O = L().order;
      expect([0, 1, 2, 3, 4].map(function (si) { return O.next("phthalo", si); })).toEqual([1, 2, 3, 4, 0]);
      expect(O.prev("phthalo", 0)).toBe(4);
    });
    it("adds unlocked bonus tracks and then the director's cut to the rotation, in the listed order", function () {
      set({ open: { knight: 1 }, bonus: { sidekiq: 1, schema: 1, bundle: 1 } });
      var O = L().order;
      expect([0, 1, 2, 3, 4, 6, 8, 10, 5].map(function (si) { return O.next("knight", si); })).toEqual([1, 2, 3, 4, 6, 8, 10, 5, 0]);
      expect(O.prev("knight", 0)).toBe(5);    // round the back: the suite is listed last
      expect(O.prev("knight", 5)).toBe(10);
      expect(O.prev("knight", 8)).toBe(6);
      expect(O.prev("knight", 6)).toBe(4);
      expect(O.next("phthalo", 4)).toBe(6);   // phthalo's cut is still locked: it stays out
      expect(O.next("phthalo", 10)).toBe(0);
    });
    it("unlocks the monologue in every theme with bundle install", function () {
      expect(L().bonus.open("bundle")).toBe(false);
      expect(L().bonus.unlock("bundle")).toBe(true);
      L().catalog().forEach(function (th) { expect(th.songs[10].locked).toBe(false); expect(th.songs[10].si).toBe(10); });
      expect(L().catalog().map(function (th) { return th.songs[10].title; })).toEqual(["The Monologue", "Monologue in the Dark", "Golden Monologue"]);
      document.querySelectorAll(".ach-toast").forEach(function (el) { el.remove(); });
    });
  });

  describe("suite · lock", function () {
    it("counts heard songs per theme", function () {
      set({ heard: { knight: 1 | 4 | 16 } });
      expect(L().suite.heard("knight")).toBe(3);
      expect(L().suite.heard("phthalo")).toBe(0);
    });
    it("unlocks one theme at a time and says so once", function () {
      var events = [], h = function (e) { events.push(e.detail); };
      window.addEventListener("samuka:suite", h);
      expect(L().suite.unlock("golden")).toBe(true);
      expect(L().suite.unlock("golden")).toBe(false);
      window.removeEventListener("samuka:suite", h);
      expect(L().suite.open("golden")).toBe(true);
      expect(L().suite.open("phthalo")).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("unlocked"); expect(events[0].title).toBe("Alchemy");
      expect(L().catalog()[2].songs[5].locked).toBe(false);
    });
    it("counts as unlocked when the account already has the achievement", function () {
      window.SamukaAch = { list: [], has: function (k) { return k === "suite_knight"; } };
      expect(L().suite.open("knight")).toBe(true);
    });
    it("ignores unknown themes", function () { expect(L().suite.unlock("nope")).toBe(false); });
  });

  describe("patch bay", function () {
    it("is cold until all five songs are heard", function () {
      set({ heard: { phthalo: 1 | 2 } });
      P().open("phthalo");
      expect(dlg().hidden).toBe(false);
      expect(dlg().textContent).toContain("The rack is cold");
      expect(dlg().textContent).toContain("2/5 heard");
      expect(dlg().querySelectorAll(".pb__heard li.is-on")).toHaveLength(2);
    });
    it("shows five songs and five clue-labelled movements, shuffled", function () {
      set({ heard: { phthalo: 31 } });
      P().open("phthalo");
      expect(dlg().querySelectorAll("[data-out]")).toHaveLength(5);
      expect(dlg().querySelectorAll("[data-in]")).toHaveLength(5);
      var order = [].map.call(dlg().querySelectorAll("[data-out]"), function (b) { return +b.getAttribute("data-out"); });
      expect(order.join() === "0,1,3,2,4").toBe(false);
      expect(dlg().textContent).toContain("rock bottom");
      expect(dlg().querySelector("[data-pb-run]").disabled).toBe(true);
    });
    it("patches by clicking a song then a movement; a song has one cable", function () {
      set({ heard: { phthalo: 31 } });
      P().open("phthalo");
      click('[data-out="2"]'); click('[data-in="0"]');
      expect(dlg().querySelector('[data-in="0"]').classList.contains("is-used")).toBe(true);
      click('[data-out="2"]'); click('[data-in="3"]');
      expect(dlg().querySelector('[data-in="0"]').classList.contains("is-used")).toBe(false);
      expect(dlg().querySelector('[data-in="3"]').classList.contains("is-used")).toBe(true);
      expect(dlg().querySelectorAll(".pb__cables path")).toHaveLength(1);
      click('[data-in="3"]');   // clicking a patched movement unplugs it
      expect(dlg().querySelectorAll(".pb__cables path")).toHaveLength(0);
    });
    it("a signal check lights one LED per correct movement, without saying which", async function () {
      set({ heard: { phthalo: 31 } });
      P().open("phthalo");
      patchAll([0, 1, 2, 3, 4]);   // overture, chase and home right; standoff and the fall swapped
      click("[data-pb-run]");
      await wait(2000);
      expect(dlg().querySelectorAll(".pb__leds i.is-on")).toHaveLength(3);
      expect(dlg().textContent).toContain("3/5");
      expect(L().suite.open("phthalo")).toBe(false);
    });
    it("unlocks the suite when every movement is right", async function () {
      set({ heard: { knight: 31 } });
      var got = null, h = function (e) { if (e.detail.type === "unlocked") got = e.detail.theme; };
      window.addEventListener("samuka:suite", h);
      P().open("knight");
      patchAll([0, 1, 3, 2, 4]);
      click("[data-pb-run]");
      await wait(2000);
      window.removeEventListener("samuka:suite", h);
      expect(got).toBe("knight");
      expect(L().suite.open("knight")).toBe(true);
      expect(dlg().querySelectorAll(".pb__leds i.is-ok")).toHaveLength(5);
      expect(dlg().querySelector("[data-pb-play]").textContent).toContain("The Long Night");
    });
    it("reopens solved, with the cables already in", function () {
      set({ heard: { golden: 31 }, open: { golden: 1 } });
      P().open("golden");
      expect(dlg().querySelectorAll(".pb__cables path.is-live").length + dlg().querySelectorAll("[data-in].is-used").length).toBeGreaterThan(4);
      expect(dlg().querySelector("[data-pb-run]")).toBe(null);
    });
    it("closes on Escape", function () {
      set({ heard: { phthalo: 31 } });
      P().open("phthalo");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(P().isOpen()).toBe(false);
    });
  });
  describe("player dock", function () {
    function D() { return window.SamukaDock; }
    afterEach(function () { if (D().isOpen()) D().close(); });
    it("opens with the theme's five songs and the transport, music off", function () {
      D().open();
      var el = document.querySelector(".mdock");
      expect(el.hidden).toBe(false);
      expect(el.querySelectorAll("[data-md-si]")).toHaveLength(5);
      expect(el.querySelector("[data-md-title]").textContent).toBe("Music is off");
      ["prev", "back", "fwd", "next", "stop"].forEach(function (k) { expect(el.querySelector('[data-md="' + k + '"]').disabled).toBe(true); });
    });
    it("lists the director's cut once it is unlocked", function () {
      L().suite.unlock(L().theme());
      D().open();
      var rows = document.querySelectorAll(".mdock [data-md-si]");
      expect(rows).toHaveLength(6);
      expect(rows[5].textContent).toContain("secret");
    });
    it("closes on Escape", function () {
      D().open();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(D().isOpen()).toBe(false);
    });
  });
})();
