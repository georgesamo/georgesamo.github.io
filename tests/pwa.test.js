/* Tests: the installable app. The manifest and layout tags, where install.js registers the worker
 * (swMode), and sw.js itself, run against fake caches/fetch (its Liquid stamped like a Jekyll build). */
(function () {
  "use strict";
  var describe = T.describe, it = T.it, expect = T.expect;
  var ORIGIN = "https://georgesamo.github.io";
  function text(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.text(); }); }

  describe("web app manifest", function () {
    it("names the arcade, opens / standalone, and matches the default skin's colours", async function () {
      var m = JSON.parse(await text("../assets/manifest.webmanifest"));
      var css = await text("../assets/css/main.css"), bg = /--bg:\s*(#[0-9a-f]{6})/i.exec(css)[1].toLowerCase();
      expect(m.name).toBe("Samuka's Arcade");
      expect(m.start_url).toBe("/");
      expect(m.scope).toBe("/");
      expect(m.display).toBe("standalone");
      expect(m.theme_color.toLowerCase()).toBe(bg);
      expect(m.background_color.toLowerCase()).toBe(bg);
    });
    it("has 192, 512 and maskable icons, and the files exist at those sizes", async function () {
      var m = JSON.parse(await text("../assets/manifest.webmanifest"));
      var want = [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]];
      for (var i = 0; i < want.length; i++) {
        var icon = m.icons.filter(function (x) { return x.sizes === want[i][0] && (x.purpose || "any") === want[i][1]; })[0];
        expect(!!icon).toBe(true);
        var img = new Image();
        await new Promise(function (ok, bad) { img.onload = ok; img.onerror = function () { bad(new Error("missing " + icon.src)); }; img.src = ".." + icon.src; });
        expect(img.naturalWidth + "x" + img.naturalHeight).toBe(want[i][0]);
      }
    });
    it("the layout links it, has the iOS tags and the kill-switch meta, and loads install.js", async function () {
      var html = await text("../_layouts/default.html");
      ["rel=\"manifest\"", "apple-touch-icon", "apple-mobile-web-app-capable", "apple-mobile-web-app-title",
        "apple-mobile-web-app-status-bar-style", "name=\"samuka-sw\"", "/assets/js/install.js"].forEach(function (s) { expect(html).toContain(s); });
    });
  });

  describe("service worker registration (install.js swMode)", function () {
    var mode = function (host, search, flag, off) { return window.SamukaInstall.swMode(host, search, flag, off); };
    it("registers on the live site", function () {
      expect(mode("georgesamo.github.io", "", null, false)).toEqual({ mode: "register", flag: null });
      expect(mode("georgesamo.github.io", "?sw=0", null, false).mode).toBe("register");   // the opt-out is a dev tool only
    });
    it("stays off (and cleans up) on localhost unless the tab opted in with ?sw=1", function () {
      ["localhost", "127.0.0.1", "[::1]"].forEach(function (h) { expect(mode(h, "", null, false)).toEqual({ mode: "unregister", flag: null }); });
      expect(mode("127.0.0.1", "?sw=1", null, false)).toEqual({ mode: "register", flag: "1" });
      expect(mode("127.0.0.1", "?as=user&sw=1", null, false)).toEqual({ mode: "register", flag: "1" });
      expect(mode("127.0.0.1", "?sw=10", null, false).mode).toBe("unregister");
      expect(mode("127.0.0.1", "", "1", false)).toEqual({ mode: "register", flag: null });   // later pages in that tab
      expect(mode("127.0.0.1", "?sw=0", "1", false)).toEqual({ mode: "unregister", flag: "" });
    });
    it("the kill switch unregisters everywhere", function () {
      expect(mode("georgesamo.github.io", "", null, true)).toEqual({ mode: "unregister", flag: "" });
      expect(mode("127.0.0.1", "?sw=1", "1", true).mode).toBe("unregister");
    });
  });

  // ---- sw.js in a fake worker scope ----
  function fakeRes(url, body, opts) {
    opts = opts || {};
    var r = { url: url, ok: opts.status ? opts.status < 300 : true, status: opts.status || 200, type: opts.type || "basic", redirected: !!opts.redirected,
      headers: new Headers({ "content-type": opts.ctype || (/\.js/.test(url) ? "text/javascript" : "text/html") }), body: body };
    r.clone = function () { return fakeRes(url, body, opts); };
    r.text = function () { return Promise.resolve(body); };
    return r;
  }
  function abs(u) { return new URL(typeof u === "string" ? u : u.url, ORIGIN).href; }
  function fakeCaches() {
    var store = {};
    function cache(name) {
      var m = store[name] || (store[name] = new Map());
      function find(req, o) {
        var k = abs(req);
        if (m.has(k)) return m.get(k);
        if (o && o.ignoreSearch) { var base = k.split("?")[0]; for (var e of m) if (e[0].split("?")[0] === base) return e[1]; }
        return undefined;
      }
      return {
        match: function (req, o) { var v = find(req, o); return Promise.resolve(v && v.clone()); },
        put: function (req, res) { m.set(abs(req), res); return Promise.resolve(); },
        delete: function (req) { return Promise.resolve(m.delete(abs(req))); },
        keys: function () { return Promise.resolve(Array.from(m.keys()).map(function (k) { return { url: k }; })); }
      };
    }
    return {
      store: store,
      open: function (n) { return Promise.resolve(cache(n)); },
      keys: function () { return Promise.resolve(Object.keys(store)); },
      delete: function (n) { var had = n in store; delete store[n]; return Promise.resolve(had); }
    };
  }
  // site: path → body (or a function returning a fake response); online=false makes every fetch fail
  async function worker(opts) {
    opts = opts || {};
    var src = (await text("../sw.js")).replace(/^---[\s\S]*?---\r?\n/, "")
      .replace(/\{\{[^}]*\}\}/g, opts.build || "20261112000000")
      .replace(/\{%\s*if site\.service_worker == false\s*%\}true\{%\s*else\s*%\}false\{%\s*endif\s*%\}/, opts.off ? "true" : "false");
    expect(src).not.toContain("{%");
    var listeners = {}, net = { online: true, calls: [] }, caches = opts.caches || fakeCaches(), state = { unregistered: false, claimed: false, skipped: false };
    var self = {
      location: { origin: ORIGIN },
      addEventListener: function (t, fn) { listeners[t] = fn; },
      skipWaiting: function () { state.skipped = true; return Promise.resolve(); },
      clients: { claim: function () { state.claimed = true; return Promise.resolve(); } },
      registration: { unregister: function () { state.unregistered = true; return Promise.resolve(true); } }
    };
    var site = opts.site || {};
    function fakeFetch(req, init) {
      var url = abs(req);
      net.calls.push({ url: url, cache: (init && init.cache) || (req && req.init && req.init.cache) });
      if (!net.online) return Promise.reject(new TypeError("offline"));
      var path = url.slice(ORIGIN.length), body = site[path];
      if (typeof body === "function") return Promise.resolve(body(url));
      return Promise.resolve(body == null ? fakeRes(url, "not found", { status: 404 }) : fakeRes(url, body));
    }
    function FakeRequest(u, init) { this.url = abs(u); this.init = init || {}; }
    var FakeResponse = { error: function () { return { error: true }; } };
    new Function("self", "caches", "fetch", "Request", "Response", src)(self, caches, fakeFetch, FakeRequest, FakeResponse);
    function run(type, extra) {
      var waits = [], ev = Object.assign({ waitUntil: function (p) { waits.push(p); }, respondWith: function (p) { waits.push(p); ev.response = p; } }, extra || {});
      if (!listeners[type]) return Promise.resolve(ev);
      listeners[type](ev);
      return Promise.all(waits).then(function () { return ev; });
    }
    function get(path, mode, headers) {
      return run("fetch", { request: { method: "GET", url: ORIGIN + path, mode: mode || "cors", headers: new Headers(headers || {}) } })
        .then(function (ev) { return ev.response ? ev.response : "network"; });
    }
    return { api: self.SamukaSW, listeners: listeners, caches: caches, net: net, state: state, run: run, get: get, site: site };
  }
  var H1 = "0123456789", H2 = "abcdef0123";
  function home(h) {
    return '<link rel="stylesheet" href="/assets/css/main.css?v=' + h + '"><script src="/assets/js/app.js?v=' + h + '" defer></script>' +
      '<script>window.G = { gems: { src: "/assets/js/games/gem-match.js?v=' + h + '" } }; window.SamukaMusicSrc = "/assets/js/lofi.js?v=' + h + '";</script>' +
      '<script src="https://cdn.jsdelivr.net/npm/x.js"></script><main id="main">home</main>';
  }
  function siteFor(h) {
    var s = { "/": home(h), "/games/": "<main id=main>games</main>", "/offline/": "<main id=main>offline</main>",
      "/assets/manifest.webmanifest": "{}", "/assets/favicon.svg": "<svg/>", "/assets/icons/icon-192.png": "png", "/assets/samuka-resume.pdf": "pdf" };
    ["/assets/css/main.css", "/assets/js/app.js", "/assets/js/games/gem-match.js", "/assets/js/lofi.js"].forEach(function (p) { s[p + "?v=" + h] = p + "@" + h; });
    return s;
  }

  describe("sw.js routing", function () {
    it("pages are network-first pages; hashed js/css are immutable; other /assets/ files are plain assets", async function () {
      var w = await worker(), r = w.api.route;
      expect(r("GET", ORIGIN + "/", "navigate")).toBe("page");
      expect(r("GET", ORIGIN + "/u/nino/", "cors")).toBe("page");     // nav.js fetches pages too
      expect(r("GET", ORIGIN + "/404.html", "cors")).toBe("page");
      expect(r("GET", ORIGIN + "/assets/js/app.js?v=" + H2, "no-cors")).toBe("hashed");
      expect(r("GET", ORIGIN + "/assets/js/gem.js", "no-cors")).toBe("asset");        // unhashed: never cache-first
      expect(r("GET", ORIGIN + "/assets/js/app.js?v=2", "no-cors")).toBe("asset");
      expect(r("GET", ORIGIN + "/assets/icons/icon-192.png", "no-cors")).toBe("asset");
      expect(r("GET", ORIGIN + "/assets/fonts/inter-latin.woff2", "cors")).toBe("asset");  // self-hosted fonts: network first
    });
    it("precaches the fonts the layout preloads, and every precached font file exists", async function () {
      var sw = await text("../sw.js"), html = await text("../_layouts/default.html"), css = await text("../assets/css/fonts.css");
      var preloaded = (html.match(/\/assets\/fonts\/[\w-]+\.woff2/g) || []);
      expect(preloaded.length).toBe(2);
      preloaded.forEach(function (f) { expect(sw).toContain('"' + f + '"'); });
      var precached = sw.match(/"\/assets\/fonts\/[\w-]+\.woff2"/g) || [];
      expect(precached.length).toBe(3);
      for (var i = 0; i < precached.length; i++) {
        var f = precached[i].slice(1, -1);
        expect(css).toContain("url(../fonts/" + f.split("/").pop() + ")");
        var res = await fetch(".." + f, { method: "HEAD", cache: "no-store" });
        expect(res.ok).toBe(true);
      }
    });
    it("leaves backend, auth, cross-origin, audio, the worker itself and writes to the network", async function () {
      var w = await worker(), r = w.api.route;
      expect(r("POST", ORIGIN + "/", "cors")).toBe(null);
      expect(r("GET", "https://qgxboopayhgppckvwmhr.supabase.co/rest/v1/scores", "cors")).toBe(null);
      expect(r("GET", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js", "no-cors")).toBe(null);
      expect(r("GET", "https://fonts.googleapis.com/css2?family=Inter", "no-cors")).toBe(null);
      expect(r("GET", ORIGIN + "/sw.js", "same-origin")).toBe(null);
      expect(r("GET", ORIGIN + "/api/scores/", "cors")).toBe(null);
      expect(r("GET", ORIGIN + "/auth/callback/", "navigate")).toBe(null);
      expect(r("GET", ORIGIN + "/assets/audio/knight-1-0.mp3", "no-cors")).toBe(null);
      expect(r("GET", ORIGIN + "/u/nino/card.jpg", "no-cors")).toBe(null);
      expect(r("GET", ORIGIN + "/feed.xml", "cors")).toBe(null);
      expect(r("GET", ORIGIN + "/", "cors", new Headers({ Authorization: "Bearer x" }))).toBe(null);
    });
    it("finds every hashed script and stylesheet a page links, games and soundtrack included", async function () {
      var w = await worker();
      expect(w.api.assetsIn(home(H1))).toEqual(["/assets/css/main.css?v=" + H1, "/assets/js/app.js?v=" + H1, "/assets/js/games/gem-match.js?v=" + H1, "/assets/js/lofi.js?v=" + H1]);
    });
    it("stores pages without their query string", async function () {
      var w = await worker();
      expect(w.api.pageKey(ORIGIN + "/u/?n=nino#top")).toBe(ORIGIN + "/u/");
      expect(w.api.pageKey(ORIGIN + "/?code=secret")).toBe(ORIGIN + "/");
    });
  });

  describe("sw.js lifecycle", function () {
    it("install precaches the shell, a game and the soundtrack, bypassing the HTTP cache", async function () {
      var w = await worker({ site: siteFor(H1) });
      await w.run("install");
      var pages = Object.keys(w.caches.store).filter(function (k) { return /^samuka-pages-/.test(k); });
      expect(pages).toEqual(["samuka-pages-20261112000000"]);
      expect(Array.from(w.caches.store[pages[0]].keys())).toEqual([ORIGIN + "/", ORIGIN + "/games/", ORIGIN + "/offline/"]);
      var assets = Array.from(w.caches.store["samuka-assets-v1"].keys());
      expect(assets).toContain(ORIGIN + "/assets/js/games/gem-match.js?v=" + H1);
      expect(assets).toContain(ORIGIN + "/assets/js/lofi.js?v=" + H1);
      expect(assets).toContain(ORIGIN + "/assets/css/main.css?v=" + H1);
      expect(assets.some(function (u) { return u.indexOf(ORIGIN) !== 0; })).toBe(false);   // nothing cross-origin
      expect(w.net.calls.every(function (c) { return c.cache === "reload"; })).toBe(true);
      expect(w.state.skipped).toBe(true);
    });
    it("a failed shell download fails the install (the old worker stays)", async function () {
      var s = siteFor(H1); delete s["/games/"];
      var w = await worker({ site: s }), failed = false;
      await w.run("install").catch(function () { failed = true; });
      expect(failed).toBe(true);
      expect(w.state.skipped).toBe(false);
    });
    it("a new build drops the old pages and the hashed files it no longer links, then claims the tabs", async function () {
      var caches = fakeCaches();
      var old = await worker({ caches: caches, site: siteFor(H1), build: "20261111000000" });
      await old.run("install"); await old.run("activate");
      var s = siteFor(H2); s["/assets/js/lofi.js?v=" + H1] = "same file, unchanged hash"; s["/"] = s["/"].replace("lofi.js?v=" + H2, "lofi.js?v=" + H1);
      var next = await worker({ caches: caches, site: s, build: "20261112000000" });
      await next.run("install"); await next.run("activate");
      expect(Object.keys(caches.store).sort()).toEqual(["samuka-assets-v1", "samuka-pages-20261112000000"]);
      var assets = Array.from(caches.store["samuka-assets-v1"].keys());
      expect(assets).toContain(ORIGIN + "/assets/js/app.js?v=" + H2);
      expect(assets).toContain(ORIGIN + "/assets/js/lofi.js?v=" + H1);       // unchanged file kept, not downloaded again
      expect(assets).not.toContain(ORIGIN + "/assets/js/app.js?v=" + H1);
      expect(assets).toContain(ORIGIN + "/assets/favicon.svg");
      expect(next.state.claimed).toBe(true);
      expect(next.net.calls.filter(function (c) { return /lofi/.test(c.url); }).length).toBe(0);
    });
    it("kill switch: no fetch handler; activate deletes every samuka cache and unregisters", async function () {
      var caches = fakeCaches();
      (await caches.open("samuka-pages-1")); (await caches.open("samuka-assets-v1")); (await caches.open("other-app"));
      var w = await worker({ caches: caches, off: true });
      expect(!!w.listeners.fetch).toBe(false);
      await w.run("install"); await w.run("activate");
      expect(Object.keys(caches.store)).toEqual(["other-app"]);
      expect(w.state.unregistered).toBe(true);
    });
  });

  describe("sw.js fetch", function () {
    async function installed(h) { var w = await worker({ site: siteFor(h || H1) }); await w.run("install"); await w.run("activate"); w.net.calls.length = 0; return w; }
    it("online, pages always come from the network, revalidated", async function () {
      var w = await installed();
      w.site["/"] = "<main id=main>fresh build</main>";
      var res = await w.get("/", "navigate");
      expect(await res.text()).toBe("<main id=main>fresh build</main>");
      expect(w.net.calls[0].cache).toBe("no-cache");
    });
    it("offline, a visited page comes from the cache (query ignored) and an unknown one gets /offline/", async function () {
      var w = await installed();
      w.net.online = false;
      expect(await (await w.get("/games/", "navigate")).text()).toBe("<main id=main>games</main>");
      expect(await (await w.get("/?as=user", "navigate")).text()).toContain("home");
      expect(await (await w.get("/leaderboards/", "cors")).text()).toBe("<main id=main>offline</main>");   // nav.js swaps this in
    });
    it("hashed assets come from the cache without touching the network, even online", async function () {
      var w = await installed();
      var res = await w.get("/assets/js/games/gem-match.js?v=" + H1, "no-cors");
      expect(await res.text()).toBe("/assets/js/games/gem-match.js@" + H1);
      expect(w.net.calls.length).toBe(0);
    });
    it("unhashed assets go to the network first, the cache only offline", async function () {
      var w = await installed();
      w.site["/assets/favicon.svg"] = "<svg>new</svg>";
      expect(await (await w.get("/assets/favicon.svg", "no-cors")).text()).toBe("<svg>new</svg>");
      w.net.online = false;
      expect(await (await w.get("/assets/favicon.svg", "no-cors")).text()).toBe("<svg>new</svg>");
    });
    it("offline, a hashed file never falls back to another build's copy", async function () {
      var w = await installed();
      w.net.online = false;
      var failed = false;
      await w.get("/assets/js/app.js?v=" + H2, "no-cors").catch(function () { failed = true; });
      expect(failed).toBe(true);
    });
    it("error pages, redirects and opaque responses are passed through but never cached", async function () {
      var w = await installed();
      w.site["/u/ghost/"] = function (u) { return fakeRes(u, "404 page", { status: 404 }); };
      w.site["/moved/"] = function (u) { return fakeRes(u, "moved", { redirected: true }); };
      expect((await w.get("/u/ghost/", "navigate")).status).toBe(404);
      await w.get("/moved/", "cors");
      await new Promise(function (r) { setTimeout(r, 20); });
      var pages = Array.from(w.caches.store["samuka-pages-20261112000000"].keys());
      expect(pages).not.toContain(ORIGIN + "/u/ghost/");
      expect(pages).not.toContain(ORIGIN + "/moved/");
    });
    it("cross-origin and backend requests are not handled at all", async function () {
      var w = await installed();
      expect(await w.get("/sw.js")).toBe("network");
      var ev = await w.run("fetch", { request: { method: "GET", url: "https://qgxboopayhgppckvwmhr.supabase.co/auth/v1/user", mode: "cors", headers: new Headers() } });
      expect(ev.response).toBe(undefined);
    });
  });
})();
