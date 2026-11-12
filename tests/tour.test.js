/* Tests: the first-visit tour (assets/js/tour.js). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var Tr = window.SamukaTour;

  describe("first-visit tour: when it starts", function () {
    var base = { lobby: true, stored: null, played: false, forced: false, challenge: false };
    function go(over) { var c = Object.assign({}, base, over || {}); return Tr.shouldStart(c); }
    it("starts for a brand-new visitor on the home page", function () { expect(go()).toBe(true); });
    it("never again once done", function () { expect(go({ stored: "done" })).toBe(false); });
    it("not for someone who has already played", function () { expect(go({ played: true })).toBe(false); });
    it("not when they arrived through a challenge link", function () { expect(go({ challenge: true })).toBe(false); });
    it("only on the home page", function () { expect(go({ lobby: false })).toBe(false); expect(go({ lobby: false, forced: true })).toBe(false); });
    it("?tour=1 replays it even when done", function () { expect(go({ stored: "done", played: true, forced: true })).toBe(true); });
    it("has three steps", function () { expect(Tr.steps.length).toBe(3); });
  });

  describe("first-visit tour: walking through", function () {
    var fx, saved;
    function setup() {
      try { saved = localStorage.getItem("samuka-tour"); localStorage.removeItem("samuka-tour"); } catch (e) {}
      fx = document.createElement("div");
      fx.innerHTML = '<div class="lobby__actions"><a href="#play">pick a game</a></div><nav class="tabs"><a href="/events/">Today</a></nav><button data-account>sign in</button>';
      document.getElementById("sandbox").appendChild(fx);
    }
    function teardown() {
      Tr.end(); fx.remove();
      try { if (saved == null) localStorage.removeItem("samuka-tour"); else localStorage.setItem("samuka-tour", saved); } catch (e) {}
    }
    it("goes play → Today → your stuff, then remembers it's done", function () {
      setup();
      try {
        Tr.start();
        var box = document.querySelector(".tour");
        expect(!!box).toBe(true);
        expect(Tr.step()).toBe(0);
        expect(fx.querySelector('a[href="#play"]').classList.contains("tour-target")).toBe(true);
        expect(box.textContent).toContain("1 / 3");
        box.querySelector("[data-tour-next]").click();
        expect(Tr.step()).toBe(1);
        document.querySelector(".tour [data-tour-next]").click();
        expect(Tr.step()).toBe(2);
        expect(document.querySelector(".tour [data-tour-skip]")).toBe(null);
        expect(document.querySelector(".tour [data-tour-next]").textContent).toBe("done");
        document.querySelector(".tour [data-tour-next]").click();
        expect(document.querySelector(".tour")).toBe(null);
        expect(localStorage.getItem("samuka-tour")).toBe("done");
        expect(document.querySelectorAll(".tour-target").length).toBe(0);
      } finally { teardown(); }
    });
    it("skip ends it for good", function () {
      setup();
      try {
        Tr.start();
        document.querySelector(".tour [data-tour-skip]").click();
        expect(document.querySelector(".tour")).toBe(null);
        expect(localStorage.getItem("samuka-tour")).toBe("done");
      } finally { teardown(); }
    });
    it("Escape ends it too", function () {
      setup();
      try {
        Tr.start();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(document.querySelector(".tour")).toBe(null);
      } finally { teardown(); }
    });
  });
})();
