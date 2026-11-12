/* Tests: client error reporting (assets/js/errors.js), in an iframe whose reports are captured, not sent. */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect, beforeEach = T.beforeEach;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function frame(query) {
    return new Promise(function (ok) {
      var f = document.createElement("iframe");
      f.className = "fixture";
      f.src = "fixtures/errors.html?" + (query == null ? "report-errors=1" : query) + "&r=" + Math.random();
      f.onload = function () { ok(f); };
      document.body.appendChild(f);
    });
  }
  async function until(fn) { for (var i = 0; i < 40 && !fn(); i++) await wait(25); return fn(); }
  function fire(w, init) { w.dispatchEvent(new w.ErrorEvent("error", init)); }
  function own(w, name) { return w.location.origin + "/tests/fixtures/" + (name || "thrower.js") + "?v=123"; }

  describe("error reporting", function () {
    beforeEach(function () { try { sessionStorage.removeItem("samuka-errs"); } catch (e) {} });

    it("reports a real uncaught error from a site file, with a short, anonymous row", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        w.throwLater("boom one");
        expect(await until(function () { return w.__rows.length === 1; })).toBe(true);
        var r = w.__rows[0];
        expect(r.kind).toBe("error");
        expect(r.message).toContain("boom one");
        expect(r.source).toBe("/tests/fixtures/thrower.js");
        expect(r.line).toBeGreaterThan(0);
        expect(r.col).toBeGreaterThan(0);
        expect(r.path).toBe("/tests/fixtures/errors.html");
        expect(r.ua).toMatch(/^[\w ]+ · \w+$/);
        expect(r.sid).toMatch(/^[a-z0-9]{4,16}$/);
        expect(Object.keys(r).sort().join(",")).toBe("build,col,kind,line,message,path,sid,source,stack,ua");
      } finally { f.remove(); }
    });

    it("reports unhandled promise rejections", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        w.rejectLater("nope");
        expect(await until(function () { return w.__rows.length === 1; })).toBe(true);
        expect(w.__rows[0].kind).toBe("rejection");
        expect(w.__rows[0].message).toBe("Error: nope");
        expect(w.__rows[0].source).toBe("/tests/fixtures/thrower.js");
      } finally { f.remove(); }
    });

    it("sends the same error once per page load", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        for (var i = 0; i < 4; i++) fire(w, { message: "same", filename: own(w), lineno: 3, colno: 9 });
        fire(w, { message: "same", filename: own(w), lineno: 4, colno: 9 });   // another line is another error
        expect(w.__rows.length).toBe(2);
      } finally { f.remove(); }
    });

    it("caps reports at 5 per visit, across page loads", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        for (var i = 0; i < 8; i++) fire(w, { message: "err " + i, filename: own(w), lineno: i + 1, colno: 1 });
        expect(w.__rows.length).toBe(5);
      } finally { f.remove(); }
      var g = await frame(), v = g.contentWindow;   // a reload in the same tab doesn't reset the cap
      try {
        fire(v, { message: "after reload", filename: own(v), lineno: 1, colno: 1 });
        expect(v.__rows.length).toBe(0);
      } finally { g.remove(); }
    });

    it("ignores browser extensions, other origins and opaque cross-origin errors", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        fire(w, { message: "ext", filename: "chrome-extension://abcdef/content.js", lineno: 1, colno: 1 });
        fire(w, { message: "ext2", filename: "moz-extension://1234/inject.js", lineno: 1, colno: 1 });
        fire(w, { message: "cdn", filename: "https://cdn.jsdelivr.net/npm/x.js", lineno: 1, colno: 1 });
        fire(w, { message: "Script error.", filename: "", lineno: 0, colno: 0 });
        var e = new w.Error("from an extension"); e.stack = "Error: from an extension\n    at x (chrome-extension://abc/c.js:1:2)";
        w.dispatchEvent(new w.PromiseRejectionEvent("unhandledrejection", { promise: w.Promise.resolve(), reason: e }));
        expect(w.__rows.length).toBe(0);
      } finally { f.remove(); }
    });

    it("blanks out emails and drops query strings", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        fire(w, { message: "bad user nino@example.com", filename: own(w), lineno: 2, colno: 2 });
        expect(w.__rows[0].message).toBe("bad user [email]");
        expect(w.__rows[0].source).toBe("/tests/fixtures/thrower.js");
      } finally { f.remove(); }
    });

    it("never throws, whatever it is handed or when sending fails", async function () {
      var f = await frame(), w = f.contentWindow;
      try {
        w.__samukaErrorSink = function () { throw new Error("sink exploded"); };
        fire(w, { message: "a", filename: own(w), lineno: 1, colno: 1 });
        fire(w, { message: "b", filename: own(w), lineno: 2, colno: 1, error: { stack: 42 } });
        fire(w, { message: "", error: null });
        ["x", null, undefined, Object.create(null), w.Symbol("s"), { message: 5 }].forEach(function (reason) {
          w.dispatchEvent(new w.PromiseRejectionEvent("unhandledrejection", { promise: w.Promise.resolve(), reason: reason }));
        });
        await wait(30);
        expect(w.__errorEvents).toBe(3);   // only the three fired above: none came from the reporter
      } finally { f.remove(); }
    });

    it("is off on localhost unless ?report-errors=1", async function () {
      var f = await frame(""), w = f.contentWindow;
      try {
        fire(w, { message: "local", filename: own(w), lineno: 1, colno: 1 });
        expect(w.__rows.length).toBe(0);
      } finally { f.remove(); }
    });

    it("posts one minimal JSON row to the Supabase table, without cookies", async function () {
      var f = await frame("report-errors=1&via=fetch"), w = f.contentWindow;
      try {
        fire(w, { message: "sent", filename: own(w), lineno: 7, colno: 3 });
        expect(w.__fetches.length).toBe(1);
        var c = w.__fetches[0];
        expect(c.url).toBe("https://example.supabase.co/rest/v1/client_errors");
        expect(c.opts.method).toBe("POST");
        expect(c.opts.credentials).toBe("omit");
        expect(c.opts.keepalive).toBe(true);
        expect(c.opts.headers.apikey).toBe("sb_publishable_test");
        var row = JSON.parse(c.opts.body);
        expect(row.message).toBe("sent");
        expect(row.line).toBe(7);
        expect(row.build).toBe("1762900000");
      } finally { f.remove(); }
    });
  });
})();
