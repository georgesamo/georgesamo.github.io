/* Samuka · weekly tournament
 * One seeded board per game per ISO week (UTC, Monday to Sunday). Everyone gets the same board:
 * the seed is "<game>-tournament-<week>", e.g. "gems-tournament-2026-W46". Play it as often as
 * you like; your best run of the week counts. Signed-in players only (like the daily), so every
 * run has a name on it.
 *
 * - [data-tournament]    the tournament page (/leaderboards/tournament/): this week's standings per
 *                        game, time left, last week's winners
 * - [data-tourney-card]     a short card (lobby "Today" section) pointing to it
 * - [data-tourney-play=id]  play this week's board of a game
 * - game over in "tournament" mode: the run is saved (supabase/tournament.sql) and the result card
 *   shows your best and rank this week
 * - trophies: a week's winner per game is worked out on the server when it's read (no cron job);
 *   withTrophies(card) adds a player's wins to a player card (player.js, me.js), drawn as 🏆
 *
 * The game list is never hard-coded: it's whatever SamukaArcade.list() has, named from
 * _data/games.yml when the page carries it ([data-tourney-games]).
 * A local test session (?as=user|samuka|nino on localhost) keeps runs in localStorage, with a few
 * made-up rivals and last week's winners, so nothing reaches the real database.
 */
(function () {
  "use strict";
  var DAY = 864e5;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return (n | 0).toLocaleString("en-US"); };
  // analytics.js loads after this file: a use counted while the page is still loading waits for it
  var early = [];
  function track(n) {
    if (window.SamukaTrack) { window.SamukaTrack(n); return; }
    if (early.push(n) > 1) return;
    window.addEventListener("load", function () { var q = early; early = []; q.forEach(function (x) { if (window.SamukaTrack) window.SamukaTrack(x); }); }, { once: true });
  }

  /* ---------- the week ---------- */
  // ISO 8601 week of a time (UTC): { key: "2026-W46", year, week, start (Monday 00:00 UTC), end (next Monday) }
  function weekOf(t) {
    var d = new Date(t == null ? Date.now() : t);
    var day = d.getUTCDay() || 7;   // Monday 1 … Sunday 7
    var start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (day - 1) * DAY;
    var thu = new Date(start + 3 * DAY), year = thu.getUTCFullYear();   // the week belongs to its Thursday's year
    var week = Math.floor((thu - Date.UTC(year, 0, 1)) / (7 * DAY)) + 1;
    return { key: year + "-W" + (week < 10 ? "0" : "") + week, year: year, week: week, start: start, end: start + 7 * DAY };
  }
  function prevWeek(t) { return weekOf(weekOf(t).start - DAY); }
  function seedFor(game, key) { return game + "-tournament-" + key; }
  // "2 d 5 h", "5 h 12 min", "12 min"
  function left(ms) {
    var m = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    if (d) return d + " d " + h + " h";
    if (h) return h + " h " + (m % 60) + " min";
    return m + " min";
  }
  function timeLeft(now) { now = now == null ? Date.now() : now; return left(weekOf(now).end - now); }
  function range(w) {
    var o = { month: "short", day: "numeric", timeZone: "UTC" };
    try { return new Date(w.start).toLocaleDateString("en-US", o) + " – " + new Date(w.end - DAY).toLocaleDateString("en-US", o); } catch (e) { return ""; }
  }

  /* ---------- games ---------- */
  function yml() {
    var el = document.querySelector("[data-tourney-games]");
    if (!el) return [];
    try { return JSON.parse(el.textContent) || []; } catch (e) { return []; }
  }
  function pretty(title) {   // "pit-wall.rb" → "Pit Wall"
    return String(title || "").replace(/\.\w+$/, "").split(/[-_ ]+/).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }
  // [{ id, name, icon }] for every arcade game, in the order of _data/games.yml when known
  function games() {
    var Ar = window.SamukaArcade, list = Ar && Ar.list ? Ar.list() : [], meta = yml(), S = window.SamukaScores, out = [];
    var named = function (id, title) {
      var m = meta.filter(function (g) { return g.id === id; })[0];
      return { id: id, name: (m && m.name) || (S && S.games && S.games[id]) || pretty(title || id), icon: (m && m.icon) || "🎮" };
    };
    meta.forEach(function (g) { if (list.some(function (x) { return x.id === g.id; })) out.push(named(g.id)); });
    list.forEach(function (g) { if (!out.some(function (x) { return x.id === g.id; })) out.push(named(g.id, g.title)); });
    return out;
  }
  function nameOf(id) { var g = games().filter(function (x) { return x.id === id; })[0]; return g ? g.name : pretty(id); }

  /* ---------- auth ---------- */
  function A() { return window.SamukaAuth; }
  function user() { var a = A(); return a && a.user && a.user(); }
  function mockRole() { var a = A(); return a && a.mock ? a.mock() : null; }
  function myName() { var a = A(); return user() && a.publicName ? a.publicName() : "you"; }

  /* ---------- server (supabase/tournament.sql) ---------- */
  function cl() { var a = A(); return user() && a.client && !mockRole() ? a.client() : null; }
  function anyClient() { var a = A(); return a && a.client && !mockRole() ? a.client() : null; }
  var server = {
    save: function (game, week, score) {
      var c = cl(); if (!c) return Promise.resolve(false);
      return c.from("tournament_runs").insert({ game: game, week: week, score: score | 0 }).then(function (r) {
        if (r.error) console.warn("[tournament] not saved:", r.error.message, /tournament_runs/.test(r.error.message || "") ? "(run supabase/tournament.sql)" : "");
        return !r.error;
      }, function () { return false; });
    },
    standings: function (week, limit) {
      var c = anyClient(); if (!c) return Promise.reject(new Error("offline"));
      return c.rpc("tournament_standings", { p_week: week || null, p_limit: limit || 10 }).then(function (r) { if (r.error) throw r.error; return r.data; });
    },
    winners: function (weeks) {
      var c = anyClient(); if (!c) return Promise.reject(new Error("offline"));
      return c.rpc("tournament_winners", { p_weeks: weeks || 1 }).then(function (r) { if (r.error) throw r.error; return r.data || []; });
    },
    trophies: function (name) {
      var c = anyClient(); if (!c) return Promise.resolve([]);
      return c.rpc("tournament_trophies", { p_name: name }).then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; });
    }
  };

  /* ---------- local test session: localStorage, with made-up rivals ---------- */
  var MOCK_KEY = "samuka-mock-tournament";
  function mockRuns() { try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || []; } catch (e) { return []; } }
  function rivals(week, ids, me) {
    // stable made-up scores per week and game, so the page looks lived-in
    var Ar = window.SamukaArcade, out = [];
    ids.forEach(function (id, i) {
      var r = Ar && Ar.seeded ? Ar.seeded(seedFor(id, week)) : Math.random;
      out.push({ name: "rubyist", role: "user", game: id, week: week, score: 800 + Math.floor(r() * 3000), at: 1 });
      out.push({ name: "pm-nino", role: "nino", game: id, week: week, score: 500 + Math.floor(r() * 2500), at: 2 });
      // last week, the mock player won every other game: their card shows a trophy
      if (me && i % 2 === 1 && week !== weekOf().key) out.push({ name: me, role: "user", game: id, week: week, score: 5000 + Math.floor(r() * 900), at: 0, mine: true });
    });
    return out;
  }
  function mockRows(week) {
    var me = mockRole() && user() ? myName() : null, ids = games().map(function (g) { return g.id; });
    var mine = mockRuns().filter(function (r) { return r.week === week && r.who === mockRole(); })
      .map(function (r) { return { name: me, role: r.role, game: r.game, week: week, score: r.score, at: r.at, mine: true }; });
    return rivals(week, ids, me).concat(mine);
  }
  // pure: the standings object (same shape as tournament_standings()) from a list of runs
  function standingsFrom(rows, week, current, limit) {
    var best = {};   // game|name → best run (earliest wins a tie)
    rows.forEach(function (r) {
      var k = r.game + "|" + r.name, b = best[k];
      if (!b || r.score > b.score || (r.score === b.score && r.at < b.at)) best[k] = r;
    });
    var by = {}, out = { week: week, current: !!current, players: 0, games: {}, mine: {} }, people = {};
    Object.keys(best).forEach(function (k) { var r = best[k]; (by[r.game] = by[r.game] || []).push(r); people[r.name] = 1; });
    out.players = Object.keys(people).length;
    Object.keys(by).forEach(function (g) {
      var list = by[g].sort(function (a, b) { return b.score - a.score || a.at - b.at; }), rank = 0;
      list.forEach(function (r, i) { rank = i && list[i - 1].score === r.score ? rank : i + 1; r.rank = rank; });
      out.games[g] = list.slice(0, limit || 10).map(function (r) { return { rank: r.rank, name: r.name, role: r.role, score: r.score, me: !!r.mine }; });
      list.forEach(function (r) { if (r.mine) out.mine[g] = { rank: r.rank, score: r.score, of: list.length }; });
    });
    return out;
  }
  var mock = {
    save: function (game, week, score) {
      if (week !== weekOf().key || !(score > 0)) return Promise.resolve(false);
      var runs = mockRuns(), a = A();
      runs.push({ who: mockRole(), role: (a && a.role && a.role()) || "user", game: game, week: week, score: score | 0, at: Date.now() });
      try { localStorage.setItem(MOCK_KEY, JSON.stringify(runs.slice(-200))); } catch (e) {}
      return Promise.resolve(true);
    },
    standings: function (week, limit) {
      week = week || weekOf().key;
      return Promise.resolve(standingsFrom(mockRows(week), week, week === weekOf().key, limit));
    },
    winners: function (n) {
      var out = [], w = prevWeek();
      for (var i = 0; i < (n || 1); i++) {
        var s = standingsFrom(mockRows(w.key), w.key, false, 50);
        Object.keys(s.games).sort().forEach(function (g) { var top = s.games[g][0]; out.push({ week: w.key, game: g, name: top.name, role: top.role, score: top.score, players: s.games[g].length, me: top.me }); });
        w = prevWeek(w.start);
      }
      return Promise.resolve(out);
    },
    trophies: function (name) {
      return mock.winners(1).then(function (rows) {
        return rows.filter(function (r) { return r.name === name; }).map(function (r) { return { week: r.week, game: r.game, score: r.score, players: r.players }; });
      });
    }
  };
  var override = null;
  function backend() { return override || (mockRole() ? mock : server); }

  /* ---------- playing ---------- */
  var active = null;   // { game, week, seed } of the run being played
  function play(game) {
    var Ar = window.SamukaArcade, a = A();
    if (!Ar) return false;
    if (a && a.enabled && !user()) { a.open({ reason: "arcade" }); return false; }
    var w = weekOf();
    active = { game: game, week: w.key, seed: seedFor(game, w.key) };
    track("tournament:play:" + game);
    // Pit Wall plays a full quick race (no menu), like a challenge
    return Ar.open(game, { mode: "tournament", seed: active.seed, week: w.key, length: "full" });
  }

  function placeLine(m) {
    if (!m) return "";
    return "#" + m.rank + " of " + m.of + (m.rank === 1 ? " · leading" : "");
  }
  // pure: the line under a finished tournament run
  function resultHtml(o) {
    var head = o.saved === false ? "This run wasn't saved." : o.isBest ? "🏆 Your best this week!" : "Your best this week: <b>" + fmt(o.best) + "</b>";
    return '<p class="tourney-out__head">' + head + "</p>" +
      (o.place ? '<p class="tourney-out__place">' + esc(placeLine(o.place)) + " in this week's " + esc(o.gameName) + "</p>" : "") +
      (o.saved === false ? '<p class="tourney-out__fine">' + esc(o.why || "Check your connection; the board is the same next try.") + "</p>" : "") +
      '<p class="tourney-out__fine">Same board all week, best run counts. Ends in ' + esc(o.left) + '. <a href="/leaderboards/tournament/">Standings →</a></p>';
  }
  function attach(html) {
    var tries = 0;
    (function find() {
      var card = document.querySelector(".arcade:not([hidden]) .arcade__overlay .arcade__card");
      if (!card) { if (++tries < 40) setTimeout(find, 100); return; }
      var el = card.querySelector(".tourney-out");
      if (!el) { el = document.createElement("div"); el.className = "tourney-out"; card.appendChild(el); }
      el.innerHTML = html;
    })();
  }
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.mode !== "tournament") return;
    if (d.name === "closed") { active = null; return; }
    if (d.name === "start" && active && active.game === d.game) {   // on the game's start card
      attach('<p class="tourney-out__head">🏆 ' + esc(weekLabel(active.week)) + " tournament board</p>" +
        '<p class="tourney-out__fine">The same board for everyone this week. Play it as often as you like; your best run counts. Ends in ' + esc(timeLeft()) + ".</p>");
      return;
    }
    if (d.name !== "over" || !active || active.game !== d.game) return;
    var run = active, score = Math.max(0, Math.min(200000, d.score | 0)), now = weekOf();
    var base = { gameName: nameOf(d.game), left: timeLeft() };
    if (d.seed !== run.seed) return;   // not this week's board
    // Pit Wall's menu is still there after a race: only the full quick race is the tournament board
    if (d.game === "pitwall" && (d.kind !== "quick" || d.length !== "full")) { attach(resultHtml(Object.assign({ saved: false, why: "Only the full quick race counts for the tournament." }, base))); return; }
    if (!(score > 0)) { attach(resultHtml(Object.assign({ saved: false, why: "A zero doesn't go on the board." }, base))); return; }
    if (run.week !== now.key) { attach(resultHtml(Object.assign({ saved: false, why: "The week ended while you played. A new board is up." }, base))); return; }
    backend().save(d.game, run.week, score).then(function (ok) {
      if (!ok) { attach(resultHtml(Object.assign({ saved: false }, base))); return; }
      cache = {};
      backend().standings(run.week, 10).then(function (s) {
        var m = s && s.mine && s.mine[d.game];
        attach(resultHtml(Object.assign({ best: m ? m.score : score, isBest: !m || m.score <= score, place: m }, base)));
        repaint();
      }, function () { attach(resultHtml(Object.assign({ best: score, isBest: true }, base))); });
    });
  });

  /* ---------- trophies (player cards, account window) ---------- */
  // adds card.trophies = [{ week, game, score, players }] (newest first); never fails
  function withTrophies(card) {
    if (!card || !card.name) return Promise.resolve(card);
    return backend().trophies(card.name).then(function (t) { card.trophies = Array.isArray(t) ? t : []; return card; }, function () { card.trophies = []; return card; });
  }
  // pure: "Week 46, 2026"
  function weekLabel(key) { var m = /^(\d{4})-W(\d{2})$/.exec(key || ""); return m ? "Week " + (+m[2]) + ", " + m[1] : String(key || ""); }

  /* ---------- the page and the lobby card ---------- */
  var cache = {}, TTL = 30000;
  function cached(key, fn) {
    var hit = cache[key];
    if (hit && Date.now() - hit.t < TTL) return hit.p;
    var p = fn(); cache[key] = { t: Date.now(), p: p };
    p.catch(function () { delete cache[key]; });
    return p;
  }
  function rowsHtml(rows) {
    if (!rows || !rows.length) return '<p class="lb__empty muted">No runs yet. The first score leads.</p>';
    return '<ol class="lb__list">' + rows.map(function (r) {
      var medal = r.rank === 1 ? "lb__row--gold" : r.rank === 2 ? "lb__row--steel" : r.rank === 3 ? "lb__row--violet" : "";
      return '<li class="lb__row ' + medal + (r.me ? " is-me" : "") + '"><span class="lb__rank">' + (r.rank | 0) + '</span><span class="lb__name"><a href="/u/?n=' + encodeURIComponent(r.name) + '">' + esc(r.name) + "</a>" +
        (r.role === "samuka" || r.role === "nino" ? ' <span class="lb__role lb__role--' + r.role + '">' + r.role + "</span>" : "") + (r.me ? ' <span class="lb__you">you</span>' : "") +
        '</span><span class="lb__score">' + fmt(r.score) + "</span></li>";
    }).join("") + "</ol>";
  }
  // pure: the page body. s = standings, wins = last week's winners, gs = games()
  function pageHtml(s, wins, gs, now) {
    var w = weekOf(now), signed = !!user();
    s = s || { games: {}, mine: {}, players: 0 };
    var cards = gs.map(function (g) {
      var mine = s.mine && s.mine[g.id];
      return '<div class="lb tourney-game" data-tourney-game="' + esc(g.id) + '">' +
        '<div class="lb__head"><p class="lb__title"><span class="prompt">$</span> rails tournament:show[' + esc(g.id) + "]</p>" +
        '<p class="lb__fixed"><span aria-hidden="true">' + esc(g.icon) + "</span> " + esc(g.name) + "</p>" +
        '<button class="btn btn--primary tourney-game__play" type="button" data-tourney-play="' + esc(g.id) + '" aria-label="Play this week\'s ' + esc(g.name) + ' board"><span class="btn__prompt">▶</span> play</button></div>' +
        (mine ? '<p class="tourney-game__mine">you: <b>' + fmt(mine.score) + "</b> · " + esc(placeLine(mine)) + "</p>" : "") +
        rowsHtml((s.games || {})[g.id]) + "</div>";
    }).join("");
    var byGame = {}; (wins || []).forEach(function (r) { if (!byGame[r.game]) byGame[r.game] = r; });
    var champs = gs.filter(function (g) { return byGame[g.id]; }).map(function (g) {
      var r = byGame[g.id];
      return '<li class="tourney-champ' + (r.me ? " is-me" : "") + '"><span class="tourney-champ__game"><span aria-hidden="true">' + esc(g.icon) + "</span> " + esc(g.name) + '</span><span class="tourney-champ__who"><span aria-hidden="true">🏆</span> <a href="/u/?n=' + encodeURIComponent(r.name) + '">' + esc(r.name) + "</a>" + (r.me ? ' <span class="lb__you">you</span>' : "") + '</span><span class="lb__score">' + fmt(r.score) + "</span></li>";
    }).join("");
    var last = wins && wins.length ? wins[0].week : prevWeek(now).key;
    return '<div class="tourney-head">' +
        '<p class="tourney-head__week"><b>' + esc(weekLabel(w.key)) + "</b> · " + esc(range(w)) + "</p>" +
        '<p class="tourney-head__left">ends in <b data-tourney-left>' + esc(timeLeft(now)) + "</b></p>" +
        '<p class="tourney-head__text muted">One board per game, the same for everyone this week. Play as often as you like; your best run counts. ' +
          (s.players ? "<b>" + fmt(s.players) + "</b> player" + (s.players === 1 ? "" : "s") + " so far." : "") + "</p>" +
        (signed ? "" : '<p class="tourney-head__signin"><button class="btn" type="button" data-tourney-signin>sign in to play</button> <span class="muted">Tournament runs need a name on them.</span></p>') +
      "</div>" +
      '<div class="boards tourney-boards">' + cards + "</div>" +
      '<section class="tourney-last" aria-labelledby="tourney-last-t"><h2 class="tourney-last__title" id="tourney-last-t">Last week\'s winners <small class="muted">' + esc(weekLabel(last)) + "</small></h2>" +
        (champs ? '<ul class="tourney-champs">' + champs + "</ul>" : '<p class="muted">No winners yet: last week nobody played. Win this week and your name goes here.</p>') +
        '<p class="muted tourney-last__fine">Winners get a 🏆 on their player card for each week and game they top.</p></section>';
  }
  function cardHtml(s, now) {
    var w = weekOf(now), n = s && s.players;
    return '<p class="hub-card__title">weekly tournament · ends in <span data-tourney-left>' + esc(timeLeft(now)) + "</span></p>" +
      '<p class="today__big"><span aria-hidden="true">🏆</span> ' + esc(weekLabel(w.key)) + "</p>" +
      '<p class="muted">Same board for everyone in every game this week. Best run wins a trophy.' + (n ? " " + fmt(n) + " player" + (n === 1 ? "" : "s") + " so far." : "") + "</p>" +
      '<a class="btn btn--primary" href="/leaderboards/tournament/"><span class="btn__prompt">▶</span> enter</a>';
  }

  /* ---------- last week, for the weekly recap and the winner toast ---------- */
  // pure: s = tournament_standings(last week, 1), gs = games() →
  //   { week, games: [{ id, name, icon, winner, role, score, me, place }], played }
  //   winner = the top row (ties: the earlier run, same as tournament_winners()); place = your { rank, of, score }
  function lastWeekFrom(s, gs, key) {
    s = s || {};
    var byId = {}, out = [];
    (gs || []).forEach(function (g) { byId[g.id] = g; });
    var ids = (gs || []).map(function (g) { return g.id; });
    Object.keys(s.games || {}).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    ids.forEach(function (id) {
      var top = ((s.games || {})[id] || [])[0];
      if (!top) return;
      var g = byId[id] || { name: pretty(id), icon: "🎮" }, mine = (s.mine || {})[id];
      out.push({ id: id, name: g.name, icon: g.icon, winner: top.name, role: top.role, score: top.score | 0, me: !!top.me,
        place: mine ? { rank: mine.rank | 0, of: mine.of | 0, score: mine.score | 0 } : null });
    });
    return { week: s.week || key, games: out, played: out.some(function (g) { return g.place; }) };
  }
  // last finished week's results (rejects when the tournament can't be reached)
  function lastWeek(now) {
    var w = prevWeek(now);
    return cached("l:" + w.key, function () { return backend().standings(w.key, 1); }).then(function (s) { return lastWeekFrom(s, games(), w.key); });
  }

  // "You won last week": once per ISO week per account (kept on this device), signed-in only
  var WIN_KEY = "samuka-tourney-win-toast:";
  function winKey(u) { return WIN_KEY + (u && u.id); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function calm() { return window.SamukaCalm ? window.SamukaCalm.on() : !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  // pure: the toast's inside. won = lastWeekFrom().games where me
  function winToastHtml(won, key) {
    var what = won.length === 1 ? won[0].name : won.length + " games";
    return '<span class="ach-toast__icon" aria-hidden="true">🏆</span><span><small>you won ' + esc(weekLabel(key)) + "</small>" +
      "<b>" + esc(what) + " · " + (won.length === 1 ? fmt(won[0].score) : won.map(function (g) { return esc(g.name); }).join(", ")) + "</b>" +
      '<a class="tourney-toast__link" href="/leaderboards/tournament/" data-tourney-toast-link>see the standings →</a></span>' +
      '<button class="tourney-toast__x" type="button" aria-label="Dismiss">×</button>';
  }
  function showWinToast(won, key) {
    var tries = 0;
    (function show() {   // after any achievement toast in the same corner
      if (document.querySelector(".ach-toast") && ++tries < 10) { setTimeout(show, 900); return; }
      var el = document.createElement("div"), quiet = calm(), gone = false;
      el.className = "ach-toast tourney-toast";
      el.setAttribute("role", "status");
      el.innerHTML = winToastHtml(won, key);
      var bye = function () { if (gone) return; gone = true; el.classList.remove("is-in"); setTimeout(function () { el.remove(); }, quiet ? 0 : 600); };
      el.querySelector(".tourney-toast__x").addEventListener("click", bye);
      el.querySelector("a").addEventListener("click", bye);
      document.body.appendChild(el);
      // calm mode: no slide (main.css), and it stays until you dismiss it or move on, rather than timing out
      if (quiet) el.classList.add("is-in"); else requestAnimationFrame(function () { el.classList.add("is-in"); });
      if (!quiet) setTimeout(bye, 10000);
      window.addEventListener("samuka:page", bye, { once: true });
      track("tournament:win-toast");
    })();
  }
  var winChecking = null;
  function checkWin() {
    var u = user(), a = A();
    if (!u || !u.id || (a && a.mock && a.mock() === "guest")) return Promise.resolve(false);
    var w = weekOf(), k = winKey(u);
    if (store(k) === w.key || winChecking === k + w.key) return Promise.resolve(false);
    winChecking = k + w.key;
    return lastWeek().then(function (lw) {
      winChecking = null;
      var now = user();
      if (!now || now.id !== u.id || weekOf().key !== w.key || store(k) === w.key) return false;
      store(k, w.key);   // checked this week, won or not: no more lookups until next Monday
      var won = lw.games.filter(function (g) { return g.me; });
      if (!won.length) return false;
      showWinToast(won, lw.week);
      return true;
    }, function () { winChecking = null; return false; });   // offline / not set up: try again on a later page
  }
  var winT = null;
  function checkWinSoon() { clearTimeout(winT); winT = setTimeout(checkWin, 1500); }

  var opened = null;
  function paintPage(root) {
    var gs = games(), w = weekOf();
    if (opened !== location.pathname + w.key) { opened = location.pathname + w.key; track("tournament:open"); }
    if (!root.__painted) root.innerHTML = pageHtml(null, [], gs) .replace(/<ol class="lb__list">[\s\S]*?<\/ol>|<p class="lb__empty muted">[^<]*<\/p>/g, '<p class="muted">loading…</p>');
    root.__painted = true;
    Promise.all([
      cached("s:" + w.key, function () { return backend().standings(w.key, 10); }),
      cached("w:" + w.key, function () { return backend().winners(1); }).catch(function () { return []; })
    ]).then(function (res) {
      if (root.isConnected) root.innerHTML = pageHtml(res[0], res[1], gs);
    }, function (err) {
      if (!root.isConnected) return;
      var msg = err && /function|tournament/.test(err.message || "") ? "The tournament is being set up. Try again soon." : "Standings are offline right now.";
      root.innerHTML = pageHtml(null, [], gs).replace(/<div class="boards tourney-boards">/, '<p class="muted tourney-off">' + msg + '</p><div class="boards tourney-boards">');
      console.warn("[tournament]", err && (err.message || err));
    });
  }
  function paintCards() {
    var els = document.querySelectorAll("[data-tourney-card]");
    if (!els.length) return;
    var w = weekOf();
    els.forEach(function (el) { el.innerHTML = cardHtml(null); });
    cached("s:" + w.key, function () { return backend().standings(w.key, 10); }).then(function (s) {
      els.forEach(function (el) { if (el.isConnected) el.innerHTML = cardHtml(s); });
    }, function () {});
  }
  function repaint() {
    var root = document.querySelector("[data-tournament]");
    if (root) paintPage(root);
    paintCards();
  }
  // the countdown ticks once a minute; a new week redraws everything
  var tickT = null, tickWeek = null;
  function tick() {
    clearTimeout(tickT);
    var w = weekOf().key;
    if (tickWeek && tickWeek !== w) { cache = {}; tickWeek = w; repaint(); }
    tickWeek = w;
    document.querySelectorAll("[data-tourney-left]").forEach(function (el) { el.textContent = timeLeft(); });
    if (document.querySelector("[data-tourney-left]")) tickT = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-tourney-play], [data-tourney-signin]");
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("data-tourney-signin")) { var a = A(); if (a && a.open) a.open({ reason: "arcade" }); return; }
    play(t.getAttribute("data-tourney-play"));
  });

  function boot() {
    var root = document.querySelector("[data-tournament]");
    if (root) { root.__painted = false; paintPage(root); }
    paintCards();
    tick();
    checkWinSoon();
  }
  window.addEventListener("samuka:auth", function () { cache = {}; checkWinSoon(); var root = document.querySelector("[data-tournament]"); if (root) paintPage(root); paintCards(); });
  window.addEventListener("samuka:page", function () { opened = null; boot(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.SamukaTournament = {
    weekOf: weekOf, prevWeek: prevWeek, seedFor: seedFor, timeLeft: timeLeft, left: left, weekLabel: weekLabel,
    games: games, play: play, withTrophies: withTrophies,
    lastWeek: lastWeek, lastWeekFrom: lastWeekFrom, winToastHtml: winToastHtml, checkWin: checkWin, _winKey: winKey,
    standingsFrom: standingsFrom, resultHtml: resultHtml, pageHtml: pageHtml, cardHtml: cardHtml,
    reload: function () { cache = {}; repaint(); },
    mockBackend: mock,
    // tests: swap the server for a fake (null puts it back)
    _setBackend: function (b) { override = b; cache = {}; },
    _active: function () { return active; }
  };
})();
