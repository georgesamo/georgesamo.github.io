/* Samuka · weekly challenges + seasonal events
 * One challenge per ISO week (the same for everyone, picked from a rotation).
 * Progress is tracked from game events; finishing it stores a row in
 * public.event_completions and unlocks the "Sprint goal met" badge.
 * Seasons add a light decoration to the lobby on a few dates of the year.
 */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var CHALLENGES = [
    { id: "gems_score", icon: "💎", title: "Score 3,000 in one Gem Match run", goal: 3000, kind: "max", match: function (d) { return d.game === "gems" && d.name === "over" ? d.score : null; } },
    { id: "sidekiq_jobs", icon: "📬", title: "Process 120 jobs in one Sidekiq Rush run", goal: 120, kind: "max", match: function (d) { return d.game === "sidekiq" && d.name === "over" ? d.done : null; } },
    { id: "pipelines", icon: "⇶", title: "Fire 15 Pipelines in Gem Match", goal: 15, kind: "sum", match: function (d) { return d.game === "gems" && d.name === "pipeline" ? 1 : null; } },
    { id: "dailies", icon: "📅", title: "Finish 3 daily puzzles", goal: 3, kind: "sum", match: function (d) { return d.name === "over" && d.mode === "daily" ? 1 : null; } },
    { id: "bundles", icon: "✦", title: "Create 3 Bundles", goal: 3, kind: "sum", match: function (d) { return d.game === "gems" && d.name === "bundle" ? 1 : null; } },
    { id: "live", icon: "⚔", title: "Play 2 live 2-player games", goal: 2, kind: "sum", match: function (d) { return d.name === "over" && d.mode === "race" ? 1 : null; } },
    { id: "retries", icon: "♻", title: "Watch Sidekiq retry 25 jobs", goal: 25, kind: "sum", match: function (d) { return d.game === "sidekiq" && d.name === "retry" ? 1 : null; } },
    { id: "games", icon: "🕹", title: "Finish 8 games of anything", goal: 8, kind: "sum", match: function (d) { return d.name === "over" ? 1 : null; } }
  ];
  // seasons (month-day ranges, inclusive)
  var SEASONS = [
    { id: "winter", name: "Winter release", from: "12-15", to: "01-07", icon: "❄", note: "snow on the lobby, a frosty glow on every skin" },
    { id: "valentine", name: "Valentine merge", from: "02-10", to: "02-14", icon: "💜", note: "hearts drift through the lobby" },
    { id: "spring", name: "Spring cleanup", from: "03-20", to: "04-02", icon: "🌱", note: "petals, and a fresh coat of green" },
    { id: "halloween", name: "Deploy freeze (Halloween)", from: "10-25", to: "11-01", icon: "🎃", note: "pumpkins and bats in the lobby" }
  ];

  function isoWeek(d) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var w = Math.ceil(((d - y0) / 864e5 + 1) / 7);
    return { year: d.getUTCFullYear(), week: w, id: d.getUTCFullYear() + "-W" + (w < 10 ? "0" : "") + w };
  }
  var WEEK = isoWeek(new Date());
  var CH = CHALLENGES[(WEEK.year * 53 + WEEK.week) % CHALLENGES.length];
  function endsIn() {
    var now = new Date(), day = now.getUTCDay() || 7;
    var end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day));
    var h = Math.max(0, Math.round((end - now) / 36e5));
    return h >= 48 ? Math.floor(h / 24) + " days" : h + " h";
  }
  function md(d) { return ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function inRange(x, a, b) { return a <= b ? x >= a && x <= b : x >= a || x <= b; }
  function season(d) { var x = md(d || new Date()); return SEASONS.filter(function (s) { return inRange(x, s.from, s.to); })[0] || null; }
  function nextSeason() {
    var d = new Date();
    for (var i = 1; i < 370; i++) { d.setDate(d.getDate() + 1); var s = season(d); if (s) return { s: s, days: i }; }
    return null;
  }

  function A() { return window.SamukaAuth; }
  function uid() { var a = A(); return a && a.user() ? a.user().id : null; }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function key() { return "samuka-week-" + uid() + "-" + WEEK.id; }
  function prog() { try { return JSON.parse(store.get(key()) || "null") || { v: 0, done: false }; } catch (e) { return { v: 0, done: false }; } }

  window.addEventListener("samuka:game", function (e) {
    if (!uid()) return;
    var d = e.detail || {}, x = CH.match(d);
    if (x == null) return;
    var p = prog();
    if (p.done) return;
    p.v = CH.kind === "max" ? Math.max(p.v, x || 0) : p.v + x;
    if (p.v >= CH.goal) { p.done = true; finish(); }
    store.set(key(), JSON.stringify(p));
    paint();
  });
  function finish() {
    if (window.SamukaAch) window.SamukaAch.unlock("weekly");
    var c = db();
    if (c) c.from("event_completions").upsert({ week: WEEK.id, challenge: CH.id }, { onConflict: "user_id,week", ignoreDuplicates: true }).then(function (r) { if (r.error) console.warn("[events]", r.error.message); loadFinishers(); });
    toast();
  }
  function toast() {
    var el = document.createElement("div");
    el.className = "ach-toast"; el.setAttribute("role", "status");
    el.innerHTML = '<span class="ach-toast__icon" aria-hidden="true">🗓</span><span><small>weekly challenge</small><b>Sprint goal met · ' + esc(WEEK.id) + "</b></span>";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    setTimeout(function () { el.classList.remove("is-in"); setTimeout(function () { el.remove(); }, 500); }, 3800);
  }

  var finishers = null;
  async function loadFinishers() {
    var c = db() || (A() && A().client && A().client());
    if (!c || (A().mock && A().mock())) { finishers = []; paint(); return; }
    var r = await c.rpc("event_finishers", { p_week: WEEK.id });
    finishers = r.error ? [] : (r.data || []);
    paint();
  }

  function bar(p) {
    var pct = Math.min(100, (p.v / CH.goal) * 100);
    return '<div class="ev-bar' + (p.done ? " is-done" : "") + '"><i style="width:' + pct.toFixed(1) + '%"></i></div><p class="ev-prog">' + (p.done ? "✓ done this week" : Math.min(p.v, CH.goal).toLocaleString("en-US") + " / " + CH.goal.toLocaleString("en-US")) + "</p>";
  }
  function paint() {
    var signed = !!uid(), p = signed ? prog() : null;
    var stat = document.querySelector("[data-hub-event]");
    if (stat) stat.innerHTML = '<a href="/events/">' + (p && p.done ? "✓ " : "") + esc(CH.icon + " " + WEEK.id.slice(5)) + "</a>";
    var card = document.querySelector("[data-hub-eventcard]");
    if (card) card.innerHTML = '<p class="hub-card__title">this week · ends in ' + endsIn() + "</p>" +
      '<p class="ev-title"><span aria-hidden="true">' + CH.icon + "</span> " + esc(CH.title) + "</p>" + (signed ? bar(p) : '<p class="muted">Sign in to take part.</p>');
    var page = document.querySelector("[data-events]");
    if (!page) return;
    var s = season(), nx = nextSeason();
    page.innerHTML =
      '<article class="ev-card"><p class="ev-kicker">weekly challenge · ' + esc(WEEK.id) + " · ends in " + endsIn() + "</p>" +
        '<h3 class="ev-title"><span aria-hidden="true">' + CH.icon + "</span> " + esc(CH.title) + "</h3>" +
        (signed ? bar(p) : '<p class="muted">Sign in to take part; your progress counts from any game you play this week.</p>') +
        '<div class="lobby__actions"><button class="btn btn--primary" type="button" data-play="gems">▶ Gem Match</button><button class="btn" type="button" data-play="sidekiq">▶ Sidekiq Rush</button><button class="btn" type="button" data-daily>📅 daily</button><button class="btn" type="button" data-race>⚔ 2-player</button></div></article>' +
      '<article class="ev-card"><p class="ev-kicker">finished this week</p>' +
        (finishers == null ? '<p class="muted">loading…</p>' : finishers.length ? '<ol class="players">' + finishers.map(function (f) { return '<li><i></i><a href="/u/?n=' + encodeURIComponent(f.name) + '">' + esc(f.name) + '</a> <span class="muted">' + new Date(f.at).toLocaleDateString("en-US", { weekday: "short" }) + "</span></li>"; }).join("") + "</ol>" : '<p class="muted">Nobody yet. Be the first.</p>') +
      "</article>" +
      '<article class="ev-card"><p class="ev-kicker">seasons</p>' +
        (s ? '<p class="ev-now">' + s.icon + " <b>" + esc(s.name) + "</b> is on now · " + esc(s.note) + "</p>" : nx ? '<p class="ev-now">Next: ' + nx.s.icon + " <b>" + esc(nx.s.name) + "</b> in " + nx.days + " days</p>" : "") +
        '<ul class="ev-seasons">' + SEASONS.map(function (x) { return "<li" + (s && s.id === x.id ? ' class="is-on"' : "") + "><span>" + x.icon + "</span><b>" + esc(x.name) + "</b><small>" + x.from + " → " + x.to + " · " + esc(x.note) + "</small></li>"; }).join("") + "</ul>" +
      "</article>";
  }

  /* seasonal decoration on the lobby (no flashing; skipped for reduced motion) */
  function decorate() {
    var s = season(); if (!s) return;
    document.documentElement.setAttribute("data-season", s.id);
    var host = document.querySelector(".lobby"); if (!host || reduced) return;
    var glyph = { winter: "❄", valentine: "💜", spring: "🌸", halloween: "🦇" }[s.id];
    var layer = document.createElement("div"); layer.className = "season-fx"; layer.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 18; i++) {
      var sp = document.createElement("span"); sp.textContent = glyph;
      sp.style.left = (Math.random() * 100).toFixed(1) + "%";
      sp.style.animationDelay = (-Math.random() * 14).toFixed(1) + "s";
      sp.style.animationDuration = (10 + Math.random() * 8).toFixed(1) + "s";
      sp.style.fontSize = (10 + Math.random() * 12).toFixed(0) + "px";
      layer.appendChild(sp);
    }
    host.appendChild(layer);
  }

  window.addEventListener("samuka:auth", function () { paint(); });
  function boot() { paint(); decorate(); loadFinishers(); }
  window.addEventListener("samuka:page", boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.SamukaEvents = {
    week: WEEK, challenge: CH, season: season,
    text: function () {
      var p = uid() ? prog() : null;
      return CH.icon + " <b>" + esc(CH.title) + "</b> · " + WEEK.id + " · ends in " + endsIn() + "\n" + (p ? (p.done ? '<span class="ok">✓ done</span>' : "progress " + Math.min(p.v, CH.goal) + " / " + CH.goal) : '<span class="dim">sign in to take part</span>');
    }
  };
})();
