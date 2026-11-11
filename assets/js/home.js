/* Samuka · lobby helpers
 *  - "next game" card: your last game for returning players, a first game to try for new ones
 *  - today's daily puzzle number and the countdown to the next board (UTC midnight, like the puzzle)
 *  - "new" markers on site updates (What's new) since your last visit, and a dot on the nav links
 * Re-inits on samuka:page (seamless navigation swaps #main).
 */
(function () {
  "use strict";
  var LAST = "samuka-last-game", SEEN = "samuka-updates-seen";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  function games() {
    var el = document.getElementById("home-games");
    if (!el) return [];
    try { return JSON.parse(el.textContent) || []; } catch (e) { return []; }
  }
  function lastGame() {
    try { var v = JSON.parse(store.get(LAST) || "null"); return v && v.id ? v : null; } catch (e) { return null; }
  }
  function ago(t) {
    var m = Math.round((Date.now() - t) / 6e4);
    if (m < 2) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60); if (h < 24) return h + "h ago";
    var d = Math.round(h / 24); return d === 1 ? "yesterday" : d + " days ago";
  }
  function best(id) { var A = window.SamukaArcade; return A && A.best ? A.best(id) : 0; }

  /* ---------- next game ---------- */
  function paintNext() {
    var box = document.querySelector("[data-home-next]"), list = games();
    if (!box || !list.length) return;
    var last = lastGame(), g = last && list.filter(function (x) { return x.id === last.id; })[0];
    if (!g) return;   // first visit: the server-rendered "start with Gem Match" card stays
    var b = best(g.id);
    // suggest a game they haven't scored in yet, so the lobby keeps showing them something new
    var other = list.filter(function (x) { return x.id !== g.id && !best(x.id); })[0];
    box.classList.add("next--back");
    box.innerHTML =
      '<p class="next__kicker">welcome back · last played ' + esc(ago(last.at)) + "</p>" +
      '<p class="next__title"><span aria-hidden="true">' + esc(g.icon) + "</span> " + esc(g.name) + "</p>" +
      '<p class="next__text">' + (b ? "Your best is <b>" + b.toLocaleString("en-US") + "</b>. Beat it?" : esc(g.tagline)) + "</p>" +
      '<div class="next__row"><button class="btn btn--primary" type="button" data-play="' + esc(g.id) + '"><span class="btn__prompt">▶</span> play again</button>' +
      (other ? '<button class="btn" type="button" data-play="' + esc(other.id) + '">or try ' + esc(other.name) + "</button>" : "") + "</div>";
  }
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name === "closed" || d.name === "over") { setTimeout(paintNext, 0); return; }
    if (d.name !== "start" || !d.game) return;
    store.set(LAST, JSON.stringify({ id: d.game, at: Date.now(), mode: d.mode || "free" }));
  });

  /* ---------- daily puzzle ---------- */
  function dailyNo() { return Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.UTC(2026, 10, 8)) / 864e5) + 1; }
  function paintDaily() {
    var n = document.querySelector("[data-home-daily]"), r = document.querySelector("[data-home-reset]");
    if (n) n.textContent = "#" + dailyNo();
    if (r) {
      var now = new Date(), next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      var mins = Math.max(1, Math.ceil((next - now.getTime()) / 6e4));
      r.textContent = mins >= 60 ? Math.floor(mins / 60) + "h " + (mins % 60) + "m" : mins + "m";
    }
  }

  /* ---------- what's new ---------- */
  function latest() {
    var el = document.querySelector("[data-updates-latest]");
    return el ? el.getAttribute("data-updates-latest") : "";
  }
  function paintUpdates() {
    var top = latest(), seen = store.get(SEEN);
    // a first visit has nothing "new": everything is new to them, so start counting from today's list
    if (seen == null && top) { store.set(SEEN, top); seen = top; }
    document.querySelectorAll("[data-update-date]").forEach(function (li) {
      li.classList.toggle("is-new", !!seen && li.getAttribute("data-update-date") > seen);
    });
    var fresh = !!(top && seen && top > seen);
    document.querySelectorAll("[data-updates-latest]").forEach(function (a) { a.classList.toggle("has-news", fresh); });
    // the full list counts as read once it's open; the lobby's three only once you scroll to them
    if (document.querySelector("[data-updates-page]")) markSeen();
    else watchSeen();
  }
  function markSeen() {
    var top = latest(); if (!top) return;
    store.set(SEEN, top);
    document.querySelectorAll("[data-updates-latest]").forEach(function (a) { a.classList.remove("has-news"); });
  }
  var seenIO = null;
  function watchSeen() {
    if (seenIO) { seenIO.disconnect(); seenIO = null; }
    var list = document.querySelector(".updates--home");
    if (!list || !("IntersectionObserver" in window)) return;
    seenIO = new IntersectionObserver(function (en) {
      if (en.some(function (x) { return x.isIntersecting; })) { setTimeout(markSeen, 1500); seenIO.disconnect(); seenIO = null; }
    }, { threshold: 0.6 });
    seenIO.observe(list);
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-updates-filter]");
    if (!b) return;
    var tag = b.getAttribute("data-updates-filter");
    document.querySelectorAll("[data-updates-filter]").forEach(function (x) { var on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
    document.querySelectorAll("[data-update-tag]").forEach(function (li) { li.hidden = !!tag && li.getAttribute("data-update-tag") !== tag; });
  });

  var timer = null;
  function boot() {
    paintNext(); paintDaily(); paintUpdates();
    if (timer) clearInterval(timer);
    timer = document.querySelector("[data-home-reset]") ? setInterval(function () { if (!document.hidden) paintDaily(); }, 30000) : null;
  }
  window.addEventListener("samuka:page", boot);
  window.addEventListener("samuka:auth", paintNext);   // bests are per account
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.SamukaHome = { dailyNo: dailyNo, lastGame: lastGame, markSeen: markSeen };
})();
