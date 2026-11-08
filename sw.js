---
# processed by Jekyll so every deploy gets a fresh cache name
---
/* Samuka · service worker: installable app + offline résumé
 * pages: network first (always fresh), cached copy when offline, then /offline/
 * assets: served from cache, refreshed in the background
 */
var VERSION = "samuka-{{ site.time | date: '%Y%m%d%H%M%S' }}";
var PRECACHE = ["/offline/", "/assets/samuka-resume.pdf", "/assets/icons/icon-192.png", "/assets/favicon.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function isPage(req, url) {
  return req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
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
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  }
});
