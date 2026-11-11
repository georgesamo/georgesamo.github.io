/* Samuka · leaderboards + daily Gem Match
 * - every finished game of a signed-in visitor is saved to public.scores
 * - [data-leaderboard] panel: game tabs × all-time / this week / today's daily
 * - game-over screens show a mini top 5 ([data-lb-mini])
 * - daily Gem Match: one seeded board per UTC day, 20 moves, one attempt, emoji share grid
 */
(function () {
  "use strict";
  var GAMES = { sidekiq: "Sidekiq Rush", gems: "Gem Match", schema: "Schema Stack", pitwall: "Pit Wall" };
  var DAILY = { gems: true };
  var PERIODS = { all: "all-time", week: "this week", daily: "daily" };
  var EPOCH = Date.UTC(2026, 10, 8); // daily #1
  var panels = [], cache = {};
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function A() { return window.SamukaAuth; }
  function user() { var a = A(); return a && a.user && a.user(); }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyNo() { return Math.floor((Date.parse(today()) - EPOCH) / 864e5) + 1; }
  function dailyKey(game) { var u = user(); return "samuka-daily-" + (u ? u.id : "anon") + "-" + today() + (game && game !== "gems" ? "-" + game : ""); }

  /* ---------- saving ---------- */
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name !== "over" || !GAMES[d.game]) return;
    if (!user()) { keepGuestScore(d); return; }
    if (d.mode === "daily") store.set(dailyKey(d.game), JSON.stringify({ score: d.score, grid: d.game === "gems" ? grid(d.log || []) : "" }));
    var c = db();
    if (!c) { // local test session: keep a fake board in sessionStorage so the UI can be tried
      mockSave(d); afterSave(d.game); return;
    }
    var row = { game: d.game, mode: d.mode === "daily" || d.mode === "race" ? d.mode : "free", score: Math.max(0, Math.min(200000, d.score | 0)) };
    if (row.mode === "daily") row.day = today();
    if (!row.score && row.mode === "free") return;   // a zero never beats anything; don't spend the hourly quota on it
    insert(c, row).then(function () { afterSave(d.game, row.mode === "daily" ? "daily" : null); });
  });

  /* a failed save (offline, token refresh, a missing SQL update) is kept and retried later,
   * so a good score is never silently lost */
  var PENDING = "samuka-scores-pending";
  function pendingList() { try { return JSON.parse(store.get(PENDING) || "[]"); } catch (e) { return []; } }
  function setPending(list) { store.set(PENDING, JSON.stringify(list.slice(-30))); }
  function insert(c, row) {
    return c.from("scores").insert(row).then(function (r) {
      if (!r.error) return true;
      console.warn("[scores] not saved yet:", r.error.message, r.error.code === "23514" ? "(run supabase/games.sql so this game is allowed)" : "");
      // dailies are only valid on their own day; everything else can be retried
      if (row.mode !== "daily") { var u = user(), list = pendingList(); list.push({ uid: u && u.id, row: row, t: Date.now() }); setPending(list); }
      return false;
    }, function () { var u = user(), list = pendingList(); if (row.mode !== "daily") { list.push({ uid: u && u.id, row: row, t: Date.now() }); setPending(list); } return false; });
  }
  /* guests play too: their free-play scores wait here (uid "guest") and move to the
   * account that signs in next on this device */
  var GUEST = "guest";
  function keepGuestScore(d) {
    var a = A(), score = Math.max(0, Math.min(200000, d.score | 0));
    if (!a || !a.enabled || d.mode === "daily" || d.mode === "race" || !score) return false;
    var list = pendingList();
    list.push({ uid: GUEST, row: { game: d.game, mode: "free", score: score }, t: Date.now() });
    setPending(list);
    return true;
  }
  function guestScores() { return pendingList().filter(function (p) { return p.uid === GUEST; }); }
  function notify(text) {
    var el = document.createElement("div");
    el.className = "ach-toast";
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="ach-toast__icon" aria-hidden="true">💾</span><span><small>scores saved</small><b>' + esc(text) + "</b></span>";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    setTimeout(function () { el.classList.remove("is-in"); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
  }
  var flushing = false;
  async function flushPending() {
    var c = db(), u = user();
    if (!c || !u || flushing) return;
    var list = pendingList(), keep = [], sent = 0, claimed = 0;
    if (!list.length) return;
    flushing = true;
    for (var k = 0; k < list.length; k++) {
      var p = list[k], guest = p.uid === GUEST, fresh = Date.now() - p.t < 30 * 864e5;
      if (!fresh) continue;
      if (p.uid !== u.id && !guest) { keep.push(p); continue; }   // another account's retry on this device
      var r = await c.from("scores").insert(p.row);
      if (r.error) keep.push(guest ? { uid: u.id, row: p.row, t: p.t } : p);
      else { sent++; if (guest) claimed++; }
    }
    setPending(keep); flushing = false;
    if (claimed) notify(claimed === 1 ? "1 guest score moved to your account" : claimed + " guest scores moved to your account");
    if (sent) { cache = {}; loadAll(); syncBests(); }
  }
  // your best per game from the server, so "your best" is right on every device
  async function syncBests() {
    var c = db(), u = user(), Ar = window.SamukaArcade;
    if (!c || !u || !Ar || !Ar.mergeBests) return;
    var map = {};
    var r = await c.from("scores").select("game, score").eq("user_id", u.id).neq("mode", "daily").order("score", { ascending: false }).limit(500);
    if (r.error) return;
    (r.data || []).forEach(function (s) { if (!map[s.game] || s.score > map[s.game]) map[s.game] = s.score; });
    Ar.mergeBests(map);
  }
  function afterSave(game, period) {
    cache = {};
    window.dispatchEvent(new CustomEvent("samuka:scored", { detail: { game: game, period: period || "all" } }));
    fillMinis(game, period);
    loadAll();
    // podium check across the boards the score could land on
    ["all", "week"].concat(period === "daily" ? ["daily"] : []).forEach(function (p) {
      fetchBoard(game, p, 3).then(function (rows) {
        if (rows.some(function (r) { return r.me; }) && window.SamukaAch) window.SamukaAch.unlock("podium");
      });
    });
  }
  function mockSave(d) {
    var k = "samuka-mock-scores", all = [];
    try { all = JSON.parse(sessionStorage.getItem(k) || "[]"); } catch (e) {}
    all.push({ game: d.game, mode: d.mode, score: d.score, day: today(), t: Date.now() });
    try { sessionStorage.setItem(k, JSON.stringify(all)); } catch (e) {}
  }

  /* ---------- reading ---------- */
  async function fetchBoard(game, period, limit) {
    var key = game + "|" + period + "|" + limit;
    if (cache[key] && Date.now() - cache[key].t < 30000) return cache[key].rows;
    var rows = [];
    var c = db();
    if (c) {
      var r = await c.rpc("leaderboard", { p_game: game, p_period: period, p_limit: limit });
      if (r.error) throw r.error;
      rows = r.data || [];
    } else {
      var all = []; try { all = JSON.parse(sessionStorage.getItem("samuka-mock-scores") || "[]"); } catch (e) {}
      var best = 0;
      all.forEach(function (s) { if (s.game === game && (period === "daily" ? s.mode === "daily" : s.mode !== "daily")) best = Math.max(best, s.score); });
      rows = [{ rank: 1, name: "rubyist", role: "user", score: 4210, me: false }, { rank: 2, name: "pm-nino", role: "nino", score: 3100, me: false }];
      if (best) rows.push({ rank: 0, name: "you (local)", role: (A() && A().role()) || "user", score: best, me: true });
      rows.sort(function (a, b) { return b.score - a.score; }).forEach(function (r, i) { r.rank = i + 1; });
      rows = rows.slice(0, limit);
    }
    cache[key] = { t: Date.now(), rows: rows };
    return rows;
  }
  function rowsHtml(rows) {
    if (!rows.length) return '<p class="lb__empty muted">No scores yet. Be the first.</p>';
    return '<ol class="lb__list">' + rows.map(function (r) {
      var medal = r.rank === 1 ? "lb__row--gold" : r.rank === 2 ? "lb__row--steel" : r.rank === 3 ? "lb__row--violet" : "";
      return '<li class="lb__row ' + medal + (r.me ? " is-me" : "") + '"><span class="lb__rank">' + r.rank + '</span><span class="lb__name"><a href="/u/?n=' + encodeURIComponent(r.name) + '">' + esc(r.name) + "</a>" +
        (r.role === "samuka" || r.role === "nino" ? ' <span class="lb__role lb__role--' + r.role + '">' + r.role + "</span>" : "") + (r.me ? ' <span class="lb__you">you</span>' : "") +
        '</span><span class="lb__score">' + Number(r.score).toLocaleString("en-US") + "</span></li>";
    }).join("") + "</ol>";
  }

  /* ---------- leaderboard panels ([data-leaderboard], optional data-game / data-period / data-limit / data-fixed) ---------- */
  function renderPanel(pn) {
    var v = pn.view, el = pn.el, fixed = el.hasAttribute("data-fixed");
    el.innerHTML =
      '<div class="lb__head"><p class="lb__title"><span class="prompt">$</span> rails leaderboard:show' + (fixed ? "[" + v.game + "]" : "") + "</p>" +
      (fixed ? '<p class="lb__fixed">' + GAMES[v.game] + "</p>" : '<div class="lb__tabs" role="tablist">' + Object.keys(GAMES).map(function (g) {
        return '<button type="button" role="tab" aria-selected="' + (g === v.game) + '" data-lb-game="' + g + '">' + GAMES[g] + "</button>";
      }).join("") + "</div>") +
      '<div class="lb__tabs lb__tabs--sub">' + Object.keys(PERIODS).filter(function (p) { return p !== "daily" || DAILY[v.game]; }).map(function (p) {
        return '<button type="button" aria-pressed="' + (p === v.period) + '" data-lb-period="' + p + '">' + PERIODS[p] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="lb__body" data-lb-body><p class="muted">loading…</p></div>' +
      (user() ? "" : '<p class="lb__note muted">Sign in to put your name on the board. Your email is never shown; set a nickname in your account.</p>');
  }
  async function load(pn) {
    if (!pn) return loadAll();
    if (!DAILY[pn.view.game] && pn.view.period === "daily") pn.view.period = "all";
    renderPanel(pn);
    var body = pn.el.querySelector("[data-lb-body]");
    try { body.innerHTML = rowsHtml(await fetchBoard(pn.view.game, pn.view.period, pn.limit)); }
    catch (err) { body.innerHTML = '<p class="muted">Leaderboard is offline right now.</p>'; console.warn("[scores]", err.message || err); }
  }
  function loadAll() { panels.forEach(function (pn) { load(pn); }); }
  function panelOf(el) { var root = el.closest("[data-leaderboard]"); return panels.filter(function (p) { return p.el === root; })[0]; }
  async function fillMinis(game, period) {
    var els = document.querySelectorAll('[data-lb-mini="' + game + '"]');
    if (!els.length) return;
    var html;
    try { html = '<p class="lb-mini__title">' + (period === "daily" ? "today's daily" : "top 5 · all-time") + "</p>" + rowsHtml(await fetchBoard(game, period || "all", 5)); }
    catch (e) { html = ""; }
    els.forEach(function (el) { el.innerHTML = html; });
  }

  /* ---------- daily ---------- */
  function grid(log) {
    var cells = log.map(function (m) {
      if (m.power && m.pts >= 200) return "💥";
      return m.pts >= 300 ? "🟪" : m.pts >= 120 ? "🟨" : m.pts > 0 ? "🟩" : "⬛";
    });
    var rows = []; for (var i = 0; i < cells.length; i += 5) rows.push(cells.slice(i, i + 5).join(""));
    return rows.join("\n");
  }
  function shareText(score, g) {
    return "Gem Match daily #" + dailyNo() + " · " + Number(score).toLocaleString("en-US") + " pts\n" + g + "\nhttps://georgesamo.github.io/#arcade";
  }
  function dailyIntro(moves) {
    return '<p class="arcade__kicker">$ rails gems:daily[' + today() + "]</p><h3>Daily #" + dailyNo() + "</h3>" +
      "<p>Same board for everyone today. <b>" + moves + " moves</b>, one attempt. Your score goes on today's board, and you get a grid to share.</p>" +
      '<button class="btn btn--primary" type="button" data-gm-start>▶ start the daily</button>';
  }
  function dailyCard(score, log) {
    var g = grid(log);
    setTimeout(function () { fillMinis("gems", "daily"); }, 50);
    return '<p class="arcade__kicker">$ rails gems:daily · done</p><h3>Daily #' + dailyNo() + " · " + Number(score).toLocaleString("en-US") + " pts</h3>" +
      '<pre class="daily__grid" aria-label="your moves">' + esc(g) + "</pre>" +
      '<button class="btn btn--primary" type="button" data-daily-share data-text="' + esc(shareText(score, g)) + '">⧉ copy result</button>' +
      '<p class="muted daily__next">New board in ' + untilTomorrow() + ".</p>" +
      '<div class="lb-mini" data-lb-mini="gems"></div>';
  }
  function untilTomorrow() {
    var now = new Date(), next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    var m = Math.max(1, Math.round((next - now) / 60000));
    return (m >= 60 ? Math.floor(m / 60) + " h " : "") + (m % 60) + " min";
  }
  async function alreadyPlayed(game) {
    var local = store.get(dailyKey(game));
    if (local) { try { return JSON.parse(local); } catch (e) { return { score: 0, grid: "" }; } }
    var c = db(); if (!c) return null;
    var r = await c.from("scores").select("score").eq("mode", "daily").eq("game", game).eq("day", today()).maybeSingle();
    return r.data ? { score: r.data.score, grid: "" } : null;
  }
  async function openDaily(game) {
    game = DAILY[game] ? game : "gems";
    var Ar = window.SamukaArcade, a = A();
    if (!Ar) return;
    if (a && a.enabled && !user()) { a.open({ reason: "arcade" }); return; }
    var done = await alreadyPlayed(game);
    if (done) {
      Ar.open(game, { mode: "daily", seed: game + "-daily-" + today(), replay: true });
      // show the result card instead of a new attempt
      setTimeout(function () {
        var stage = document.querySelector(".arcade [data-stage]");
        var o = stage && stage.querySelector(".arcade__overlay .arcade__card");
        if (o) o.innerHTML = '<p class="arcade__kicker">$ rails ' + (game === "regex" ? "regex" : "gems") + ':daily</p><h3>You already played ' + (game === "regex" ? "today's hole" : "daily #" + dailyNo()) + "</h3>" +
          "<p>Your score: <b>" + Number(done.score).toLocaleString("en-US") + "</b></p>" +
          (done.grid ? '<pre class="daily__grid">' + esc(done.grid) + '</pre><button class="btn btn--primary" type="button" data-daily-share data-text="' + esc(shareText(done.score, done.grid)) + '">⧉ copy result</button>' : "") +
          '<p class="muted">New ' + (game === "regex" ? "hole" : "board") + " in " + untilTomorrow() + '.</p><div class="lb-mini" data-lb-mini="' + game + '"></div>';
        fillMinis(game, "daily");
      }, 60);
      return;
    }
    Ar.open(game, { mode: "daily", seed: game + "-daily-" + today() });
  }

  document.addEventListener("click", function (e) {
    var t;
    if ((t = e.target.closest("[data-lb-game]"))) { var pg = panelOf(t); if (pg) { pg.view.game = t.getAttribute("data-lb-game"); load(pg); } }
    else if ((t = e.target.closest("[data-lb-period]"))) { var pp = panelOf(t); if (pp) { pp.view.period = t.getAttribute("data-lb-period"); load(pp); } }
    else if ((t = e.target.closest("[data-daily]"))) { e.preventDefault(); openDaily(t.getAttribute("data-daily") || "gems"); }
    else if ((t = e.target.closest("[data-daily-share]"))) {
      var text = t.getAttribute("data-text");
      var done = function () { t.textContent = "✓ copied"; setTimeout(function () { t.textContent = "⧉ copy result"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy your result:", text); });
      else window.prompt("Copy your result:", text);
    }
  });
  // fill mini boards when a free-play game-over screen appears
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name === "over" && d.mode === "free") setTimeout(function () { fillMinis(d.game, "all"); }, 30);
  });
  window.addEventListener("samuka:auth", function () { cache = {}; loadAll(); if (user()) { syncBests(); flushPending(); } });
  window.addEventListener("online", flushPending);

  function boot() {
    panels = Array.prototype.map.call(document.querySelectorAll("[data-leaderboard]"), function (el) {
      return { el: el, view: { game: el.getAttribute("data-game") || "gems", period: el.getAttribute("data-period") || "all" }, limit: +(el.getAttribute("data-limit") || 10) };
    });
    loadAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.addEventListener("samuka:page", boot);

  // your place on a board: { rank, behind } (points to the next place up), or null when you're not in the top `limit`
  function rankOf(game, period, limit) {
    return fetchBoard(game, period || "all", limit || 100).then(function (rows) {
      for (var i = 0; i < rows.length; i++) if (rows[i].me) return { rank: rows[i].rank, behind: i > 0 ? Math.max(0, rows[i - 1].score - rows[i].score) : 0, of: rows.length };
      return null;
    }, function () { return null; });
  }
  function dailyDone(game) { return !!store.get(dailyKey(game || "gems")); }
  window.SamukaScores = { fillMini: fillMinis, games: GAMES, dailyIntro: dailyIntro, dailyCard: dailyCard, openDaily: openDaily, board: fetchBoard, reload: function () { cache = {}; loadAll(); },
    rankOf: rankOf, dailyDone: dailyDone,
    guestScores: guestScores, keepGuestScore: keepGuestScore, flushPending: flushPending };
})();
