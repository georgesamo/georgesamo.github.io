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
        expect(th.songs).toHaveLength(6);
        var s = th.songs[5];
        expect(s.suite).toBe(true); expect(s.locked).toBe(true); expect(s.heard).toBe(0); expect(s.bars).toBe(242);
      });
    });
    it("is the longest track: about nine and a half minutes", function () {
      var s = L().catalog()[0].songs;
      expect(s[5].secs).toBeGreaterThan(540);
      expect(s[5].secs).toBeGreaterThan(Math.max.apply(null, s.slice(0, 5).map(function (x) { return x.secs; })));
      expect(s[5].bpm).toBe("60–172");
    });
    it("gives every song an outro that counts towards its length", function () {
      L().catalog().forEach(function (th) { th.songs.slice(0, 5).forEach(function (s) { expect(s.outro >= 2).toBe(true); }); });
    });
    it("marks where each suite movement starts, in order", function () {
      var m = L().suite.marks("golden");
      expect(m).toHaveLength(5);
      expect(m[0].at).toBe(0);
      expect(m.every(function (x, i) { return !i || x.at > m[i - 1].at; })).toBe(true);
      expect(m[4].name).toBe("V · home");
    });
    it("exposes player controls", function () {
      ["pause", "resume", "prev", "next", "seekTime", "skip", "setLoop", "volume"].forEach(function (k) { expect(typeof L()[k]).toBe("function"); });
      expect(L().isPaused()).toBe(false);
    });
    it("names each theme's suite", function () {
      expect(L().catalog().map(function (t) { return t.songs[5].title; })).toEqual(["Root Access", "The Long Night", "Alchemy"]);
    });
    it("runs the movements theme → chase → standoff → lowest → epilogue", function () {
      expect(L().suite.movements.map(function (m) { return m.si; })).toEqual([0, 1, 3, 2, 4]);
      expect(P()._order).toEqual([0, 1, 3, 2, 4]);
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
})();
