/* Samuka · /me/ "Your collection": personal bests, achievements and soundtrack unlocks.
 * Secrets are shown as locked "???" slots with a hint, so people know there's something to find
 * without the page spoiling what it is. Everything is read from the modules that own it
 * (SamukaArcade, SamukaAch, SamukaLofi); this file only draws. Re-draws on samuka:page / auth / game.
 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (s) { return document.querySelector(s); };
  function set(sel, html) { var el = $(sel); if (el) el.innerHTML = html; }

  function games() {
    var el = document.getElementById("me-games");
    try { return el ? JSON.parse(el.textContent) || [] : []; } catch (e) { return []; }
  }
  function slot(o) {
    return '<div class="coll-slot' + (o.locked ? " is-locked" : " is-got") + '"' + (o.title ? ' title="' + esc(o.title) + '"' : "") + ">" +
      '<span class="coll-slot__icon" aria-hidden="true">' + (o.locked ? "🔒" : esc(o.icon)) + "</span>" +
      '<span class="coll-slot__text"><b>' + esc(o.name) + "</b><small>" + esc(o.how) + "</small></span></div>";
  }

  function paintWho() {
    var A = window.SamukaAuth, on = !!(A && A.user && A.user());
    set("[data-coll-who]", on
      ? '<p>Signed in as <b>' + esc(A.publicName()) + '</b>. Your scores and badges are saved to your account.</p>' +
        '<div class="lobby__actions"><a class="btn" href="/u/">your player card →</a><button class="btn" type="button" data-me-act="appearance">appearance</button><button class="btn" type="button" data-me-act="settings">settings</button></div>'
      : '<p>You\'re playing as a <b>guest</b>. Bests stay on this device; achievements and leaderboards need an account.</p>' +
        '<div class="lobby__actions"><button class="btn btn--primary" type="button" data-me-act="signin">sign in to save</button></div>');
  }

  function paintBests() {
    var Ar = window.SamukaArcade;
    set("[data-coll-bests]", games().map(function (g) {
      var b = Ar && Ar.best ? Ar.best(g.id) : 0;
      return '<div class="coll-best"><span class="tile__icon" aria-hidden="true">' + esc(g.icon) + "</span>" +
        '<span><b>' + esc(g.name) + '</b><small>' + (b ? "best " + b.toLocaleString("en-US") : "not played yet") + "</small></span>" +
        '<button class="btn" type="button" data-play="' + esc(g.id) + '">▶ ' + (b ? "beat it" : "play") + "</button></div>";
    }).join(""));
  }

  // a nudge for each secret achievement: where to look, never the answer
  var HINTS = {
    night_owl: "some visitors only come out very late",
    glitch: "keep your eyes on the screen",
    sudo: "the terminal (Ctrl K) knows more than it says",
    vim: "the terminal (Ctrl K) has an editor nobody can leave",
    rails_c: "the terminal (Ctrl K) speaks Rails",
    konami: "an old cheat code still works here",
    suite_phthalo: "the soundtrack hides something",
    suite_knight: "the soundtrack hides something, after dark",
    suite_golden: "the soundtrack hides something golden",
    conductor: "find what the soundtrack hides, three times"
  };

  function paintAch() {
    var X = window.SamukaAch, A = window.SamukaAuth, on = !!(A && A.user && A.user());
    if (!X) { set("[data-coll-ach]", '<p class="muted">loading…</p>'); return; }
    var got = X.list.filter(function (a) { return X.has(a.key); }).length;
    set("[data-coll-ach-n]", got + " / " + X.list.length);
    set("[data-coll-ach]", (on ? "" : '<p class="coll-note coll-span">Sign in to start earning these.</p>') +
      // earned first, then the rest in their usual order
      X.list.slice().sort(function (a, b) { return (X.has(b.key) ? 1 : 0) - (X.has(a.key) ? 1 : 0); }).map(function (a) {
        if (a.secret && !X.has(a.key)) return slot({ name: "??? secret", how: HINTS[a.key] || "keep poking around", locked: true });
        return slot({ icon: a.icon, name: a.title, how: a.how, locked: !X.has(a.key) });
      }).join(""));
  }

  function paintMusic() {
    var L = window.SamukaLofi;
    if (!L || !L.suite || !L.bonus) { set("[data-coll-music]", '<p class="muted">The player is loading…</p>'); return; }
    var th = L.theme(), heard = L.suite.heard(th) | 0, cut = L.suite.open(th), bonus = L.bonus.list();
    var gName = {}; games().forEach(function (g) { gName[g.id] = g.name; });
    var items = [];
    items.push(slot({ icon: "🎧", name: "The five songs", how: heard >= 5 ? "all heard in this palette" : heard + " of 5 heard in this palette", locked: false }));
    bonus.forEach(function (b) {
      var name = gName[b.game] || b.name;
      items.push(slot(b.open
        ? { icon: "🎵", name: (b.titles && b.titles[th]) || name + " bonus track", how: "unlocked by " + name }
        : { name: "Bonus track", how: "finish a run of " + name, locked: true }));
    });
    // the director's cut stays a mystery until it's open: say where to look, not what it is
    items.push(slot(cut
      ? { icon: "🎬", name: L.suite.title(th) || "Director's cut", how: "found it. It's in the player" }
      : { name: "???", how: heard >= 5 ? "you've heard all five. Something woke up somewhere…" : "something wakes once you've heard all five songs", locked: true }));
    var open = items.filter(function (h) { return h.indexOf("is-got") > -1; }).length;
    set("[data-coll-music-n]", open + " / " + items.length);
    set("[data-coll-music]", items.join(""));
  }

  function paint() {
    if (!$("[data-collection]")) return;
    paintWho(); paintBests(); paintAch(); paintMusic();
  }
  window.addEventListener("samuka:page", paint);
  window.addEventListener("samuka:auth", paint);
  window.addEventListener("samuka:game", function (e) { if (e.detail && (e.detail.name === "over" || e.detail.name === "closed")) setTimeout(paint, 50); });
  window.addEventListener("samuka:theme", paint);
  window.addEventListener("samuka:music-ready", paint);   // the soundtrack loads on demand (music.js)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
  // lofi.js and achievements load alongside; one late pass catches them
  window.addEventListener("load", function () { setTimeout(paint, 300); });
})();
