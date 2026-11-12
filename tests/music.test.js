/* Tests: the soundtrack loads on demand (assets/js/music.js), in an iframe with a fake lofi.js. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function frame() {
    return new Promise(function (ok) {
      var f = document.createElement("iframe");
      f.className = "fixture";
      f.src = "fixtures/music.html?" + Math.random();
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
})();
