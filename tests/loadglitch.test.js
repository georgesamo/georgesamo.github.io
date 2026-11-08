/* Tests: loadglitch.js (page-load title scratch) and the optimized full-page scenes (glitch.js) */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, beforeEach = T.beforeEach, afterEach = T.afterEach;
  var L = window.SamukaLoadGlitch, G = window.SamukaGlitch;
  var stage = null, savedAuth;
  function seq(values) { var i = 0; return function () { return values[i++ % values.length]; }; }

  describe("page-load glitch: letter decode", function () {
    it("keeps the decoded prefix and scrambles the rest", function () {
      var out = L.scrambleFrame("Leaderboards", 0.5, seq([0]));
      expect(out.slice(0, 6)).toBe("Leader");
      expect(out.slice(6)).toBe("!!!!!!");   // rnd 0 → first glyph
      expect(out.length).toBe(12);
    });
    it("is all noise at the start and the real text at the end", function () {
      expect(L.scrambleFrame("abc", 0, seq([0]))).toBe("!!!");
      expect(L.scrambleFrame("abc", 1)).toBe("abc");
      expect(L.scrambleFrame("abc", 7)).toBe("abc");      // clamped
      expect(L.scrambleFrame("abc", -1, seq([0]))).toBe("!!!");
    });
    it("never scrambles spaces, so words keep their shape", function () {
      expect(L.scrambleFrame("my ranks", 0, seq([0.99]))).toMatch(/^\S\S \S{5}$/);
    });
    it("only decodes plain one-text titles", function () {
      var d = document.createElement("div");
      d.innerHTML = "<h2>Events</h2><h2>Hi <b>you</b></h2><h2>   </h2><h2>" + "x".repeat(80) + "</h2>";
      var h = d.querySelectorAll("h2");
      expect(L.plainText(h[0])).toBe(true);
      expect(L.plainText(h[1])).toBe(false);
      expect(L.plainText(h[2])).toBe(false);
      expect(L.plainText(h[3])).toBe(false);
    });
  });

  describe("page-load glitch: on a page", function () {
    beforeEach(function () {
      savedAuth = window.SamukaAuth;
      window.SamukaAuth = { profile: function () { return null; } };
      stage = document.createElement("div");
      stage.id = "main";   // the real page's main area
      stage.style.cssText = "position:fixed;top:60px;left:0;width:900px;z-index:-1";
      document.body.appendChild(stage);
    });
    afterEach(function () { L.finish(); stage.remove(); window.SamukaAuth = savedAuth; document.querySelectorAll(".lg-scan").forEach(function (s) { s.remove(); }); });

    it("finds the page title, skipping the hero and article headings", function () {
      stage.innerHTML = '<h1 class="hero__name"><span data-scramble>Samuka</span></h1><div class="prose"><h2>Intro</h2></div><h2 class="section__title">Skills</h2>';
      expect(L.findTitle().textContent).toBe("Skills");
    });
    it("scratches the title in, then restores it exactly", async function () {
      stage.innerHTML = '<h2 class="section__title">Leaderboards</h2>';
      var h = stage.querySelector("h2");
      expect(L.play()).toBe(true);
      expect(h.classList.contains("lg-scratch")).toBe(true);
      expect(h.getAttribute("data-lg")).toBe("Leaderboards");
      expect(h.getAttribute("aria-label")).toBe("Leaderboards");   // screen readers get the real title
      expect(document.querySelectorAll(".lg-scan").length).toBe(1);
      await new Promise(function (r) { setTimeout(r, L.duration + 200); });
      expect(L.isRunning()).toBe(false);
      expect(h.textContent).toBe("Leaderboards");
      expect(h.classList.contains("lg-scratch")).toBe(false);
      expect(h.hasAttribute("aria-label")).toBe(false);
      expect(h.hasAttribute("data-lg")).toBe(false);
      expect(document.querySelectorAll(".lg-scan").length).toBe(0);
    });
    it("keeps a title's own aria-label", function () {
      stage.innerHTML = '<h2 class="section__title" aria-label="All events">Events</h2>';
      L.play(); L.finish();
      expect(stage.querySelector("h2").getAttribute("aria-label")).toBe("All events");
    });
    it("a new page cancels the running one and restores its text", function () {
      stage.innerHTML = '<h2 class="section__title">First</h2>';
      var first = stage.querySelector("h2");
      L.play();
      first.firstChild.nodeValue = "#!?";            // mid-scramble
      var other = document.createElement("h1"); other.textContent = "Second"; stage.prepend(other);
      L.play(other);
      expect(first.textContent).toBe("First");
      expect(first.classList.contains("lg-scratch")).toBe(false);
      expect(other.classList.contains("lg-scratch")).toBe(true);
    });
    it("titles with markup get the scratch but keep their markup", function () {
      stage.innerHTML = '<h2 class="section__title">Hi <b>you</b></h2>';
      var h = stage.querySelector("h2");
      expect(L.play()).toBe(true);
      expect(h.innerHTML).toBe("Hi <b>you</b>");
      L.finish();
      expect(h.innerHTML).toBe("Hi <b>you</b>");
    });
    it("respects 'glitches off' in the account", function () {
      window.SamukaAuth = { profile: function () { return { glitches: false }; } };
      stage.innerHTML = '<h2 class="section__title">Events</h2>';
      expect(L.play()).toBe(false);
      expect(stage.querySelector(".lg-scratch")).toBe(null);
    });
    it("runs for guests too (every theme, everyone)", function () {
      window.SamukaAuth = undefined;
      stage.innerHTML = '<h2 class="section__title">Events</h2>';
      expect(L.play()).toBe(true);
    });
    it("does nothing on a page without a title", function () {
      stage.innerHTML = "<p>no heading here</p>";
      expect(L.play()).toBe(false);
    });
  });

  describe("full-page scenes: optimized", function () {
    function dom(html) { var d = document.createElement("div"); d.innerHTML = html; return d; }
    it("bat sigils are cached images, not live SVG filters", function () {
      var d = dom(G._scene("knight", "dark"));
      expect(d.querySelectorAll("filter").length).toBe(0);
      expect(d.querySelectorAll(".gk-sigil img").length).toBe(15);
      expect(d.querySelectorAll(".gk-signal img").length).toBe(1);
      var srcs = {};
      d.querySelectorAll("img").forEach(function (i) { srcs[i.getAttribute("src")] = 1; });
      expect(Object.keys(srcs).length).toBe(3);    // three grit variants, reused
    });
    it("the image keeps the grit texture and glow, in the mode's colours", function () {
      var dark = decodeURIComponent(G._sigilSrc("dark", 0)), light = decodeURIComponent(G._sigilSrc("light", 0));
      expect(dark).toContain("feTurbulence");
      expect(dark).toContain("feDropShadow");
      expect(dark).toContain("#e5383b");
      expect(light).toContain("#a4161a");
      expect(G._sigilSrc("dark", 1)).not.toBe(G._sigilSrc("dark", 0));
      expect(G._sigilSrc("dark", 0)).toBe(G._sigilSrc("dark", 0));   // cached
    });
    it("the image is a valid SVG that the browser can decode", async function () {
      var img = new Image();
      await new Promise(function (ok, bad) { img.onload = ok; img.onerror = function () { bad(new Error("sigil image failed to load")); }; img.src = G._sigilSrc("dark", 2); });
      expect(img.naturalWidth).toBeGreaterThan(0);
    });
    it("the golden scene still has its sparks, hearts and lightsticks", function () {
      var d = dom(G._scene("golden"));
      expect(d.querySelectorAll(".gg-spark").length).toBe(18);
      expect(d.querySelectorAll(".gg-heart").length).toBe(10);
      expect(d.querySelectorAll(".gg-row i").length).toBe(78);
    });
  });
})();
