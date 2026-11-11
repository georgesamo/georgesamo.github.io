/* Tests: the /settings/ page (assets/js/settings.js) and the links that lead to it. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var St = window.SamukaSettings, C = window.SamukaAccountCore;
  function dom(html) { var d = document.createElement("div"); d.innerHTML = html; return d; }
  function base(over) {
    var c = { mode: "dark", skin: "phthalo", skins: ["phthalo"], secretLeft: true, auth: true, user: false, name: "", role: "guest", glitches: true, cursors: null,
      music: { on: false, paused: false, vol: 0.6, shuffle: false, track: "" } };
    Object.keys(over || {}).forEach(function (k) { c[k] = over[k]; });
    return c;
  }

  describe("settings page markup", function () {
    it("has look, sound and account sections", function () {
      var d = dom(St.html(base()));
      expect([].map.call(d.querySelectorAll(".set__h"), function (h) { return h.id; })).toEqual(["set-look", "set-sound", "set-account"]);
    });
    it("checks the current mode and skin", function () {
      var d = dom(St.html(base({ mode: "light", skin: "knight", skins: ["phthalo", "knight"] })));
      expect(d.querySelector('input[name="mode"]:checked').value).toBe("light");
      expect(d.querySelector('input[name="skin"]:checked').value).toBe("knight");
    });
    it("says a guest's skin stays on this device", function () {
      expect(dom(St.html(base())).querySelector("#set-look").nextElementSibling.textContent).toContain("this device");
      expect(dom(St.html(base({ user: true, name: "neo", role: "user" }))).textContent).toContain("saved to your account");
    });
    it("shows volume, shuffle and a play button", function () {
      var d = dom(St.html(base({ music: { on: true, paused: false, vol: 0.35, shuffle: true, track: "Night Shift" } })));
      expect(d.querySelector("[data-set-volume]").value).toBe("35");
      expect(d.querySelector("[data-set-shuffle]").checked).toBe(true);
      expect(d.querySelector("[data-set-music]").getAttribute("aria-pressed")).toBe("true");
      expect(d.querySelector("[data-set-track]").textContent).toContain("Night Shift");
    });
    it("explains when music is missing", function () {
      var d = dom(St.html(base({ music: null })));
      expect(d.querySelector("[data-set-volume]")).toBe(null);
      expect(d.textContent).toContain("isn't available");
    });
    it("offers guests a sign-in", function () {
      var d = dom(St.html(base()));
      expect(d.querySelector('[data-me-act="signin"]')).toBeTruthy();
      expect(d.querySelector("[data-set-glitches]")).toBe(null);
      expect(d.querySelector('[data-me-act="export"]')).toBe(null);
    });
    it("gives signed-in players toggles and their data", function () {
      var d = dom(St.html(base({ user: true, name: "neo", role: "user", glitches: false, cursors: true })));
      expect(d.querySelector("[data-set-glitches]").checked).toBe(false);
      expect(d.querySelector("[data-set-cursors]").checked).toBe(true);
      expect(d.querySelector('[data-me-act="profile"]')).toBeTruthy();
      expect(d.querySelector('[data-me-act="export"]')).toBeTruthy();
      expect(d.querySelector('[data-me-act="delete"]')).toBeTruthy();
    });
    it("hides the cursor toggle when presence isn't loaded, and delete for the owner", function () {
      var d = dom(St.html(base({ user: true, name: "s", role: "samuka", cursors: null })));
      expect(d.querySelector("[data-set-cursors]")).toBe(null);
      expect(d.querySelector('[data-me-act="delete"]')).toBe(null);
    });
    it("escapes the player's name", function () {
      var d = dom(St.html(base({ user: true, name: "<b>x</b>", role: "user" })));
      expect(d.querySelector(".set__label b").textContent).toBe("<b>x</b>");
    });
  });

  describe("settings page controls", function () {
    var box, saved = {}, calls;
    function stub(name, obj) { saved[name] = window[name]; window[name] = obj; }
    function setup() {
      calls = [];
      stub("Samuka", { mode: function () { return "dark"; }, skin: function () { return "phthalo"; }, availableSkins: function () { return ["phthalo"]; },
        setMode: function (m) { calls.push("mode:" + m); }, setSkin: function (s) { calls.push("skin:" + s); } });
      var on = false, paused = false;
      stub("SamukaLofi", { isOn: function () { return on; }, isPaused: function () { return paused; }, track: function () { return on ? { name: "T" } : null; },
        start: function () { on = true; calls.push("start"); }, pause: function () { paused = true; calls.push("pause"); }, resume: function () { paused = false; calls.push("resume"); },
        volume: function (v) { if (v != null) calls.push("vol:" + v); return 0.5; }, shuffle: function (v) { if (v != null) calls.push("shuffle:" + v); return false; } });
      box = document.createElement("div"); box.setAttribute("data-settings", "");
      document.getElementById("sandbox").appendChild(box);
      St.paint();
    }
    function teardown() { box.remove(); Object.keys(saved).forEach(function (k) { window[k] = saved[k]; }); saved = {}; }
    function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

    it("switches mode through app.js", function () {
      setup();
      try {
        var r = box.querySelector('input[name="mode"][value="light"]'); r.checked = true; fire(r, "change");
        expect(calls).toEqual(["mode:light"]);
      } finally { teardown(); }
    });
    it("plays, pauses and resumes the music", function () {
      setup();
      try {
        box.querySelector("[data-set-music]").click();
        box.querySelector("[data-set-music]").click();
        box.querySelector("[data-set-music]").click();
        expect(calls).toEqual(["start", "pause", "resume"]);
      } finally { teardown(); }
    });
    it("sets volume and shuffle", function () {
      setup();
      try {
        var v = box.querySelector("[data-set-volume]"); v.value = "20"; fire(v, "input");
        expect(box.querySelector("[data-set-vol-n]").textContent).toBe("20%");
        var s = box.querySelector("[data-set-shuffle]"); s.checked = true; fire(s, "change");
        expect(calls).toEqual(["vol:0.2", "shuffle:true"]);
      } finally { teardown(); }
    });
  });

  describe("links to settings", function () {
    it("avatar menu, phone sheet and search all lead there", function () {
      var m = C.menuItems({ name: "neo", role: "user" }).filter(function (i) { return i.key === "settings"; })[0];
      expect(m.href).toBe("/settings/");
      expect(dom(C.sheetHtml({ enabled: true, signedIn: true, name: "neo", role: "user" })).querySelector('a[href="/settings/"]')).toBeTruthy();
      var p = C.searchPalette(C.paletteItems({ games: [] }), "volume");
      expect(p[0].href).toBe("/settings/");
    });
  });
})();
