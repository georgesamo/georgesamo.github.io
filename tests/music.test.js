/* Tests: the soundtrack loads on demand (assets/js/music.js), in an iframe with a fake lofi.js. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function frame(src) {
    return new Promise(function (ok) {
      var f = document.createElement("iframe"), u = src || "fixtures/music.html";
      f.className = "fixture";
      f.src = u + (u.indexOf("?") > -1 ? "&" : "?") + Math.random();
      f.onload = function () { ok(f); };
      document.body.appendChild(f);
    });
  }
  async function until(fn) { for (var i = 0; i < 60 && !fn(); i++) await wait(50); return fn(); }

  describe("soundtrack loads on demand", function () {
    it("shows a stand-in ♪ and doesn't load the player up front", async function () {
      var f = await frame(), w = f.contentWindow, d = f.contentDocument;
      try {
        expect(d.querySelectorAll(".lofi-btn").length).toBe(1);
        expect(!!d.querySelector(".lofi-btn.lofi-stub")).toBe(true);
        expect(!!w.SamukaLofi).toBe(false);
        expect(w.SamukaMusic.loaded()).toBe(false);
      } finally { f.remove(); }
    });
    it("first ♪ click loads it, swaps in the real button and passes the click on", async function () {
      var f = await frame(), w = f.contentWindow, d = f.contentDocument;
      try {
        var ready = 0; w.addEventListener("samuka:music-ready", function () { ready++; });
        d.querySelector(".lofi-stub").click();
        expect(await until(function () { return !!w.SamukaLofi && w.__lofiCalls.indexOf("click") > -1; })).toBe(true);
        expect(d.querySelector(".lofi-stub")).toBe(null);
        expect(d.querySelectorAll(".lofi-btn").length).toBe(1);
        expect(ready).toBe(1);
      } finally { f.remove(); }
    });
    it("hovering ♪ starts loading before the click", async function () {
      var f = await frame(), w = f.contentWindow, d = f.contentDocument;
      try {
        d.querySelector(".lofi-stub").dispatchEvent(new w.PointerEvent("pointerover", { bubbles: true }));
        expect(await until(function () { return !!w.SamukaLofi; })).toBe(true);
        expect(w.__lofiCalls).toEqual([]);   // loaded, nothing played
      } finally { f.remove(); }
    });
    it("ready() loads it and hands it over", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        var got = null;
        w.SamukaMusic.ready(function (L) { got = L; });
        expect(await until(function () { return !!got; })).toBe(true);
        expect(got).toBe(w.SamukaLofi);
      } finally { f.remove(); }
    });
    it("a finished run unlocks its bonus track even before the player was loaded", async function () {
      var saved = localStorage.getItem("samuka-suite");
      try {
        localStorage.setItem("samuka-suite", JSON.stringify({ bonus: { sidekiq: 1 } }));
        var f = await frame(), w = f.contentWindow;
        try {
          w.dispatchEvent(new w.CustomEvent("samuka:game", { detail: { game: "sidekiq", name: "over" } }));
          await wait(300);
          expect(!!w.SamukaLofi).toBe(false);   // already unlocked: nothing to load
          w.dispatchEvent(new w.CustomEvent("samuka:game", { detail: { game: "gems", name: "start" } }));
          await wait(300);
          expect(!!w.SamukaLofi).toBe(false);   // only a finished run counts
          w.dispatchEvent(new w.CustomEvent("samuka:game", { detail: { game: "gems", name: "over" } }));
          expect(await until(function () { return !!w.__lofiCalls && w.__lofiCalls.indexOf("unlock:gems") > -1; })).toBe(true);
        } finally { f.remove(); }
      } finally { if (saved == null) localStorage.removeItem("samuka-suite"); else localStorage.setItem("samuka-suite", saved); }
    });
  });

  /* Regression: bonus tracks earned before lofi.js has loaded (999624a). bundle install on Samuka's page used to
   * read window.SamukaLofi directly and silently skip The Monologue when the soundtrack wasn't loaded yet. */
  describe("bonus unlocks before the soundtrack has loaded", function () {
    // the real lofi.js keeps unlocks in localStorage, shared with this page: start clean, put it back after
    async function withSuite(value, fn) {
      var saved = localStorage.getItem("samuka-suite");
      try { localStorage.setItem("samuka-suite", JSON.stringify(value)); return await fn(); }
      finally { if (saved == null) localStorage.removeItem("samuka-suite"); else localStorage.setItem("samuka-suite", saved); }
    }
    function count(list, x) { return (list || []).filter(function (c) { return c === x; }).length; }
    function out(d) { return d.querySelector("[data-bundle-out]").textContent; }
    function monologue(L) { return L.bonus.list().filter(function (b) { return b.game === "bundle"; })[0]; }

    it("bundle install loads the soundtrack, then unlocks the bonus gem", async function () {
      var f = await frame("fixtures/bundle.html"), w = f.contentWindow, d = f.contentDocument;
      try {
        expect(!!w.SamukaLofi).toBe(false);
        d.querySelector("[data-bundle]").click();
        expect(await until(function () { return count(w.__lofiCalls, "unlock:bundle") > 0; })).toBe(true);
        expect(await until(function () { return /Installing monologue/.test(out(d)); })).toBe(true);
        expect(w.__lofiLoads).toBe(1);
        expect(count(w.__lofiCalls, "unlock:bundle")).toBe(1);
      } finally { f.remove(); }
    });
    it("with the real lofi.js, that unlock opens track 11 · The Monologue", async function () {
      await withSuite({}, async function () {
        var f = await frame("fixtures/bundle.html?real"), w = f.contentWindow, d = f.contentDocument;
        try {
          expect(!!w.SamukaLofi).toBe(false);
          d.querySelector("[data-bundle]").click();
          expect(await until(function () { return !!w.SamukaLofi && w.SamukaLofi.bonus.open("bundle"); })).toBe(true);
          var m = monologue(w.SamukaLofi);
          expect(m.si).toBe(10);   // listed as track 11
          expect(m.titles.phthalo).toBe("The Monologue");
          expect(m.open).toBe(true);
          expect(JSON.parse(localStorage.getItem("samuka-suite")).bonus.bundle).toBe(1);
          expect(await until(function () { return /Installing monologue/.test(out(d)); })).toBe(true);
          expect(d.querySelectorAll('script[src*="lofi.js"]').length).toBe(1);
        } finally { f.remove(); }
      });
    });
    it("a game-over bonus loads the real lofi.js once, then unlocks that game's track", async function () {
      await withSuite({}, async function () {
        var f = await frame("fixtures/bundle.html?real"), w = f.contentWindow, d = f.contentDocument;
        try {
          expect(!!w.SamukaLofi).toBe(false);
          w.dispatchEvent(new w.CustomEvent("samuka:game", { detail: { game: "pitwall", name: "over" } }));
          expect(await until(function () { return !!w.SamukaLofi && w.SamukaLofi.bonus.open("pitwall"); })).toBe(true);
          var b = w.SamukaLofi.bonus.list().filter(function (x) { return x.game === "pitwall"; })[0];
          expect(b.open).toBe(true);
          expect(w.SamukaLofi.bonus.open("bundle")).toBe(false);   // only the game that was finished
          expect(d.querySelectorAll('script[src*="lofi.js"]').length).toBe(1);
        } finally { f.remove(); }
      });
    });
    it("a game-over bonus before load unlocks once and loads once", async function () {
      await withSuite({}, async function () {
        var f = await frame("fixtures/bundle.html"), w = f.contentWindow;
        try {
          w.dispatchEvent(new w.CustomEvent("samuka:game", { detail: { game: "schema", name: "over" } }));
          expect(await until(function () { return count(w.__lofiCalls, "unlock:schema") > 0; })).toBe(true);
          await wait(200);
          expect(w.__lofiLoads).toBe(1);
          expect(count(w.__lofiCalls, "unlock:schema")).toBe(1);
        } finally { f.remove(); }
      });
    });
    it("if the soundtrack is already loaded, bundle install unlocks at once without loading it again", async function () {
      var f = await frame("fixtures/bundle.html"), w = f.contentWindow, d = f.contentDocument;
      try {
        await w.SamukaMusic.load();
        expect(w.__lofiLoads).toBe(1);
        var before = w.__lofiCalls.length;
        d.querySelector("[data-bundle]").click();
        expect(await until(function () { return /Bundle complete/.test(out(d)); })).toBe(true);
        // same tick as "Bundle complete!": no load to wait for
        expect(out(d)).toMatch(/Installing monologue/);
        expect(w.__lofiCalls.slice(before)).toEqual(["unlock:bundle"]);
        await wait(200);
        expect(w.__lofiLoads).toBe(1);
        expect(d.querySelectorAll('script[src*="lofi.js"]').length).toBe(1);
      } finally { f.remove(); }
    });
    it("a second bundle install doesn't announce the gem again", async function () {
      var f = await frame("fixtures/bundle.html"), w = f.contentWindow, d = f.contentDocument;
      try {
        var btn = d.querySelector("[data-bundle]");
        btn.click();
        expect(await until(function () { return /Installing monologue/.test(out(d)); })).toBe(true);
        expect(await until(function () { return !btn.disabled; })).toBe(true);
        btn.click();
        expect(await until(function () { return count(w.__lofiCalls, "unlock:bundle") === 2; })).toBe(true);
        expect(out(d)).not.toMatch(/Installing monologue/);   // the output was reset and the gem is already open
        expect(w.__lofiLoads).toBe(1);
      } finally { f.remove(); }
    });
    it("ready() called several times before the load finishes runs every callback once", async function () {
      var f = await frame("fixtures/bundle.html"), w = f.contentWindow, d = f.contentDocument;
      try {
        var runs = [0, 0, 0], got = [];
        [0, 1, 2].forEach(function (i) { w.SamukaMusic.ready(function (L) { runs[i]++; got.push(L); }); });
        expect(runs).toEqual([0, 0, 0]);   // nothing yet: the script is still loading
        expect(await until(function () { return runs.every(function (n) { return n > 0; }); })).toBe(true);
        await wait(200);
        expect(runs).toEqual([1, 1, 1]);
        expect(got.every(function (L) { return L === w.SamukaLofi; })).toBe(true);
        expect(w.__lofiLoads).toBe(1);
        expect(d.querySelectorAll('script[src*="lofi.js"]').length).toBe(1);
        // once loaded, ready() runs straight away, and the earlier callbacks don't run again
        var late = 0; w.SamukaMusic.ready(function () { late++; });
        expect(late).toBe(1);
        expect(runs).toEqual([1, 1, 1]);
      } finally { f.remove(); }
    });
  });
})();
