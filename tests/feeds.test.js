/* Tests: the desktop Feeds tab menu (assets/js/feeds.js). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var F = window.SamukaFeeds;

  describe("Feeds tab menu", function () {
    var fx;
    function setup() {
      fx = document.createElement("div");
      fx.innerHTML = '<button type="button" data-feeds-btn aria-expanded="false" aria-controls="feeds-menu">Feeds</button>' +
        '<div id="feeds-menu" role="menu" hidden><a role="menuitem" tabindex="-1" href="#n">News</a><a role="menuitem" tabindex="-1" href="#t" class="is-here">Trailers</a><a role="menuitem" tabindex="-1" href="#u">What\'s new</a><a role="menuitem" tabindex="-1" href="#b">Blog</a></div>';
      document.getElementById("sandbox").appendChild(fx);
      return { b: fx.querySelector("[data-feeds-btn]"), m: fx.querySelector("#feeds-menu") };
    }
    function teardown() { F.close(false); fx.remove(); }
    function key(k) { document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); }

    it("opens and closes on click", function () {
      var x = setup();
      try {
        x.b.click();
        expect(x.m.hidden).toBe(false);
        expect(x.b.getAttribute("aria-expanded")).toBe("true");
        x.b.click();
        expect(x.m.hidden).toBe(true);
        expect(x.b.getAttribute("aria-expanded")).toBe("false");
      } finally { teardown(); }
    });
    it("closes on a click outside", function () {
      var x = setup();
      try {
        x.b.click();
        document.body.click();
        expect(x.m.hidden).toBe(true);
      } finally { teardown(); }
    });
    it("keyboard: ↓ opens on the current page, arrows wrap, Esc returns to the tab", function () {
      var x = setup();
      try {
        x.b.focus(); key("ArrowDown");
        expect(x.m.hidden).toBe(false);
        expect(document.activeElement.textContent).toBe("Trailers");
        key("ArrowDown"); expect(document.activeElement.textContent).toBe("What's new");
        key("ArrowDown"); key("ArrowDown"); expect(document.activeElement.textContent).toBe("News");
        key("ArrowUp"); expect(document.activeElement.textContent).toBe("Blog");
        key("Escape");
        expect(x.m.hidden).toBe(true);
        expect(document.activeElement).toBe(x.b);
      } finally { teardown(); }
    });
    it("choosing a link closes the menu", function () {
      var x = setup();
      try {
        x.b.click();
        var a = x.m.querySelector('a[href="#b"]');
        a.addEventListener("click", function (e) { e.preventDefault(); }, { once: true });
        a.click();
        expect(x.m.hidden).toBe(true);
      } finally { teardown(); }
    });
  });
})();
