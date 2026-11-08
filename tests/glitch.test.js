/* Tests: glitch.js (full-screen, rare) and textglitch.js (header warps, frequent) */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, beforeEach = T.beforeEach, afterEach = T.afterEach;
  var G = window.SamukaGlitch, TG = window.SamukaTextGlitch;
  var stage = null;

  function signIn(role) { window.dispatchEvent(new CustomEvent("samuka:auth", { detail: { user: role === "guest" ? null : { id: "x" }, role: role, profile: {} } })); }
  // a visible stage at the top of the viewport, shaped like a page (#main is the real page's id, so a class stands in)
  beforeEach(function () {
    stage = document.createElement("div");
    stage.style.cssText = "position:fixed;top:60px;left:0;width:900px;background:transparent;z-index:-1";
    document.body.appendChild(stage);
    signIn("user");
  });
  afterEach(function () {
    document.querySelectorAll(".tg-ghost").forEach(function (g) { g.remove(); });
    stage.remove();
    signIn("guest");   // stops the timers
  });

  describe("glitch timing", function () {
    it("full-screen glitches are rare: first after 1.5 min, then every 6 to 12 min", function () {
      expect(G.delays.first).toEqual([90, 150]);
      expect(G.delays.next).toEqual([360, 720]);
    });
    it("header warps come much more often: within 10 s of a page, then every 15 to 35 s", function () {
      expect(TG.delays.first).toEqual([5, 10]);
      expect(TG.delays.next).toEqual([15, 35]);
    });
    it("even the slowest header warp comes well before the fastest full-screen one", function () {
      expect(G.delays.next[0]).toBeGreaterThan(TG.delays.next[1] * 10);
      expect(G.delays.first[0]).toBeGreaterThan(TG.delays.first[1] * 5);
    });
  });

  describe("header warps target the page's headings", function () {
    it("picks a short, one-line section title", function () {
      stage.innerHTML = '<h2 class="section__title">Leaderboards</h2>';
      expect(TG._targets().map(function (e) { return e.textContent; })).toEqual(["Leaderboards"]);
      expect(TG.fire(true)).toBe(true);
      var g = document.querySelector(".tg-ghost");
      expect(g.parentElement.textContent.indexOf("Leaderboards")).toBe(0);
      expect(g.getAttribute("aria-hidden")).toBe("true");
    });
    it("prefers headings over smaller bits like role lines and code", function () {
      stage.innerHTML = '<p class="hero__role">Senior engineer</p><h2 class="section__title">Skills</h2>';
      for (var i = 0; i < 5; i++) {
        document.querySelectorAll(".tg-ghost").forEach(function (g) { g.remove(); });
        TG.fire(true);
        expect(document.querySelector(".tg-ghost").parentElement.className).toContain("section__title");
      }
    });
    it("falls back to the smaller bits when a page has no usable heading", function () {
      stage.innerHTML = '<p class="hero__role">Senior engineer</p>';
      expect(TG.fire(true)).toBe(true);
      expect(document.querySelector(".tg-ghost").parentElement.className).toContain("hero__role");
    });
    it("skips long or wrapping headings, where the overlay wouldn't line up", function () {
      stage.innerHTML = '<h2 class="section__title">' + "a very long heading ".repeat(4) + "</h2>" +
        '<h2 class="section__title" style="width:60px">two words</h2>';
      expect(TG._targets()).toEqual([]);
    });
    it("skips headings inside leaderboards, player cards and dialogs", function () {
      stage.innerHTML = '<div class="lb"><h2 class="section__title">Board</h2></div><div class="pcard"><h2 class="section__title">neo</h2></div>';
      expect(TG._targets()).toEqual([]);
    });
    it("skips headings that are off screen", function () {
      stage.innerHTML = '<h2 class="section__title" style="position:relative;top:4000px">Below</h2>';
      expect(TG._targets()).toEqual([]);
    });
    it("never runs for guests", function () {
      signIn("guest");
      stage.innerHTML = '<h2 class="section__title">Skills</h2>';
      expect(TG.fire(true)).toBe(false);
    });
    it("cleans up: the overlay is removed and the heading restored", async function () {
      stage.innerHTML = '<h2 class="section__title">Events</h2>';
      var h = stage.querySelector("h2");
      TG.fire(true);
      expect(h.classList.contains("tg-host")).toBe(true);
      await new Promise(function (r) { setTimeout(r, 500); });
      expect(h.querySelector(".tg-ghost")).toBe(null);
      expect(h.classList.contains("tg-host")).toBe(false);
      expect(h.textContent).toBe("Events");
    });
  });
})();
