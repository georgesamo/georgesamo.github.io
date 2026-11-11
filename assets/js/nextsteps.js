/* Samuka · "what next?" on every game-over card
 * The moment a run ends is when people decide to stay or leave, so each game's own result card
 * (score, best, mini board, play again) gets a block under it with:
 *   - what this run unlocked: achievements and bonus tracks, linked to /me/
 *   - your place on the all-time board once the score is saved (signed in)
 *   - one suggestion for what to do next: today's puzzle, a 1v1, or a game you haven't tried
 * Free play only: the daily and race cards already end on their own result.
 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var NAMES = { sidekiq: "Sidekiq Rush", gems: "Gem Match", schema: "Schema Stack", pitwall: "Pit Wall" };
  var VERSUS = { sidekiq: 1, gems: 1, pitwall: 1 };   // games with a live 1v1
  var run = null;   // { game, mode, unlocks: [], rank: undefined | null | {rank, behind} }

  function user() { var a = window.SamukaAuth; return a && a.user && a.user(); }
  function best(id) { var A = window.SamukaArcade; return A && A.best ? A.best(id) : 0; }

  /* ---------- collect what this run unlocked ---------- */
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name === "start") { run = { game: d.game, mode: d.mode || "free", unlocks: [], over: false }; return; }
    if (d.name === "closed") { run = null; return; }
    if (d.name === "over" && run && run.game === d.game) {
      run.over = true; run.score = d.score | 0;
      if (run.mode !== "free") return;
      attach(run);
    }
  });
  function addUnlock(u) {
    if (!run) return;
    run.unlocks.push(u);
    if (run.over) paint(run);
  }
  window.addEventListener("samuka:achievement", function (e) {
    var X = window.SamukaAch, key = e.detail && e.detail.key;
    var a = X && X.list.filter(function (x) { return x.key === key; })[0];
    if (a) addUnlock({ icon: a.icon, text: a.title, kind: "achievement" });
  });
  window.addEventListener("samuka:suite", function (e) {
    var d = e.detail || {};
    if (d.type === "bonus") addUnlock({ icon: "🎵", text: d.title || "a bonus track", kind: "track" });
  });
  window.addEventListener("samuka:scored", function (e) {
    var d = e.detail || {};
    // no run.over check: a local test session saves inside the same "over" event, before our listener sees it
    if (!run || run.mode !== "free" || d.game !== run.game || d.period === "daily") return;
    var S = window.SamukaScores, r = run;
    if (!S || !S.rankOf) return;
    S.rankOf(r.game, "all", 100).then(function (rank) { r.rank = rank; if (run === r) paint(r); });
  });

  /* ---------- the suggestion ---------- */
  function suggestion(r) {
    var S = window.SamukaScores, signed = !!user();
    // signed-in players who haven't done today's puzzle: that's the best next game
    if (signed && S && S.dailyDone && !S.dailyDone("gems")) return '<button class="btn" type="button" data-daily>📅 today\'s puzzle</button>';
    // a game they've never scored in
    var fresh = Object.keys(NAMES).filter(function (id) { return id !== r.game && !best(id); })[0];
    if (fresh) return '<button class="btn" type="button" data-play="' + fresh + '">▶ try ' + esc(NAMES[fresh]) + "</button>";
    if (VERSUS[r.game]) return '<button class="btn" type="button" data-race>⚔ beat ' + r.score.toLocaleString("en-US") + " with a friend</button>";
    return '<a class="btn" href="/leaderboards/">🏆 see the boards</a>';
  }

  /* ---------- drawing ---------- */
  function html(r) {
    var rows = [];
    if (r.unlocks.length) rows.push('<li class="next-steps__chips"><span class="next-steps__label">unlocked</span>' + r.unlocks.map(function (u) {
      return '<span class="next-steps__got" title="' + (u.kind === "track" ? "new bonus track in the ♪ player" : "achievement") + '"><span aria-hidden="true">' + esc(u.icon) + "</span> " + esc(u.text) + "</span>";
    }).join("") + "</li>");
    if (user()) {
      if (r.rank === undefined) rows.push('<li class="muted">🏆 checking your rank…</li>');
      else if (r.rank) rows.push("<li>🏆 you're <b>#" + r.rank.rank + "</b> all-time" + (r.rank.rank > 1 && r.rank.behind ? " · " + r.rank.behind.toLocaleString("en-US") + " behind #" + (r.rank.rank - 1) : r.rank.rank === 1 ? " · top of the board" : "") + "</li>");
      else if (r.rank === null && r.score > 0) rows.push('<li class="muted">🏆 not in the top 100 yet. Keep going.</li>');
    }
    return (rows.length ? '<ul class="next-steps__list">' + rows.join("") + "</ul>" : "") +
      '<div class="next-steps__row"><span class="next-steps__label">next:</span>' + suggestion(r) +
      (r.unlocks.length ? '<a class="next-steps__link" href="/me/">your collection →</a>' : "") + "</div>";
  }
  function paint(r) {
    var el = r.el && r.el.isConnected ? r.el : null;
    if (el) el.innerHTML = html(r);
  }
  function attach(r) {
    var tries = 0;
    (function find() {
      if (run !== r) return;
      // games draw their card right after best(), some after a short animation
      var card = document.querySelector(".arcade:not([hidden]) .arcade__overlay .arcade__card");
      if (!card) { if (++tries < 40) setTimeout(find, 100); return; }
      var el = card.querySelector(".next-steps");
      if (!el) {
        el = document.createElement("div");
        el.className = "next-steps";
        el.setAttribute("aria-live", "polite");
        // above the guest "keep your score" note when there is one, otherwise at the end
        var claim = card.querySelector(".arcade__claim");
        card.insertBefore(el, claim || null);
      }
      r.el = el;
      if (!user() || !r.score) r.rank = r.rank || false;   // guests get arcade.js's sign-in note; a zero is never saved
      paint(r);
    })();
  }

  window.SamukaNextSteps = { _run: function () { return run; } };
})();
