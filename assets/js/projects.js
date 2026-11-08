/* Samuka · projects from GitHub (public API, cached in sessionStorage) */
(function () {
  "use strict";

  var USER = "georgesamo";
  var API = "https://api.github.com";
  var TTL = 30 * 60 * 1000; // unauthenticated limit is 60 req/hour, so cache for 30 min
  var MAX = 6;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // a few GitHub linguist colours; anything else falls back to the accent
  var LANG = {
    Ruby: "#cc342d", JavaScript: "#f1e05a", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#563d7c",
    SCSS: "#c6538c", Python: "#3572a5", Go: "#00add8", Shell: "#89e051", Dockerfile: "#384d54",
    Elixir: "#6e4a7e", Rust: "#dea584", Java: "#b07219", PHP: "#4f5d95", "C#": "#178600", C: "#555555",
    "C++": "#f34b7d", Vue: "#41b883", PLpgSQL: "#336790", SQL: "#e38c00", Lua: "#000080", Kotlin: "#a97bff",
    Swift: "#f05138", Makefile: "#427819", Liquid: "#67b8de", Procfile: "#3b2f63"
  };

  /* ---------- cache ---------- */
  function cacheGet(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || Date.now() - v.t > TTL) { sessionStorage.removeItem(key); return null; }
      return v.d;
    } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
  }

  // resolves { status, data }; 200 responses are cached, everything else is not
  function getJSON(path) {
    var key = "samuka-gh:" + path;
    var hit = cacheGet(key);
    if (hit !== null) return Promise.resolve({ status: 200, data: hit });
    return fetch(API + path, { headers: { Accept: "application/vnd.github+json" } }).then(function (res) {
      if (res.status === 202) return { status: 202, data: null };
      if (!res.ok) return { status: res.status, data: null };
      return res.json().then(function (d) { cacheSet(key, d); return { status: 200, data: d }; });
    });
  }

  /* ---------- formatting ---------- */
  function ago(iso) {
    var then = new Date(iso).getTime();
    if (!then) return "";
    var s = Math.max(0, (Date.now() - then) / 1000);
    var units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (var i = 0; i < units.length; i++) {
      var n = Math.floor(s / units[i][1]);
      if (n >= 1) return n + " " + units[i][0] + (n > 1 ? "s" : "") + " ago";
    }
    return "just now";
  }

  function graphBars() {
    var html = "";
    for (var i = 0; i < 52; i++) html += '<i style="--i:' + i + '"></i>';
    return html;
  }

  function card(r) {
    var lang = r.language ? '<span class="repo__lang"><i style="background:' + esc(LANG[r.language] || "var(--accent)") + '"></i>' + esc(r.language) + "</span>" : "";
    var stars = '<span class="repo__stars" title="stars">★ ' + esc(r.stargazers_count || 0) + "</span>";
    var pushed = r.pushed_at ? '<span class="repo__pushed" title="' + esc(r.pushed_at) + '">pushed ' + esc(ago(r.pushed_at)) + "</span>" : "";
    return '<article class="repo" data-repo="' + esc(r.name) + '">' +
      '<p class="repo__file">' + esc(USER) + "/</p>" +
      '<h3 class="repo__name"><a href="' + esc(r.html_url) + '" target="_blank" rel="noopener">' + esc(r.name) + "</a></h3>" +
      '<p class="repo__desc">' + (r.description ? esc(r.description) : '<span class="muted"># no description</span>') + "</p>" +
      '<div class="repo__graph is-pending" role="img" aria-label="Weekly commits over the last year">' + graphBars() + "</div>" +
      '<p class="repo__meta">' + lang + stars + pushed + "</p>" +
      "</article>";
  }

  function fallback(box, why) {
    box.innerHTML = '<p class="projects__fallback muted"># ' + esc(why) + ' · browse them on <a href="https://github.com/' + USER + '" target="_blank" rel="noopener">github.com/' + USER + "</a></p>";
  }

  /* ---------- commit activity ---------- */
  function paint(graph, weeks) {
    var max = 0;
    weeks.forEach(function (n) { if (n > max) max = n; });
    var bars = graph.querySelectorAll("i");
    for (var i = 0; i < bars.length; i++) {
      var n = weeks[i] || 0;
      // empty weeks keep a 1px stub so the baseline stays visible
      var h = max ? Math.max(n ? 8 : 0, Math.round((n / max) * 100)) : 0;
      bars[i].style.setProperty("--h", h + "%");
      bars[i].title = n + " commit" + (n === 1 ? "" : "s");
    }
    var total = weeks.reduce(function (a, b) { return a + b; }, 0);
    graph.setAttribute("aria-label", total + " commits in the last 52 weeks");
    graph.classList.remove("is-pending");
    graph.classList.add("is-ready");
  }

  function loadActivity(el, retried) {
    var graph = el.querySelector(".repo__graph");
    var name = el.getAttribute("data-repo");
    getJSON("/repos/" + USER + "/" + encodeURIComponent(name) + "/stats/participation").then(function (res) {
      if (res.status === 202 && !retried) { setTimeout(function () { loadActivity(el, true); }, 3000); return; }
      var weeks = res.data && Array.isArray(res.data.owner) ? res.data.owner.slice(-52) : null;
      if (!weeks) { graph.classList.add("is-flat"); graph.setAttribute("aria-label", "Commit activity unavailable"); return; }
      paint(graph, weeks);
    }).catch(function () { graph.classList.add("is-flat"); });
  }

  /* ---------- reveal (bars grow in when the card scrolls into view) ---------- */
  function observe(cards) {
    if (reduced || !("IntersectionObserver" in window)) {
      cards.forEach(function (c) { c.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });
    cards.forEach(function (c, i) { c.style.setProperty("--rd", (i % 3) * 90 + "ms"); io.observe(c); });
  }

  function init() {
    var box = document.querySelector("[data-projects]");
    if (!box) return;
    if (!window.fetch) { fallback(box, "your browser can't load the repo list"); return; }
    box.setAttribute("aria-busy", "true");
    getJSON("/users/" + USER + "/repos?per_page=100&sort=pushed").then(function (res) {
      box.removeAttribute("aria-busy");
      if (res.status === 403 || res.status === 429) { fallback(box, "GitHub's rate limit kicked in"); return; }
      if (res.status !== 200 || !Array.isArray(res.data)) { fallback(box, "couldn't reach GitHub right now"); return; }
      var repos = res.data.filter(function (r) { return r && !r.fork && !r.archived; }).slice(0, MAX);
      if (!repos.length) { fallback(box, "no public repos to show yet"); return; }
      box.innerHTML = repos.map(card).join("");
      var cards = Array.prototype.slice.call(box.querySelectorAll(".repo"));
      observe(cards);
      cards.forEach(function (c) { loadActivity(c, false); });
    }).catch(function () {
      box.removeAttribute("aria-busy");
      fallback(box, "couldn't reach GitHub right now");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
