/* Tests: the sidebar "home" logo follows the theme (_includes/theme-logo.html + features.css).
 * The include and the real stylesheet are loaded into an iframe, then each skin is switched on. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;

  async function frame() {
    var fetchText = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.text(); }); };
    var parts = await Promise.all([fetchText("../_includes/theme-logo.html"), fetchText("../_includes/ruby.svg")]);
    var logo = parts[0].replace("{% include ruby.svg %}", parts[1]);
    var f = document.createElement("iframe");
    f.className = "fixture";
    f.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="' + new URL("../assets/css/features.css", location.href).href + '"></head>' +
      '<body><a class="tree__home" href="/"><span class="tree__logo">' + logo + "</span>home</a></body></html>";
    await new Promise(function (r) { f.onload = r; document.body.appendChild(f); });
    return f;
  }
  function shown(doc) {
    return Array.prototype.filter.call(doc.querySelectorAll(".theme-logo__mark"), function (m) { return doc.defaultView.getComputedStyle(m).display !== "none"; })
      .map(function (m) { return m.className.replace(/.*theme-logo--/, ""); });
  }

  describe("home logo follows the theme", function () {
    it("shows exactly one logo per skin: ruby, bat, bunny, terminal", async function () {
      var f = await frame(), doc = f.contentDocument, root = doc.documentElement;
      try {
        var seen = {};
        [["", "phthalo"], ["phthalo", "phthalo"], ["knight", "knight"], ["golden", "golden"], ["crt", "crt"]].forEach(function (c) {
          if (c[0]) root.dataset.skin = c[0]; else delete root.dataset.skin;
          seen[c[0] || "(none)"] = shown(doc);
        });
        expect(seen).toEqual({ "(none)": ["phthalo"], phthalo: ["phthalo"], knight: ["knight"], golden: ["golden"], crt: ["crt"] });
      } finally { f.remove(); }
    });
    it("an unknown skin falls back to the ruby", async function () {
      var f = await frame();
      try {
        f.contentDocument.documentElement.dataset.skin = "mystery";
        expect(shown(f.contentDocument)).toEqual(["phthalo"]);
      } finally { f.remove(); }
    });
    it("the link reads 'home' and the logos are decorative", async function () {
      var f = await frame(), a = f.contentDocument.querySelector(".tree__home");
      try {
        expect(a.textContent.trim()).toBe("home");
        expect(a.querySelector(".theme-logo").getAttribute("aria-hidden")).toBe("true");
        expect(a.querySelectorAll(".theme-logo__mark svg").length).toBe(4);
      } finally { f.remove(); }
    });
  });
})();
