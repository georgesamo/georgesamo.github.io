---
# Processed by Jekyll: every build stamps a new BUILD below, so the bytes change on each deploy and
# browsers install the new worker (they check /sw.js on every page load, bypassing the HTTP cache).
---
/* Samuka · service worker: installable app, offline shell + one-tap games
 *
 * pages   network first, always revalidated (cache: "no-cache"), so a deploy is seen at once.
 *         The cached copy (this build's cache only) is used only when the network fails, then /offline/.
 * assets  /assets/…js|css?v=<10 hex>  content-hashed by scripts/optimize.mjs (the dev build's
 *         ?v=<epoch> has the same shape): the same URL always means the same bytes → cache first.
 *         Everything else under /assets/ (images, fonts, unhashed scripts): network first, cache
 *         only as the offline fallback. Nothing is ever served stale while online.
 * never   non-GET, cross-origin (Supabase, fonts, CDNs), requests carrying Authorization,
 *         api/auth-looking paths, audio (range requests), the worker itself, /tests/.
 *
 * Kill switch: `service_worker: false` in _config.yml turns this file into a worker that deletes
 * every samuka-* cache and unregisters itself, and the layout's <meta name="samuka-sw" content="off">
 * makes install.js unregister instead of register. Nothing else needs to change.
 */
var BUILD = "{{ site.time | date: '%Y%m%d%H%M%S' }}";
var OFF = {% if site.service_worker == false %}true{% else %}false{% endif %};
var PAGES = "samuka-pages-" + BUILD;      // per build: dropped on activate, never outlives a deploy
var ASSETS = "samuka-assets-v1";          // kept across deploys; hashed entries the new build no longer links are pruned
var MAX_ASSETS = 200, MAX_PAGES = 60;
var SHELL = ["/", "/games/", "/offline/"];   // "/" carries the whole layout + every game's script URL
var STATIC = ["/assets/manifest.webmanifest", "/assets/favicon.svg", "/assets/icons/icon-192.png", "/assets/samuka-resume.pdf"];

var HASHED = /^\?v=[0-9a-f]{10}$/;
var ASSET_LINK = /\/assets\/[^"'?\s>]+\.(?:js|css)\?v=[0-9a-f]{10}(?=["'\s>])/g;

function hashed(url) { return /\.(js|css)$/.test(url.pathname) && HASHED.test(url.search); }
// what to do with a request: "page" | "hashed" | "asset" | null (leave it to the network)
function route(method, href, mode, headers) {
  if (method !== "GET") return null;
  var url = new URL(href);
  if (url.origin !== self.location.origin) return null;
  if (headers && headers.get && headers.get("authorization")) return null;
  var p = url.pathname;
  if (p === "/sw.js" || /^\/(tests|api|auth|functions|rest|realtime|storage|\.well-known)\//.test(p)) return null;
  if (mode === "navigate" || p.endsWith("/") || p.endsWith(".html")) return "page";
  if (!/^\/assets\//.test(p) || !/\.(css|js|png|svg|webmanifest|pdf|woff2?)$/.test(p)) return null;
  return hashed(url) ? "hashed" : "asset";
}
// every content-hashed script/stylesheet a page links (the layout lists all of them, games included)
function assetsIn(html) {
  var seen = {}, out = [];
  (html.match(ASSET_LINK) || []).forEach(function (u) { if (!seen[u]) { seen[u] = 1; out.push(u); } });
  return out;
}
function pageKey(href) { var u = new URL(href); return u.origin + u.pathname; }   // query never stored (?code=, ?n=…)
function cacheable(res) { return res && res.ok && res.type === "basic" && !res.redirected; }
function trim(c, max) {
  return c.keys().then(function (keys) { return Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map(function (k) { return c.delete(k); })); });
}
self.SamukaSW = { route: route, assetsIn: assetsIn, pageKey: pageKey, hashed: hashed, BUILD: BUILD, OFF: OFF };

if (OFF) {
  // emergency kill switch: clean up and step aside. No fetch handler, so requests go straight to the network.
  self.addEventListener("install", function () { self.skipWaiting(); });
  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("samuka") === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.registration.unregister(); }));
  });
} else {
  self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(PAGES).then(function (pages) {
      // the shell must land or the install fails (and the old worker stays in charge)
      return Promise.all(SHELL.map(function (path) {
        return fetch(new Request(path, { cache: "reload", credentials: "same-origin" })).then(function (res) {
          if (!cacheable(res)) throw new Error("precache " + path + ": " + res.status);
          var copy = res.clone();
          return pages.put(pageKey(res.url), copy).then(function () { return path === "/" ? res.text() : ""; });
        });
      }));
    }).then(function (texts) {
      // this build's scripts and styles (games + soundtrack included) so the arcade plays offline; best effort
      var want = assetsIn(texts[0]).concat(STATIC);
      return caches.open(ASSETS).then(function (c) {
        return Promise.all(want.map(function (u) {
          return c.match(u).then(function (hit) {
            if (hit) return;
            return fetch(new Request(u, { cache: "reload" })).then(function (res) { if (cacheable(res)) return c.put(u, res); }).catch(function () {});
          });
        }));
      });
    }).then(function () { return self.skipWaiting(); }));
  });

  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
      // older builds' pages go; so does anything not ours
      return Promise.all(keys.filter(function (k) { return k !== PAGES && k !== ASSETS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () {
      // hashed files the current build no longer links are dead weight
      return Promise.all([caches.open(PAGES).then(function (c) { return c.match(pageKey(self.location.origin + "/")); }), caches.open(ASSETS)]);
    }).then(function (r) {
      var home = r[0], c = r[1];
      if (!home) return;
      return home.text().then(function (html) {
        var live = {}; assetsIn(html).forEach(function (u) { live[u] = 1; });
        return c.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) {
            var u = new URL(k.url); return hashed(u) && !live[u.pathname + u.search];
          }).map(function (k) { return c.delete(k); }));
        });
      });
    }).then(function () { return self.clients.claim(); }));
  });

  self.addEventListener("fetch", function (e) {
    var req = e.request, kind = route(req.method, req.url, req.mode, req.headers);
    if (!kind) return;
    if (kind === "page") {
      e.respondWith(fetch(req, { cache: "no-cache" }).then(function (res) {
        var type = res.headers.get("content-type") || "";
        if (cacheable(res) && type.indexOf("text/html") > -1) {
          var copy = res.clone();
          caches.open(PAGES).then(function (c) { return c.put(pageKey(req.url), copy).then(function () { return trim(c, MAX_PAGES); }); });
        }
        return res;
      }).catch(function () {
        return caches.open(PAGES).then(function (c) {
          return c.match(pageKey(req.url)).then(function (hit) { return hit || c.match(pageKey(self.location.origin + "/offline/")); });
        }).then(function (hit) { return hit || Response.error(); });
      }));
      return;
    }
    e.respondWith(caches.open(ASSETS).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit && kind === "hashed") return hit;   // immutable: same hash, same bytes
        return fetch(req).then(function (res) {
          if (cacheable(res)) c.put(req, res.clone()).then(function () { return trim(c, MAX_ASSETS); });
          return res;
        }).catch(function (err) {
          if (hit) return hit;
          if (kind === "hashed") throw err;   // never hand out another build's copy of a hashed file
          return c.match(req, { ignoreSearch: true }).then(function (any) { if (any) return any; throw err; });
        });
      });
    }));
  });
}
