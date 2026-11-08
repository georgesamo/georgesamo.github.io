/* Samuka · live 1v1 Sidekiq Rush (Supabase Realtime, nothing stored but the final score)
 * One player creates a room and shares the 4-letter code (or link). When both
 * are in, the host sends a seed; both play the same queue at the same time and
 * see each other's score live. Higher score when both crash wins; closing the
 * window forfeits.
 */
(function () {
  "use strict";
  var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", COOP_TARGET = 4000;
  var choice = { game: "sidekiq", coop: false };
  var dlg = null, ch = null, room = null, isHost = false, me = null, opp = null, st = null, bar = null, cdTimer = 0;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function A() { return window.SamukaAuth; }
  function client() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function code() { var s = ""; for (var i = 0; i < 4; i++) s += ALPHA[(Math.random() * ALPHA.length) | 0]; return s; }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }

  /* ---------- lobby dialog ---------- */
  function build() {
    dlg = document.createElement("div");
    dlg.className = "race";
    dlg.hidden = true;
    dlg.innerHTML = '<div class="race__backdrop" data-race-close></div><div class="race__win" role="dialog" aria-modal="true" aria-labelledby="race-title">' +
      '<div class="race__bar"><span class="dots"><i data-race-close></i><i></i><i></i></span><span id="race-title">sidekiq-rush.rb · 1v1</span><button class="arcade__x" type="button" data-race-close aria-label="Close">esc</button></div>' +
      '<div class="race__body" data-race-body></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onClick);
    dlg.addEventListener("submit", function (e) { e.preventDefault(); var v = (e.target.elements.code.value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (v.length === 4) enter(v, false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dlg && !dlg.hidden) { e.stopPropagation(); close(); } }, true);
  }
  function body(html) { dlg.querySelector("[data-race-body]").innerHTML = html; }
  function lobby(prefill) {
    body('<p class="arcade__kicker">$ bin/arcade --live</p><h3>Live 2-player</h3>' +
      "<p>Both of you get the same game at the same moment and see each other's score live.</p>" +
      '<fieldset class="race__pick"><legend>game</legend>' +
        '<label><input type="radio" name="rgame" value="sidekiq" checked> Sidekiq Rush <small>versus · last one standing scores most</small></label>' +
        '<label><input type="radio" name="rgame" value="gems"> Gem Match · versus <small>same board, 20 moves, higher score wins</small></label>' +
        '<label><input type="radio" name="rgame" value="merge"> Merge Conflict · versus <small>same 15 conflicts, highest score wins</small></label>' +
        '<label><input type="radio" name="rgame" value="gems-coop"> Gem Match · co-op <small>same board, add up to ' + fmt(COOP_TARGET) + " together</small></label></fieldset>" +
      '<div class="race__choices"><button class="btn btn--primary" type="button" data-race-create>⚔ create a room</button>' +
      '<form class="race__join"><input name="code" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code" value="' + esc(prefill || "") + '"><button class="btn" type="submit">join</button></form></div>');
    if (prefill) setTimeout(function () { var f = dlg.querySelector(".race__join"); if (f) f.requestSubmit ? f.requestSubmit() : null; }, 50);
  }
  function open(prefill) {
    var a = A();
    if (!a || !a.enabled) return false;
    if (!a.user()) { a.open({ reason: "arcade" }); return false; }
    if (!client()) { if (!dlg) build(); dlg.hidden = false; body('<h3>Live 1v1</h3><p class="muted">Races need the live site (Supabase Realtime); local test sessions can\'t join one.</p>'); return true; }
    if (!dlg) build();
    dlg.hidden = false;
    document.documentElement.style.overflow = "hidden";
    lobby(prefill);
    return true;
  }
  function close() {
    if (!dlg) return;
    dlg.hidden = true;
    document.documentElement.style.overflow = "";
    if (!st || st.phase !== "playing") leave();
  }
  function onClick(e) {
    if (e.target.closest("[data-race-close]")) return close();
    if (e.target.closest("[data-race-create]")) {
      var pickEl = dlg.querySelector('input[name="rgame"]:checked'), v = pickEl ? pickEl.value : "sidekiq";
      choice = { game: v === "gems-coop" ? "gems" : v, coop: v === "gems-coop" };
      return enter(code(), true);
    }
    if (e.target.closest("[data-race-copy]")) {
      var link = location.origin + location.pathname + "#race=" + room;
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { e.target.textContent = "✓ link copied"; });
    }
    if (e.target.closest("[data-race-again]")) { var r = room, h = isHost; leave(); enter(r, h); }
  }

  /* ---------- room ---------- */
  function enter(c, host) {
    leave();
    room = c; isHost = host;
    me = { id: A().user().id, name: A().publicName(), role: A().role() };
    opp = null; st = { phase: "waiting", my: { score: 0, done: 0, mem: 0, over: false }, them: { score: 0, done: 0, mem: 0, over: false } };
    body('<p class="arcade__kicker">room</p><h3 class="race__code">' + room + "</h3>" +
      (host ? '<p>Send this code to a friend, or <button class="linkish" type="button" data-race-copy>copy an invite link</button>.</p>' : "<p>Joining…</p>") +
      '<p class="muted race__wait"><span class="race__spin" aria-hidden="true"></span> waiting for an opponent</p>');
    ch = client().channel("race-" + room, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    ch.on("presence", { event: "sync" }, function () {
      var s = ch.presenceState(), ids = Object.keys(s);
      var others = ids.filter(function (k) { return k !== me.id; });
      if (others.length > 1 && st.phase === "waiting" && !isHost) { body("<h3>Room full</h3><p>That race already has two players.</p>"); leave(); return; }
      var o = others[0] && s[others[0]][0];
      if (o && !opp) {
        opp = { id: others[0], name: o.name, role: o.role };
        if (isHost && st.phase === "waiting") {
          var seed = "race-" + room + "-" + Date.now();
          ch.send({ type: "broadcast", event: "start", payload: { seed: seed, game: choice.game, coop: choice.coop } });
          countdown(seed);
        } else if (st.phase === "waiting") {
          body('<h3 class="race__code">' + room + "</h3><p>Opponent: <b>" + esc(opp.name) + "</b>. Waiting for the host to start…</p>");
        }
      }
      if (!o && opp && st.phase === "playing" && !st.them.over) { st.them.over = true; st.them.forfeit = true; settle(); }
    });
    ch.on("broadcast", { event: "start" }, function (m) {
      if (isHost || st.phase !== "waiting") return;
      choice = { game: ["gems", "merge", "sidekiq"].indexOf(m.payload.game) > -1 ? m.payload.game : "sidekiq", coop: !!m.payload.coop };
      countdown(m.payload.seed);
    });
    ch.on("broadcast", { event: "tick" }, function (m) { var p = m.payload; st.them.score = p.score; st.them.done = p.done; st.them.mem = p.mem; paintBar(); });
    ch.on("broadcast", { event: "over" }, function (m) { var p = m.payload; st.them.score = p.score; st.them.done = p.done; st.them.over = true; st.them.forfeit = !!p.forfeit; paintBar(); settle(); });
    ch.subscribe(function (status) {
      if (status === "SUBSCRIBED") ch.track({ name: me.name, role: me.role });
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") body('<h3>Connection problem</h3><p class="muted">Could not reach the race server. Try again in a moment.</p>');
    });
  }
  function leave() {
    clearInterval(cdTimer);
    if (ch) { try { ch.unsubscribe(); } catch (e) {} ch = null; }
    if (bar) { bar.remove(); bar = null; }
    st = null; opp = null;
  }
  function countdown(seed) {
    st.phase = "countdown";
    var n = 3;
    body('<p class="arcade__kicker">' + (choice.coop ? "co-op with" : "vs") + ' <b>' + esc(opp ? opp.name : "opponent") + "</b> · " + ({ gems: "Gem Match", merge: "Merge Conflict", sidekiq: "Sidekiq Rush" }[choice.game]) + '</p><p class="race__count" aria-live="assertive">' + n + "</p>");
    cdTimer = setInterval(function () {
      n--;
      var el = dlg.querySelector(".race__count");
      if (n > 0) { if (el) el.textContent = n; return; }
      clearInterval(cdTimer);
      begin(seed);
    }, 1000);
  }
  function begin(seed) {
    st.phase = "playing";
    dlg.hidden = true;
    var ctl = {
      tick: function (score, done, mem) {
        st.my.score = score; st.my.done = done; st.my.mem = mem; paintBar();
        if (ch) ch.send({ type: "broadcast", event: "tick", payload: { score: score, done: done, mem: Math.round(mem) } });
      },
      over: function (score, done, forfeit) {
        if (st.my.over) return;
        st.my.score = score; st.my.done = done; st.my.over = true; st.my.forfeit = !!forfeit;
        if (ch) ch.send({ type: "broadcast", event: "over", payload: { score: score, done: done, forfeit: !!forfeit } });
        paintBar(); settle();
      }
    };
    window.SamukaArcade.open(choice.game, { mode: "race", seed: seed, race: ctl, coop: choice.coop });
    var win = document.querySelector(".arcade .arcade__win");
    bar = document.createElement("div");
    bar.className = "race-hud";
    win.insertBefore(bar, win.querySelector("[data-stage]"));
    paintBar();
  }
  function paintBar() {
    if (!bar || !st) return;
    var lead = st.my.score === st.them.score ? 0 : st.my.score > st.them.score ? 1 : -1;
    if (choice.coop) {
      var team = st.my.score + st.them.score, pct = Math.min(100, team / COOP_TARGET * 100);
      bar.innerHTML = '<span class="race-hud__p"><b>you</b> ' + fmt(st.my.score) + '</span><span class="race-hud__team"><i style="width:' + pct.toFixed(1) + '%"></i><b>' + fmt(team) + " / " + fmt(COOP_TARGET) + '</b></span><span class="race-hud__p race-hud__p--them"><b>' + esc(opp ? opp.name : "teammate") + "</b> " + fmt(st.them.score) + (st.them.over ? " · done" : "") + "</span>";
      return;
    }
    bar.innerHTML =
      '<span class="race-hud__p' + (lead > 0 ? " is-lead" : "") + '"><b>you</b> ' + fmt(st.my.score) + (st.my.over ? " · OOM" : "") + "</span>" +
      '<span class="race-hud__vs">vs</span>' +
      '<span class="race-hud__p race-hud__p--them' + (lead < 0 ? " is-lead" : "") + '"><b>' + esc(opp ? opp.name : "opponent") + "</b> " + fmt(st.them.score) +
      (st.them.over ? (st.them.forfeit ? " · left" : " · OOM") : "") + '<span class="race-hud__mem"><i style="width:' + Math.min(100, st.them.mem || 0) + '%"></i></span></span>';
  }
  function settle() {
    if (!st || !st.my.over || !st.them.over) return;
    if (st.phase === "done") return;
    st.phase = "done";
    var win = st.them.forfeit && !st.my.forfeit ? true : st.my.forfeit ? false : st.my.score > st.them.score;
    var tie = !st.my.forfeit && !st.them.forfeit && st.my.score === st.them.score;
    if (choice.coop) {
      var team = st.my.score + st.them.score, shipped = team >= COOP_TARGET;
      if (shipped && window.SamukaAch) window.SamukaAch.unlock("coop_ship");
      var slotC = document.querySelector("[data-race-result]");
      if (slotC) slotC.innerHTML = '<p class="race-result__verdict ' + (shipped ? "is-win" : "is-loss") + '">' + (shipped ? "Shipped together 🚀" : "Not quite shipped") + "</p>" +
        '<p class="muted">team score ' + fmt(team) + " / " + fmt(COOP_TARGET) + "</p>" + '<button class="btn btn--primary" type="button" data-race-again>↻ again</button>';
      return;
    }
    if (win && !tie && window.SamukaAch) window.SamukaAch.unlock(choice.game === "gems" ? "gems_duel" : choice.game === "merge" ? "merge_win" : "race_win");
    var html = '<p class="race-result__verdict ' + (tie ? "" : win ? "is-win" : "is-loss") + '">' + (tie ? "Tie. Race condition detected." : win ? "You win 🏁" : esc(opp ? opp.name : "Opponent") + " wins") + "</p>" +
      "<p class=\"muted\">" + fmt(st.my.score) + " vs " + fmt(st.them.score) + (st.them.forfeit ? " · opponent left" : "") + "</p>" +
      (st.my.forfeit ? "" : '<button class="btn btn--primary" type="button" data-race-again>↻ rematch</button>');
    var slot = document.querySelector("[data-race-result]");
    if (slot) slot.innerHTML = html;
    if (ch) setTimeout(function () { /* keep channel briefly so the other side gets our "over" */ }, 0);
  }
  // rematch from inside the arcade window
  document.addEventListener("click", function (e) {
    if (e.target.closest(".arcade [data-race-again]") && room) {
      var r = room, h = isHost;
      window.SamukaArcade.close();
      setTimeout(function () { open(); enter(r, h); }, 60);   // the host keeps the same game choice
    }
    var b = e.target.closest("[data-race]");
    if (b) { e.preventDefault(); open(); }
  });
  window.addEventListener("samuka:game", function (e) {
    if (e.detail && e.detail.name === "closed" && e.detail.game === "sidekiq" && st && st.phase !== "waiting" && st.phase !== "countdown") setTimeout(function () { if (st && (st.phase === "done" || st.my.over)) leave(); }, 1500);
  });
  // invite links: #race=CODE
  function fromHash() {
    var m = /#race=([A-Z0-9]{4})/i.exec(location.hash);
    if (!m) return;
    var go = function () { history.replaceState(null, "", location.pathname + location.search); open(m[1].toUpperCase()); };
    var a = A();
    if (a && a.ready && a.ready()) go(); else window.addEventListener("samuka:auth", function once() { window.removeEventListener("samuka:auth", once); setTimeout(go, 100); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fromHash); else fromHash();

  window.SamukaRace = { open: open };
})();
