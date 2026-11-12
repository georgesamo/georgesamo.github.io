/* Samuka · "Your week" recap card on the Today page ([data-recap]).
 * Only data the site already keeps, read for the week that started on Monday (local time):
 *  - scores: public.scores (created_at) for signed-in players, the guest scores waiting in
 *    localStorage "samuka-scores-pending" (t) for signed-out ones, sessionStorage
 *    "samuka-mock-scores" for the local test login, plus any of your own saves still waiting
 *  - badges: public.achievements (unlocked_at); the local badge cache has no dates, so none offline
 *  - tracks: the director's cut, whose unlock is the suite_<theme> badge (dated). Bonus tracks
 *    are stored without a date, so they're left out rather than guessed.
 *  - streak: the player card's streak through SamukaStreak.state (the reminder's own rules)
 * The model and the markup are pure (SamukaRecap.build / .html) and tested in tests/recap.test.js.
 */
(function () {
  "use strict";
  var DAY = 864e5;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var num = function (n) { return Number(n).toLocaleString("en-US"); };

  /* ---------- pure ---------- */
  // Monday 00:00 local time of the week holding `now` (setDate keeps it right across DST changes)
  function weekStart(now) {
    var d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d.getTime();
  }
  function prevWeekStart(now) { var d = new Date(weekStart(now)); d.setDate(d.getDate() - 7); return d.getTime(); }

  /* in: { now, scores: [{game, score, t}], badges: [{key, title, icon, t}], tracks: [{title, t}],
   *       streak: {current, kind}|null, names: {game: label} }
   * out: { empty, from, games: [{game, name, best, last, up}], played, badges, tracks, streak } */
  function build(c) {
    var from = weekStart(c.now), prev = prevWeekStart(c.now), names = c.names || {};
    var cur = {}, last = {}, played = 0;
    (c.scores || []).forEach(function (s) {
      var t = +s.t, sc = +s.score || 0;
      if (!s.game || !isFinite(t) || t > c.now) return;
      if (t >= from) { played++; cur[s.game] = Math.max(cur[s.game] || 0, sc); }
      else if (t >= prev) last[s.game] = Math.max(last[s.game] || 0, sc);
    });
    var games = Object.keys(cur).map(function (g) {
      var l = last[g] || 0;
      return { game: g, name: names[g] || g, best: cur[g], last: l, up: l > 0 && cur[g] > l };
    }).sort(function (a, b) { return b.best - a.best; });
    var thisWeek = function (x) { return +x.t >= from && +x.t <= c.now; };
    var badges = (c.badges || []).filter(thisWeek), tracks = (c.tracks || []).filter(thisWeek);
    var streak = c.streak && c.streak.current > 0 ? c.streak : null;
    return { empty: !played, from: from, games: games, played: played, badges: badges, tracks: tracks, streak: streak };
  }

  function html(m) {
    if (m.empty) {
      return '<p class="recap__nudge"><span aria-hidden="true">🕹</span> Nothing played yet this week. ' +
        '<button class="recap__link" type="button" data-daily>Today\'s daily Gem Match</button> is a good place to start.</p>';
    }
    var rows = m.games.map(function (g) {
      var vs = g.up ? '<span class="recap__up"><span aria-hidden="true">▲</span> beat last week\'s ' + num(g.last) + "</span>"
        : g.last ? '<span class="recap__vs">last week ' + num(g.last) + "</span>" : '<span class="recap__vs">first week</span>';
      return '<li class="recap__row"><span class="recap__game">' + esc(g.name) + '</span><b class="recap__best">' + num(g.best) + "</b>" + vs + "</li>";
    }).join("");
    var stats = ['<li><b>' + m.played + "</b> " + (m.played === 1 ? "game" : "games") + " played</li>"];
    if (m.streak) stats.push('<li><span aria-hidden="true">🔥</span> <b>' + m.streak.current + "-day</b> streak" +
      (m.streak.kind === "kept" ? ", today's done" : m.streak.kind ? ', play today\'s daily to keep it' : "") + "</li>");
    if (m.badges.length) stats.push("<li><b>" + m.badges.length + "</b> " + (m.badges.length === 1 ? "badge" : "badges") + ": " +
      m.badges.map(function (b) { return '<span class="recap__chip">' + (b.icon ? '<span aria-hidden="true">' + esc(b.icon) + "</span> " : "") + esc(b.title || b.key) + "</span>"; }).join(" ") + "</li>");
    if (m.tracks.length) stats.push('<li><span aria-hidden="true">♪</span> <b>' + m.tracks.length + "</b> " + (m.tracks.length === 1 ? "track" : "tracks") + " unlocked: " +
      m.tracks.map(function (t) { return '<span class="recap__chip">' + esc(t.title) + "</span>"; }).join(" ") + "</li>");
    return '<p class="recap__sub">Best score this week, per game</p><ul class="recap__games">' + rows + '</ul><ul class="recap__stats">' + stats.join("") + "</ul>";
  }

  /* ---------- data ---------- */
  function A() { return window.SamukaAuth; }
  function user() { var a = A(); return a && a.user && a.user(); }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function json(store, k) { try { return JSON.parse(store.getItem(k) || "[]") || []; } catch (e) { return []; } }
  // saves that haven't reached the server yet: guest scores, or your own failed saves
  function pending(uid) {
    return json(localStorage, "samuka-scores-pending").filter(function (p) { return p && p.row && p.uid === uid; })
      .map(function (p) { return { game: p.row.game, score: p.row.score, t: p.t }; });
  }
  function mockScores() { return json(sessionStorage, "samuka-mock-scores").map(function (s) { return { game: s.game, score: s.score, t: s.t }; }); }

  var server = null;   // { uid, at, scores, achs }
  function fetchServer(c, u, now) {
    if (server && server.uid === u.id && Date.now() - server.at < 30000) return Promise.resolve(server);
    var since = new Date(prevWeekStart(now)).toISOString();
    return Promise.all([
      c.from("scores").select("game, score, created_at").eq("user_id", u.id).gte("created_at", since).limit(1000),
      c.from("achievements").select("key, unlocked_at").gte("unlocked_at", new Date(weekStart(now)).toISOString())
    ]).then(function (r) {
      server = { uid: u.id, at: Date.now(),
        scores: (r[0].data || []).map(function (s) { return { game: s.game, score: s.score, t: Date.parse(s.created_at) }; }),
        achs: (r[1].data || []).map(function (a) { return { key: a.key, t: Date.parse(a.unlocked_at) }; }) };
      return server;
    }, function () { return null; });
  }
  function badgeInfo(achs) {
    var L = (window.SamukaAch && window.SamukaAch.list) || [], by = {};
    L.forEach(function (a) { by[a.key] = a; });
    return achs.map(function (a) { var b = by[a.key] || {}; return { key: a.key, title: b.title, icon: b.icon, t: a.t }; });
  }
  // the director's cut of a theme opens with its suite_<theme> badge
  function trackInfo(achs) {
    var L = window.SamukaLofi, th = L && L.suite && L.suite.themes ? L.suite.themes() : [], by = {};
    th.forEach(function (x) { by[x.theme] = x; });
    return achs.filter(function (a) { return /^suite_/.test(a.key); }).map(function (a) {
      var k = a.key.slice(6), x = by[k];
      return { title: x ? x.suite + " (" + x.name + ")" : "Director's cut (" + k.charAt(0).toUpperCase() + k.slice(1) + ")", t: a.t };
    });
  }
  function streakOf() {
    var M = window.SamukaMe, K = window.SamukaStreak, a = A(), S = window.SamukaScores;
    if (!user() || !M || !M.fetchCard || !K) return Promise.resolve(null);
    return M.fetchCard(a.publicName()).then(function (card) {
      var st = K.state({ signedIn: true, streak: card && card.streak, done: !!(S && S.dailyDone && S.dailyDone("gems")), on: true, hiddenDay: null, now: Date.now() });
      return st.show ? { current: card.streak.current | 0, kind: st.kind } : null;
    }, function () { return null; });
  }

  /* ---------- page ---------- */
  var gen = 0;
  function render() {
    var el = document.querySelector("[data-recap]");
    if (!el) return;
    var body = el.querySelector("[data-recap-body]"), my = ++gen, now = Date.now(), u = user(), c = u && db();
    var names = (window.SamukaScores && window.SamukaScores.games) || {};
    var scoresP = !u ? Promise.resolve({ scores: pending("guest"), achs: [] })
      : c ? fetchServer(c, u, now).then(function (s) { return s ? { scores: s.scores.concat(pending(u.id)), achs: s.achs } : { scores: pending(u.id), achs: [] }; })
      : Promise.resolve({ scores: mockScores(), achs: [] });   // local test login
    Promise.all([scoresP, streakOf()]).then(function (r) {
      if (my !== gen || !el.isConnected) return;
      var m = build({ now: now, scores: r[0].scores, badges: badgeInfo(r[0].achs), tracks: trackInfo(r[0].achs), streak: r[1], names: names });
      el.classList.toggle("is-empty", m.empty);
      body.innerHTML = html(m);
    });
  }
  function fresh() { server = null; render(); }
  window.addEventListener("samuka:page", render);
  window.addEventListener("samuka:auth", fresh);
  window.addEventListener("samuka:scored", fresh);
  window.addEventListener("samuka:achievement", function () { setTimeout(fresh, 400); });   // after its upsert
  // guests' scores never reach samuka:scored (they wait in the pending list), so catch the game-over too
  window.addEventListener("samuka:game", function (e) { var d = e.detail || {}; if (d.name === "over" && !user()) setTimeout(render, 50); });
  // deferred scripts run before DOMContentLoaded, while me.js (the streak) may still be on its way
  if (document.readyState === "complete") render(); else document.addEventListener("DOMContentLoaded", render);

  window.SamukaRecap = { build: build, html: html, weekStart: weekStart, prevWeekStart: prevWeekStart, render: render };
})();
