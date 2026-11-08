---
# processed by Jekyll so every deploy gets a fresh cache name
---
/* Samuka · service worker: installable app + offline résumé
 * pages:  network first (always fresh), cached copy when offline, then /offline/
 * assets: one cache that survives deploys. JS/CSS links carry a content hash (?v=<10 hex>,
 *         scripts/optimize.mjs), so a cached copy of that exact URL can never be stale: served
 *         straight from cache. Everything else: cache first, refreshed in the background.
 */
var VERSION = "samuka-{{ site.time | date: '%Y%m%d%H%M%S' }}";   // pages + offline fallback, per deploy
var ASSETS = "samuka-assets-v1";                                   // kept across deploys
var MAX_ASSETS = 200;
var PRECACHE = ["/offline/", "/assets/samuka-resume.pdf", "/assets/icons/icon-192.png", "/assets/favicon.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== ASSETS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function isPage(req, url) {
  return req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
}
function hashed(url) { return /\.(js|css)$/.test(url.pathname) && /^\?v=[0-9a-f]{10}$/.test(url.search); }
// oldest entries go first once the asset cache grows past MAX_ASSETS (old hashes pile up over deploys)
function trim(c) {
  return c.keys().then(function (keys) { return Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map(function (k) { return c.delete(k); })); });
}
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/sw.js") return;
  if (isPage(req, url)) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("/offline/"); });
    }));
    return;
  }
  if (/\.(css|js|png|svg|webmanifest|pdf|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.open(ASSETS).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit && hashed(url)) return hit;   // immutable: same hash, same bytes
        var net = fetch(req).then(function (res) {
          if (res.ok) c.put(req, res.clone()).then(function () { return trim(c); });
          return res;
        }).catch(function () { return hit || caches.match(req, { ignoreSearch: true }); });
        return hit || net;
      });
    }));
  }
});
