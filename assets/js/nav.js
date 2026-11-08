/* Samuka · seamless page switching
 * Internal links load the next page in the background and swap only the page
 * content (main area, file tree, tabs, status), so the frame, the generated
 * music, the terminal, live presence and chat keep running across pages.
 * Every module re-scans the new content on the `samuka:page` event.
 * Falls back to a normal page load for anything unexpected.
 */
(function () {
  "use strict";
  if (!window.history || !window.fetch || !window.DOMParser) return;
  var busy = false, bar = null, cache = {};
  var SKIP = /\.(pdf|png|jpe?g|gif|svg|webp|zip|xml|txt|json|ico)$/i;

  function progress(on) {
    if (!bar) { bar = document.createElement("div"); bar.className = "nav-bar"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar); }
    bar.classList.toggle("is-on", on);
  }
  function samePage(u) { return u.pathname === location.pathname && u.search === location.search; }
  function eligible(a, e) {
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    if (a.target && a.target !== "_self") return null;
    if (a.hasAttribute("download") || a.getAttribute("rel") === "external") return null;
    var href = a.getAttribute("href"); if (!href || href.charAt(0) === "#" || /^(mailto|tel|javascript):/i.test(href)) return null;
    var u; try { u = new URL(a.href, location.href); } catch (x) { return null; }
    if (u.origin !== location.origin || SKIP.test(u.pathname)) return null;
    if (samePage(u)) return null;   // in-page anchors keep the browser's own behaviour
    return u;
  }

  async function fetchDoc(url) {
    if (cache[url]) return cache[url];
    var res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var html = await res.text();
    var doc = new DOMParser().parseFromString(html, "text/html");
    cache[url] = doc;
    setTimeout(function () { delete cache[url]; }, 60000);
    return doc;
  }
  function swap(sel, doc, how) {
    var a = document.querySelector(sel), b = doc.querySelector(sel);
    if (!a || !b) return false;
    if (how === "text") a.textContent = b.textContent; else a.innerHTML = b.innerHTML;
    return true;
  }
  function runInlineScripts(rootEl) {
    rootEl.querySelectorAll("script").forEach(function (old) {
      if (old.src) return;
      var s = document.createElement("script");
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }

  async function go(url, opts) {
    opts = opts || {};
    var u = new URL(url, location.href);
    if (u.origin !== location.origin) { location.href = u.href; return; }
    if (samePage(u) && !opts.force) {
      if (u.hash) { var t = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (t) t.scrollIntoView({ behavior: "smooth" }); }
      return;
    }
    if (busy) return;
    busy = true; progress(true);
    try {
      var doc = await fetchDoc(u.pathname + u.search);
      var newMain = doc.querySelector("#main"), newIde = doc.querySelector(".ide");
      if (!newMain || !newIde || !document.querySelector("#main")) throw new Error("not a shell page");
      // close windows that belong to the old page
      if (window.SamukaArcade && window.SamukaArcade.isOpen()) window.SamukaArcade.close();
      document.title = doc.title;
      ["description", "og:title", "og:description", "og:url"].forEach(function (k) {
        var mine = document.querySelector('meta[name="' + k + '"], meta[property="' + k + '"]'), theirs = doc.querySelector('meta[name="' + k + '"], meta[property="' + k + '"]');
        if (mine && theirs) mine.setAttribute("content", theirs.getAttribute("content"));
      });
      var ide = document.querySelector(".ide");
      ide.setAttribute("data-page", newIde.getAttribute("data-page") || "");
      swap(".tree__nav", doc); swap(".tabs__files", doc); swap(".mnav", doc);
      var sheet = document.getElementById("msheet"); if (sheet) sheet.hidden = true;
      swap("[data-tab-crumbs]", doc, "text"); swap("[data-status-file]", doc, "text");
      var main = document.querySelector("#main");
      main.className = newMain.className;
      main.innerHTML = newMain.innerHTML;
      runInlineScripts(main);
      if (opts.push !== false) history.pushState({ samuka: true }, "", u.pathname + u.search + u.hash);
      if (u.hash) {
        var target = document.getElementById(decodeURIComponent(u.hash.slice(1)));
        if (target) setTimeout(function () { target.scrollIntoView(); }, 30); else window.scrollTo(0, 0);
      } else if (opts.scroll != null) window.scrollTo(0, opts.scroll);
      else window.scrollTo(0, 0);
      window.dispatchEvent(new CustomEvent("samuka:page", { detail: { url: u.href } }));
      var h = main.querySelector("h1, h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    } catch (err) {
      location.href = u.href;   // anything odd: just load the page normally
      return;
    } finally { busy = false; progress(false); }
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    var u = eligible(a, e);
    if (!u) return;
    e.preventDefault();
    go(u.href);
  });
  // warm the cache on hover so switching feels instant
  document.addEventListener("pointerover", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.__pf) return;
    var u = eligible(a, { button: 0 });
    if (!u) return;
    a.__pf = true;
    fetchDoc(u.pathname + u.search).catch(function () {});
  }, { passive: true });
  history.replaceState({ samuka: true }, "", location.href);
  window.addEventListener("popstate", function (e) {
    if (!e.state || !e.state.samuka) return;
    go(location.href, { push: false, force: true });
  });
  window.SamukaNav = { go: go };
})();
