/* Samuka · challenge a friend (no one needs to be online at the same time)
 * Every run has a seed (arcade.js), so a finished run can be sent as a link: /games/?c=<code>,
 * where the code carries the game, the seed, the challenger's name and score (and Pit Wall's race
 * length). Opening it shows "<name> challenges you"; accepting plays that exact board in "challenge"
 * mode, and the result card shows the head-to-head with a link to send back.
 * No server involved, so it works for guests too. The score in a link could be edited by hand,
 * which is fine for a friendly challenge: challenge runs never touch the leaderboards (scores.js).
 *
 * Results: when a signed-in player sends a challenge, the link also carries an id ("i") and the
 * challenge is registered on the server (supabase/challenges.sql) with the real score. A signed-in
 * player who beats it records the win; the sender sees "<name> beat your <game> challenge" with a
 * rematch link on their next visit (a note on Home and Games, a dot on the Games link), once.
 * Guests can still send and play challenges; their results just aren't recorded.
 */
(function () {
  "use strict";
  var GAMES = { sidekiq: "Sidekiq Rush", gems: "Gem Match", schema: "Schema Stack", pitwall: "Pit Wall" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return (n | 0).toLocaleString("en-US"); };
  var active = null;   // the challenge being played: { game, seed, name, score, length }

  /* ---------- the link ---------- */
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function b64d(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }
  function encode(c) {
    var o = { v: 1, g: c.game, s: c.seed, n: c.name, sc: c.score | 0 };
    if (c.game === "pitwall" && c.length === "sprint") o.l = "sprint";
    if (c.id && ID_RE.test(c.id)) o.i = c.id;
    return b64e(JSON.stringify(o));
  }
  var ID_RE = /^[A-Za-z0-9_-]{8,24}$/;
  function newId() {
    var a = new Uint8Array(9), s = "";
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");   // 12 chars
  }
  function decode(code) {
    try {
      var o = JSON.parse(b64d(String(code || "")));
      if (!o || o.v !== 1 || !GAMES[o.g]) return null;
      var seed = String(o.s || "");
      if (!/^[\w.:-]{1,64}$/.test(seed)) return null;
      var c = {
        game: o.g, seed: seed,
        name: String(o.n || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24) || "a friend",
        score: Math.max(0, Math.min(200000, o.sc | 0)),
        length: o.g === "pitwall" ? (o.l === "sprint" ? "sprint" : "full") : undefined
      };
      if (typeof o.i === "string" && ID_RE.test(o.i)) c.id = o.i;
      return c;
    } catch (e) { return null; }
  }
  // /c/<game>/ carries the link preview (that game's challenge card) and forwards to /games/?c=…
  function link(c) { return location.origin + "/c/" + c.game + "/?c=" + encode(c); }
  function myName() { var A = window.SamukaAuth; return A && A.user && A.user() && A.publicName ? A.publicName() : "a friend"; }
  function signedIn() { var A = window.SamukaAuth; return !!(A && A.user && A.user()); }

  /* ---------- results on the server (supabase/challenges.sql) ----------
   * register(c): the sender shares a link · beaten(id, score): someone beat it
   * news(): the sender's unseen results, newest first · seen(at): mark them seen up to that time
   * A local test session (?as=user|samuka on localhost) keeps them in localStorage instead,
   * keyed by the test role, so two tabs (one per role) can play both sides. */
  function cl() { var A = window.SamukaAuth; return signedIn() && A.client && !(A.mock && A.mock()) ? A.client() : null; }
  var ok = function (r) { return !(r && r.error); }, none = function () { return false; };
  var server = {
    register: function (c) {
      var k = cl(); if (!k) return Promise.resolve(false);
      return k.from("challenges").insert({ id: c.id, game: c.game, seed: c.seed, score: c.score | 0, length: c.game === "pitwall" ? c.length || "full" : null }).then(ok, none);
    },
    beaten: function (id, score) {
      var k = cl(); if (!k) return Promise.resolve(false);
      return k.rpc("challenge_beaten", { p_id: id, p_score: score | 0 }).then(function (r) { return !r.error && !!r.data; }, none);
    },
    news: function () {
      var k = cl(); if (!k) return Promise.resolve([]);
      return k.rpc("my_challenge_wins").then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; });
    },
    seen: function (at) {
      var k = cl(); if (!k) return Promise.resolve(false);
      return k.rpc("challenge_wins_seen", { p_until: at }).then(ok, none);
    }
  };
  var MOCK_KEY = "samuka-mock-challenges";
  function mockDb() { try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || { c: {}, w: [] }; } catch (e) { return { c: {}, w: [] }; } }
  function mockSave(db) { try { localStorage.setItem(MOCK_KEY, JSON.stringify(db)); } catch (e) {} }
  function mockMe() { var A = window.SamukaAuth; return signedIn() && A.mock ? A.mock() : null; }
  function mockName() { var A = window.SamukaAuth, p = A.profile && A.profile(), r = mockMe(); return (p && p.nickname) || r.charAt(0).toUpperCase() + r.slice(1); }
  var mock = {
    register: function (c) {
      var me = mockMe(), db = mockDb(); if (!me || db.c[c.id]) return Promise.resolve(false);
      db.c[c.id] = { sender: me, game: c.game, seed: c.seed, score: c.score | 0, length: c.length || null };
      mockSave(db); return Promise.resolve(true);
    },
    beaten: function (id, score) {
      var me = mockMe(), db = mockDb(), c = db.c[id];
      if (!me || !c || c.sender === me || (score | 0) <= c.score) return Promise.resolve(false);
      var w = db.w.filter(function (x) { return x.id === id && x.winner === me; })[0];
      if (w && w.score >= score) return Promise.resolve(true);
      if (!w) db.w.push(w = { id: id, winner: me });
      w.name = mockName(); w.score = score | 0; w.at = new Date().toISOString(); w.seen = false;
      mockSave(db); return Promise.resolve(true);
    },
    news: function () {
      var me = mockMe(), db = mockDb();
      return Promise.resolve(db.w.filter(function (w) { return !w.seen && db.c[w.id] && db.c[w.id].sender === me; })
        .sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 10)
        .map(function (w) { var c = db.c[w.id]; return { id: w.id, game: c.game, seed: c.seed, length: c.length, mine: c.score, theirs: w.score, name: w.name, at: w.at }; }));
    },
    seen: function (at) {
      var me = mockMe(), db = mockDb();
      db.w.forEach(function (w) { if (db.c[w.id] && db.c[w.id].sender === me && w.at <= at) w.seen = true; });
      mockSave(db); return Promise.resolve(true);
    }
  };
  var backendOverride = null;
  function backend() { var A = window.SamukaAuth; return backendOverride || (A && A.mock && A.mock() ? mock : server); }

  // a run that can be replayed: scored, seeded, and for Pit Wall a quick race (GP and championship need your picks)
  function canChallenge(r) { return !!(r && r.seed && r.score > 0 && GAMES[r.game] && (r.game !== "pitwall" || r.kind === "quick")); }

  function share(c, btn) {
    var url = link(c);
    var text = (c.name === "a friend" ? "Can you" : c.name + " challenges you to") + " beat " + fmt(c.score) + " in " + GAMES[c.game] + "? Same board, any time.";
    var done = function (label) { if (btn) { var t = btn.innerHTML; btn.innerHTML = label; btn.disabled = true; setTimeout(function () { btn.innerHTML = t; btn.disabled = false; }, 2200); } };
    // phones: the system share sheet (messages, chat apps); desktops: copy the link
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      return navigator.share({ title: "Samuka's Arcade challenge", text: text, url: url }).then(function () { done("✓ sent"); }, function () {});
    }
    var copy = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text + " " + url) : Promise.reject();
    return copy.then(function () { done("✓ link copied"); }, function () { showLink(btn, url); });
  }
  function showLink(btn, url) {   // no clipboard (permissions, old browsers): show the link to copy by hand
    var host = btn && btn.closest(".chal-out") || btn && btn.parentNode;
    if (!host || host.querySelector(".chal-link")) return;
    var input = document.createElement("input");
    input.className = "chal-link"; input.readOnly = true; input.value = url; input.setAttribute("aria-label", "Challenge link");
    host.appendChild(input); input.focus(); input.select();
  }

  /* ---------- accepting: /games/?c=… ---------- */
  function closeInvite() { var d = document.querySelector(".chal"); if (d) d.remove(); }
  function invite(c) {
    closeInvite();
    var d = document.createElement("div");
    d.className = "chal";
    d.innerHTML =
      '<div class="chal__backdrop" data-chal-close></div>' +
      '<div class="chal__card" role="dialog" aria-modal="true" aria-labelledby="chal-t">' +
        '<p class="arcade__kicker">⚔ challenge · ' + esc(GAMES[c.game]) + "</p>" +
        '<h3 id="chal-t">' + (c.name === "a friend" ? "A friend challenges you" : "<b>" + esc(c.name) + "</b> challenges you") + "</h3>" +
        "<p>Beat <b>" + fmt(c.score) + "</b> in <b>" + esc(GAMES[c.game]) + "</b>" + (c.game === "pitwall" ? " (" + (c.length === "sprint" ? "sprint" : "full") + " quick race)" : "") +
        ". Same board they played, as many tries as you like.</p>" +
        '<div class="chal__row"><button class="btn btn--primary" type="button" data-chal-accept><span class="btn__prompt">▶</span> accept</button><button class="btn" type="button" data-chal-close>not now</button></div>' +
        '<p class="chal__fine">Challenge scores stay between you two: they don\'t go on the leaderboards.</p>' +
      "</div>";
    document.body.appendChild(d);
    d.__c = c;
    window.SamukaTrack && window.SamukaTrack("challenge:open:" + c.game);
    var b = d.querySelector("[data-chal-accept]"); if (b) setTimeout(function () { b.focus(); }, 30);
  }
  function accept(c) {
    closeInvite();
    var Ar = window.SamukaArcade; if (!Ar) return;
    active = c;
    window.SamukaTrack && window.SamukaTrack("challenge:accept:" + c.game);
    Ar.open(c.game, { mode: "challenge", seed: c.seed, length: c.length, challenge: c });
  }
  function fromUrl() {
    var q = new URLSearchParams(location.search), code = q.get("c");
    if (!code) return;
    // drop it from the address bar so a reload or a shared screenshot doesn't re-open it
    q.delete("c");
    history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    var c = decode(code);
    if (c) invite(c);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-chal-accept], [data-chal-close], [data-chal-send]");
    if (!t) return;
    if (t.hasAttribute("data-chal-close")) { closeInvite(); return; }
    if (t.hasAttribute("data-chal-accept")) { var d = t.closest(".chal"); if (d && d.__c) accept(d.__c); return; }
    if (t.hasAttribute("data-chal-send")) {
      var c = decode(t.getAttribute("data-chal-send"));
      if (c && c.id) backend().register(c);   // in the background: the share sheet needs this click
      if (c) { share(c, t); window.SamukaTrack && window.SamukaTrack("challenge:send:" + c.game); }
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.querySelector(".chal")) closeInvite(); });

  /* ---------- the result: head to head ---------- */
  function sendButton(c, label) {
    if (signedIn() && !c.id) c.id = newId();   // so the result can find its way back to you
    return '<button class="btn" type="button" data-chal-send="' + esc(encode(c)) + '">' + label + "</button>";
  }
  function resultHtml(c, score, seed) {
    var diff = score - c.score, them = c.name === "a friend" ? "your friend" : esc(c.name);
    var head = diff > 0 ? "🏆 You win by " + fmt(diff) + "!" : diff === 0 ? "🤝 Dead heat." : "So close: " + fmt(-diff) + " short of " + them + ".";
    var back = { game: c.game, seed: seed || c.seed, name: myName(), score: score, length: c.length };
    return '<p class="chal-out__head">' + head + "</p>" +
      '<dl class="chal-out__vs"><dt>you</dt><dd' + (diff >= 0 ? ' class="is-win"' : "") + ">" + fmt(score) + "</dd><dt>" + them + "</dt><dd" + (diff <= 0 ? ' class="is-win"' : "") + ">" + fmt(c.score) + "</dd></dl>" +
      '<div class="chal-out__row">' + (score > 0 ? sendButton(back, diff > 0 ? "⚔ send it back" : "⚔ send your score anyway") : "") +
      '<span class="muted">' + (diff > 0 ? "Same board. Let them try to beat " + fmt(score) + "." : "Same board every try. Go again?") + "</span></div>" +
      (diff > 0 && c.id && !signedIn() ? '<p class="chal-out__fine">Sign in and win again to let ' + them + " know you beat it.</p>" : "");
  }
  function attach(selector, html) {
    var tries = 0;
    (function find() {
      var card = document.querySelector(".arcade:not([hidden]) .arcade__overlay .arcade__card");
      if (!card) { if (++tries < 40) setTimeout(find, 100); return; }
      var el = card.querySelector(selector);
      if (!el) { el = document.createElement("div"); el.className = selector.slice(1); card.appendChild(el); }
      el.innerHTML = html;
    })();
  }
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name === "closed") { active = null; return; }
    if (d.name === "over" && d.mode === "challenge" && active && active.game === d.game) {
      attach(".chal-out", resultHtml(active, d.score | 0, d.seed));
      // tell the sender (the server checks it's a registered challenge, not yours, and really beaten)
      if (active.id && signedIn() && (d.score | 0) > active.score) backend().beaten(active.id, d.score | 0);
    }
  });

  /* ---------- the sender's next visit: "<name> beat your <game> challenge" ----------
   * A note in [data-chal-news] (Home, Games) and a dot on the Games links. Marked seen on the
   * server as soon as a note is on screen; the note then stays for this visit until closed with ×. */
  var news = [], shown = [], loadedFor = null, loadedAt = 0, NEWS_TTL = 5 * 60000;
  // pure: one line per beaten challenge (newest first, at most 3)
  function newsItems(rows) {
    return (rows || []).slice(0, 3).map(function (r) {
      var game = GAMES[r.game] || "a", name = String(r.name || "Someone").slice(0, 24);
      var back = { game: r.game, seed: r.seed, name: name, score: r.theirs | 0, length: r.game === "pitwall" ? (r.length === "sprint" ? "sprint" : "full") : undefined };
      return {
        text: name + " beat your " + game + " challenge: " + fmt(r.theirs) + " vs your " + fmt(r.mine) + ".",
        href: "/games/?c=" + encode(back)
      };
    });
  }
  function newsHtml(rows) {
    var items = newsItems(rows);
    if (!items.length) return "";
    var more = rows.length - items.length;
    return '<span class="chal-note__icon" aria-hidden="true">🏆</span><span class="chal-note__body">' +
      items.map(function (it) { return '<span class="chal-note__line">' + esc(it.text) + ' <a href="' + esc(it.href) + '" data-chal-rematch>Win it back →</a></span>'; }).join("") +
      (more > 0 ? '<span class="chal-note__line muted">…and ' + more + " more.</span>" : "") +
      '</span><button type="button" class="streak-note__x" data-chal-news-hide aria-label="Close">×</button>';
  }
  function visible(el) { return !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0; }
  function paintNews() {
    // a fresh result joins what's already on screen this visit
    var rows = news.concat(shown.filter(function (s) { return !news.some(function (n) { return n.id === s.id && n.name === s.name; }); }));
    var html = signedIn() ? newsHtml(rows) : "", onScreen = false;
    document.querySelectorAll("[data-chal-news]").forEach(function (el) {
      el.hidden = !html;
      if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
      if (html && !document.hidden && visible(el)) onScreen = true;
    });
    if (onScreen && news.length) {
      window.SamukaTrack && window.SamukaTrack("challenge:beaten-seen");
      backend().seen(news[0].at);
      shown = rows; news = [];
    }
    var dot = signedIn() && news.length > 0;
    document.querySelectorAll('a[href="/games/"]').forEach(function (a) {
      if (a.closest(".tree, .mnav")) a.classList.toggle("has-chal-dot", dot);
    });
  }
  function loadNews(force) {
    var A = window.SamukaAuth;
    if (!signedIn()) { news = []; shown = []; loadedFor = null; return paintNews(); }
    var who = (A.mock && A.mock() || "") + ":" + A.user().id;
    if (who !== loadedFor) { news = []; shown = []; }
    if (!force && who === loadedFor && Date.now() - loadedAt < NEWS_TTL) return paintNews();
    loadedFor = who; loadedAt = Date.now();
    backend().news().then(function (rows) {
      if (loadedFor !== who) return;
      news = (rows || []).filter(function (r) { return r && GAMES[r.game] && r.at; });
      paintNews();
    });
    paintNews();
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-chal-news-hide]")) { shown = []; paintNews(); }
    if (e.target.closest && e.target.closest("[data-chal-rematch]")) window.SamukaTrack && window.SamukaTrack("challenge:rematch");
  });
  window.addEventListener("samuka:auth", function () { loadNews(); });
  window.addEventListener("samuka:page", function () { loadNews(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && news.length) paintNews(); });

  /* ---------- free play: offer to send this run (nextsteps.js draws the button) ---------- */
  function offerButton(r) {
    if (!canChallenge(r)) return "";
    return sendButton({ game: r.game, seed: r.seed, name: myName(), score: r.score, length: r.length }, "⚔ challenge a friend");
  }

  window.addEventListener("samuka:page", fromUrl);
  function boot() { fromUrl(); loadNews(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.SamukaChallenge = {
    encode: encode, decode: decode, link: link, canChallenge: canChallenge, offerButton: offerButton, accept: accept,
    newId: newId, newsItems: newsItems, newsHtml: newsHtml, resultHtml: resultHtml,
    refreshNews: function () { return loadNews(true); }, paintNews: paintNews,
    mockBackend: mock,
    // tests: swap the server for a fake (null puts it back)
    _setBackend: function (b) { backendOverride = b; },
    _active: function () { return active; }
  };
})();
