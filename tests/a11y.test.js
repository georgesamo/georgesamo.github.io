/* Tests: keyboard and screen-reader behaviour - the focus trap and announcer (assets/js/a11y.js),
 * the phone "more" sheet (hub.js), the first-visit tour (tour.js) and the Feeds menu (feeds.js). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var A = window.SamukaA11y;

  function key(k, shift) {
    var e = new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true, cancelable: true });
    (document.activeElement || document.body).dispatchEvent(e);
    return e;
  }
  function fixture(html) {
    var fx = document.createElement("div");
    fx.innerHTML = html;
    document.getElementById("sandbox").appendChild(fx);
    return fx;
  }

  describe("a11y: Tab stays inside an open modal dialog", function () {
    var html = '<button data-out>outside</button><div role="dialog" aria-modal="true" data-dlg>' +
      '<button data-a>a</button><a href="#x" data-b>b</a><button disabled>off</button><button hidden>gone</button><button data-c>c</button></div>';
    it("lists only what Tab can reach", function () {
      var fx = fixture(html);
      try {
        var list = A.focusables(fx.querySelector("[data-dlg]"));
        expect(list.length).toBe(3);
        expect(list[2]).toBe(fx.querySelector("[data-c]"));
      } finally { fx.remove(); }
    });
    it("Tab on the last control wraps to the first, Shift+Tab on the first wraps to the last", function () {
      var fx = fixture(html);
      try {
        fx.querySelector("[data-c]").focus();
        var e = key("Tab");
        expect(e.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(fx.querySelector("[data-a]"));
        key("Tab", true);
        expect(document.activeElement).toBe(fx.querySelector("[data-c]"));
      } finally { fx.remove(); }
    });
    it("Tab in the middle is left to the browser", function () {
      var fx = fixture(html);
      try {
        fx.querySelector("[data-a]").focus();
        expect(key("Tab").defaultPrevented).toBe(false);
      } finally { fx.remove(); }
    });
    it("focus outside the dialog is pulled back in", function () {
      var fx = fixture(html);
      try {
        fx.querySelector("[data-out]").focus();
        key("Tab");
        expect(document.activeElement).toBe(fx.querySelector("[data-a]"));
      } finally { fx.remove(); }
    });
    it("a hidden dialog doesn't trap anything", function () {
      var fx = fixture(html);
      try {
        fx.querySelector("[data-dlg]").hidden = true;
        fx.querySelector("[data-out]").focus();
        expect(key("Tab").defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(fx.querySelector("[data-out]"));
      } finally { fx.remove(); }
    });
  });

  describe("a11y: announcer and focus return", function () {
    it("announce() puts the text in a polite live region", function () {
      A.announce("Leaderboards · Samuka");
      var live = document.querySelector("[data-announcer]");
      expect(live.getAttribute("aria-live")).toBe("polite");
      return new Promise(function (r) { setTimeout(r, 120); }).then(function () {
        expect(live.textContent).toBe("Leaderboards · Samuka");
      });
    });
    it("restore() falls back to the phone \"more\" button when the opener has gone", function () {
      var fx = fixture('<button data-mnav-more>more</button><button data-gone>x</button>');
      try {
        var gone = fx.querySelector("[data-gone]"); gone.remove();
        expect(A.restore(gone)).toBe(fx.querySelector("[data-mnav-more]"));
        expect(document.activeElement).toBe(fx.querySelector("[data-mnav-more]"));
        var here = document.createElement("button"); fx.appendChild(here);
        expect(A.restore(here)).toBe(here);
      } finally { fx.remove(); }
    });
  });

  describe("phone \"more\" sheet: keyboard", function () {
    var html = '<nav><button type="button" data-mnav-more aria-expanded="false" aria-controls="msheet">more</button></nav>' +
      '<div class="msheet" id="msheet" hidden><div class="msheet__backdrop" data-mnav-close style="height:4px"></div>' +
      '<div class="msheet__card" role="dialog" aria-modal="true" aria-label="More"><a href="#lb">Leaderboards</a><a href="#about">About</a><button type="button" data-x>Search</button></div></div>';
    it("opens with focus on the first item; Tab wraps inside", function () {
      var fx = fixture(html), more = fx.querySelector("[data-mnav-more]"), sheet = fx.querySelector("#msheet");
      try {
        more.focus(); more.click();
        expect(sheet.hidden).toBe(false);
        expect(more.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement.textContent).toBe("Leaderboards");
        fx.querySelector("[data-x]").focus();
        key("Tab");
        expect(document.activeElement.textContent).toBe("Leaderboards");
      } finally { fx.remove(); }
    });
    it("Esc closes it and gives focus back to \"more\"", function () {
      var fx = fixture(html), more = fx.querySelector("[data-mnav-more]"), sheet = fx.querySelector("#msheet");
      try {
        more.focus(); more.click();
        key("Escape");
        expect(sheet.hidden).toBe(true);
        expect(more.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(more);
      } finally { fx.remove(); }
    });
    it("the backdrop and the button itself close it too", function () {
      var fx = fixture(html), more = fx.querySelector("[data-mnav-more]"), sheet = fx.querySelector("#msheet");
      try {
        more.click(); fx.querySelector("[data-mnav-close]").click();
        expect(sheet.hidden).toBe(true);
        expect(more.getAttribute("aria-expanded")).toBe("false");
        more.click(); more.click();
        expect(sheet.hidden).toBe(true);
        expect(document.activeElement).toBe(more);
      } finally { fx.remove(); }
    });
  });

  describe("first-visit tour: keyboard", function () {
    var Tr = window.SamukaTour, saved;
    function setup() {
      try { saved = localStorage.getItem("samuka-tour"); } catch (e) {}
      return fixture('<button data-before>before</button><div class="lobby__actions"><a href="#play">pick a game</a></div><nav class="tabs"><a href="/events/">Today</a></nav><button data-account>sign in</button>');
    }
    function teardown(fx) {
      Tr.end(); fx.remove();
      try { if (saved == null) localStorage.removeItem("samuka-tour"); else localStorage.setItem("samuka-tour", saved); } catch (e) {}
    }
    it("is a labelled modal dialog with focus on \"next\", and keeps it there step to step", function () {
      var fx = setup();
      try {
        fx.querySelector("[data-before]").focus();
        Tr.start();
        var box = document.querySelector(".tour");
        expect(box.getAttribute("aria-modal")).toBe("true");
        expect(document.getElementById(box.getAttribute("aria-labelledby")).textContent).toBe("Play right away");
        expect(!!document.getElementById(box.getAttribute("aria-describedby"))).toBe(true);
        expect(document.activeElement).toBe(box.querySelector("[data-tour-next]"));
        document.activeElement.click();
        expect(Tr.step()).toBe(1);
        expect(document.activeElement).toBe(box.querySelector("[data-tour-next]"));
      } finally { teardown(fx); }
    });
    it("Tab cycles between skip and next only", function () {
      var fx = setup();
      try {
        Tr.start();
        key("Tab");   // next is last: wraps to skip
        expect(document.activeElement.hasAttribute("data-tour-skip")).toBe(true);
        key("Tab", true);
        expect(document.activeElement.hasAttribute("data-tour-next")).toBe(true);
      } finally { teardown(fx); }
    });
    it("Esc ends it and returns focus to where it was", function () {
      var fx = setup();
      try {
        var before = fx.querySelector("[data-before]");
        before.focus();
        Tr.start();
        key("Escape");
        expect(document.querySelector(".tour")).toBe(null);
        expect(document.activeElement).toBe(before);
        expect(localStorage.getItem("samuka-tour")).toBe("done");
      } finally { teardown(fx); }
    });
  });

  describe("Feeds menu: keyboard", function () {
    var F = window.SamukaFeeds;
    var html = '<button type="button" data-feeds-btn aria-haspopup="true" aria-expanded="false" aria-controls="feeds-menu">Feeds</button>' +
      '<div id="feeds-menu" role="menu" hidden><a role="menuitem" tabindex="-1" href="#n">News</a><a role="menuitem" tabindex="-1" href="#t">Trailers</a></div>';
    it("Enter/Space (a keyboard click) opens it on the first item", function () {
      var fx = fixture(html), b = fx.querySelector("[data-feeds-btn]");
      try {
        b.focus(); b.click();   // .click() has detail 0, like Enter or Space on a button
        expect(b.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement.textContent).toBe("News");
      } finally { F.close(false); fx.remove(); }
    });
    it("Tab closes it", function () {
      var fx = fixture(html), b = fx.querySelector("[data-feeds-btn]");
      try {
        b.focus(); b.click(); key("Tab");
        expect(fx.querySelector("#feeds-menu").hidden).toBe(true);
        expect(b.getAttribute("aria-expanded")).toBe("false");
      } finally { F.close(false); fx.remove(); }
    });
  });
})();
