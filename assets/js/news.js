/* Samuka · /news/ hub
 * The list itself is rendered by Jekyll from _data/news.json (scripts/fetch_news.rb refreshes it
 * on every deploy and every few hours). This adds, on the page:
 *   - section tabs (tech / gaming / dev / saved) and a grep box, combined
 *   - day headings and "3 h ago" times in the visitor's own timezone
 *   - "new since your last visit" marks (last visit kept on this device)
 *   - ☆ save for later (kept on this device, outlives the story dropping off the feed)
 * and SamukaNews.latest() for the terminal's `news` command.
 * Listeners are delegated on document and registered once, so page swaps never stack them.
 */
(function () {
  "use strict";
  var SEEN = "samuka-news-seen", SAVED = "samuka-news-saved", TAB = "samuka-news-tab";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  var state = { section: "", q: "" }, feed = null;

  /* ---------- helpers ---------- */
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    var d = Math.round(s / 86400); return d === 1 ? "yesterday" : d + " days ago";
  }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function dayLabel(t) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = new Date(t); d.setHours(0, 0, 0, 0);
    var diff = Math.round((today - d) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }
  function saved() { try { return JSON.parse(store.get(SAVED) || "[]") || []; } catch (e) { return []; } }
  function isSaved(url) { return saved().some(function (s) { return s.url === url; }); }
  function root() { return document.querySelector("[data-news]"); }

  /* ---------- painting ---------- */
  function rowFromSaved(s) {
    var at = Date.parse(s.at) || Date.now();
    return '<li class="news-row" data-section="' + esc(s.section) + '" data-at="' + esc(s.at) + '" data-url="' + esc(s.url) + '" data-source="' + esc(s.source) + '">' +
      '<div class="news-row__main"><p class="news-row__meta"><i class="news__dot news__dot--' + esc(s.section) + '"></i><b>' + esc(s.source) + "</b> · <time>" + ago(at) + "</time></p>" +
      '<a class="news-row__title" href="' + esc(s.url) + '" target="_blank" rel="noopener external">' + esc(s.title) + "</a></div>" +
      '<button type="button" class="news-row__save is-on" data-news-save aria-pressed="true" aria-label="Remove from saved" title="Remove from saved">★</button></li>';
  }
  function paintSavedList(r) {
    var list = r.querySelector("[data-news-saved-list]");
    if (!list) {
      list = document.createElement("ol");
      list.className = "news__list";
      list.setAttribute("data-news-saved-list", "");
      list.hidden = true;
      r.querySelector("[data-news-list]").after(list);
    }
    list.innerHTML = saved().map(rowFromSaved).join("");
    var n = r.querySelector("[data-news-saved-n]"); if (n) n.textContent = String(saved().length);
    return list;
  }
  function apply() {
    var r = root(); if (!r) return;
    var main = r.querySelector("[data-news-list]"), savedList = paintSavedList(r);
    var onSaved = state.section === "saved", list = onSaved ? savedList : main;
    main.hidden = onSaved; savedList.hidden = !onSaved;
    var q = state.q.trim().toLowerCase(), shown = 0, lastDay = null;
    list.querySelectorAll(".news-row, .news-day").forEach(function (el) {
      if (el.classList.contains("news-day")) { el.hidden = true; lastDay = el; return; }
      var ok = (onSaved || !state.section || el.dataset.section === state.section) &&
        (!q || el.textContent.toLowerCase().indexOf(q) > -1);
      el.hidden = !ok;
      if (ok) { shown++; if (lastDay) lastDay.hidden = false; }
    });
    r.querySelectorAll("[data-news-filter]").forEach(function (b) {
      var on = b.dataset.newsFilter === state.section;
      b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on));
    });
    var none = r.querySelector("[data-news-none]");
    if (none) { none.hidden = shown > 0; none.textContent = onSaved && !q ? "# nothing saved yet: tap ☆ on a story to keep it here" : "# no stories match"; }
  }
  function decorate(r) {
    var list = r.querySelector("[data-news-list]");
    var lastSeen = +store.get(SEEN) || 0, newest = 0, fresh = 0, prevDay = null;
    list.querySelectorAll(".news-day").forEach(function (el) { el.remove(); });
    list.querySelectorAll(".news-row").forEach(function (row) {
      var at = Date.parse(row.dataset.at); if (!at) return;
      newest = Math.max(newest, at);
      var k = dayKey(at);
      if (k !== prevDay) {
        var h = document.createElement("li");
        h.className = "news-day"; h.setAttribute("aria-hidden", "true"); h.textContent = dayLabel(at);
        row.before(h); prevDay = k;
      }
      var t = row.querySelector("time"); if (t) { t.textContent = ago(at); t.title = new Date(at).toLocaleString(); }
      var isNew = lastSeen > 0 && at > lastSeen;
      row.classList.toggle("is-new", isNew); if (isNew) fresh++;
      var b = row.querySelector("[data-news-save]"), on = isSaved(row.dataset.url);
      if (b) { b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "★" : "☆"; }
    });
    var ago_ = r.querySelector("[data-news-ago]");
    if (ago_) { var g = Date.parse(ago_.getAttribute("datetime")); if (g) ago_.textContent = ago(g); }
    var nc = r.querySelector("[data-news-newcount]");
    if (nc) nc.textContent = lastSeen ? (fresh ? fresh + " new since your last visit" : "nothing new since your last visit") : "welcome: ☆ saves a story for later";
    if (newest) store.set(SEEN, String(newest));
  }
  function boot() {
    var r = root(); if (!r) return;
    var tab = store.get(TAB) || "";
    state = { section: /^(tech|gaming|dev|saved)?$/.test(tab) ? tab : "", q: "" };
    var input = r.querySelector("[data-news-q]"); if (input) input.value = "";
    decorate(r);
    apply();
  }

  /* ---------- events (delegated, registered once) ---------- */
  document.addEventListener("click", function (e) {
    var f = e.target.closest && e.target.closest("[data-news-filter]");
    if (f) { state.section = f.dataset.newsFilter; store.set(TAB, state.section || null); apply(); return; }
    var b = e.target.closest && e.target.closest("[data-news-save]");
    if (b) {
      var row = b.closest(".news-row"), url = row.dataset.url, list = saved();
      if (list.some(function (s) { return s.url === url; })) list = list.filter(function (s) { return s.url !== url; });
      else {
        var a = row.querySelector(".news-row__title");
        list.unshift({ url: url, title: a ? a.textContent.trim() : url, source: row.dataset.source, section: row.dataset.section, at: row.dataset.at });
        if (list.length > 100) list.length = 100;
        if (window.SamukaAch) try { window.SamukaAch.unlock("reader"); } catch (x) {}
      }
      store.set(SAVED, JSON.stringify(list));
      var r = root(); if (r) decorate(r);
      apply();
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.matches && e.target.matches("[data-news-q]")) { state.q = e.target.value; apply(); }
  });
  window.addEventListener("samuka:page", boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  /* ---------- for the terminal ---------- */
  function load() {
    if (!feed) feed = fetch("/news/news.json", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status); return r.json();
    }).catch(function (e) { feed = null; throw e; });
    return feed;
  }
  window.SamukaNews = {
    latest: function (section, n) {
      return load().then(function (d) {
        return (d.items || []).filter(function (i) { return !section || i.section === section; }).slice(0, n || 8);
      });
    },
    ago: ago,
    saved: saved
  };
})();
