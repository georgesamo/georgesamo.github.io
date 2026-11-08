/* Samuka · player cards (/u/?n=<nickname>): public card with best scores and badges,
 * a copyable link and a downloadable PNG. Data comes from public.player_card().
 */
(function () {
  "use strict";
  var root = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var card = null;
  function A() { return window.SamukaAuth; }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function wanted() { return (new URLSearchParams(location.search).get("n") || "").trim().slice(0, 24); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
  function month(t) { try { return new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric" }); } catch (e) { return ""; } }

  function finder(msg) {
    var a = A(), me = a && a.user() ? a.publicName() : null;
    root.innerHTML = (msg ? '<p class="muted">' + msg + "</p>" : "") +
      '<form class="pcard-find" data-pcard-find><input name="n" maxlength="24" placeholder="nickname" aria-label="Player nickname" required><button class="btn btn--primary" type="submit">find player</button></form>' +
      (me ? '<a class="btn" href="?n=' + encodeURIComponent(me) + '">🪪 my card</a>' : (a && a.enabled ? '<button class="btn" type="button" data-pcard-signin>sign in to get your card</button>' : ""));
  }

  async function load() {
    var name = wanted(), a = A();
    if (!name) {
      if (a && a.user()) { history.replaceState(null, "", "?n=" + encodeURIComponent(a.publicName())); name = a.publicName(); }
      else return finder("Every player gets a card with their best scores and badges.");
    }
    var c = db();
    if (c) {
      var r = await c.rpc("player_card", { p_name: name });
      if (r.error) return finder(/function/.test(r.error.message) ? "Player cards are being set up. Try again soon." : esc(r.error.message));
      card = r.data;
    } else {
      // local test session: a sample card
      card = { name: name, role: (a && a.role()) || "user", joined: new Date().toISOString(), achievements: ["hello_world", "first_game", "pipeline"], best: { gems: 2310, sidekiq: 840 }, games: 7, me: true,
        ranks: { gems: { rank: 3, of: 12, behind: 140 }, sidekiq: { rank: 7, of: 9, behind: 35 } }, streak: { current: 2, best: 5 },
        recent: [{ game: "gems", score: 2310, mode: "free", at: new Date(Date.now() - 36e5).toISOString() }, { game: "sidekiq", score: 840, mode: "free", at: new Date(Date.now() - 864e5).toISOString() }] };
    }
    if (!card) return finder("No player called <b>" + esc(name) + "</b>. Check the spelling, or find someone else:");
    render();
  }

  function render() {
    var list = (window.SamukaAch && window.SamukaAch.list) || [];
    var got = {}; (card.achievements || []).forEach(function (k) { got[k] = 1; });
    var n = list.filter(function (x) { return got[x.key]; }).length;
    var best = card.best || {};
    var role = card.role === "samuka" ? "creator" : card.role === "nino" ? "PM" : "player";
    document.title = card.name + " · player card · Samuka's Arcade";
    root.innerHTML =
      '<article class="pcard pcard--' + esc(card.role) + '" aria-label="Player card for ' + esc(card.name) + '">' +
        '<div class="pcard__top"><span class="pcard__avatar" aria-hidden="true">' + esc(card.name.charAt(0).toUpperCase()) + "</span>" +
        '<div><h1 class="pcard__name">' + esc(card.name) + '</h1><p class="pcard__meta">' + role + " · joined " + esc(month(card.joined)) + " · " + fmt(card.games) + " games</p></div></div>" +
        '<div class="pcard__stats pcard__stats--games">' + [["gems", "Gem Match"], ["sidekiq", "Sidekiq Rush"], ["schema", "Schema Stack"], ["pitwall", "Pit Wall"]].map(function (g) { return "<div><b>" + fmt(best[g[0]]) + "</b><span>" + g[1] + "</span></div>"; }).join("") + "<div><b>" + n + "/" + list.length + "</b><span>badges</span></div></div>" +
        '<div class="pcard__badges">' + list.map(function (x) {
          var on = !!got[x.key], hide = x.secret && !on;
          return '<span class="pcard__badge' + (on ? "" : " is-off") + '" title="' + esc(hide ? "secret" : x.title) + '">' + (hide ? "?" : esc(x.icon)) + "</span>";
        }).join("") + "</div>" +
        '<div class="pcard__foot"><span>georgesamo.github.io/u/?n=' + esc(card.name) + "</span><span>Samuka's Arcade</span></div>" +
      "</article>" +
      (window.SamukaAccountCore ? '<div class="pcard-extra">' + window.SamukaAccountCore.cardExtrasHtml(card) + "</div>" : "") +
      '<div class="pcard-actions"><button class="btn btn--primary" type="button" data-pcard-copy>⧉ copy link</button><button class="btn" type="button" data-pcard-png>⬇ save as image</button>' +
      (card.me ? '<button class="btn" type="button" data-acct-open>edit nickname</button>' : "") + '<a class="btn" href="/leaderboards/">leaderboards</a></div>' +
      '<form class="pcard-find" data-pcard-find><input name="n" maxlength="24" placeholder="find another player" aria-label="Player nickname" required><button class="btn" type="submit">find</button></form>';
  }

  /* PNG export drawn on a canvas (no libraries) */
  function png() {
    var W = 1040, H = 560, cv = document.createElement("canvas"), g = cv.getContext("2d");
    cv.width = W; cv.height = H;
    var cs = getComputedStyle(document.documentElement), v = function (k, d) { return (cs.getPropertyValue(k) || d).trim() || d; };
    var bg = v("--bg-elev", "#0b1912"), accent = v("--accent", "#3ad08f"), hl = v("--hl", "#d9b45a"), text = v("--text", "#e4efe8"), muted = v("--muted", "#6c857a"), soft = v("--bg-soft", "#0f2119");
    var grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, bg); grd.addColorStop(1, soft);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = card.role === "samuka" ? "#e5383b" : card.role === "nino" ? "#b98cff" : hl; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    g.fillStyle = v("--phthalo", "#123524"); g.fillRect(52, 52, 120, 120);
    g.fillStyle = hl; g.font = "800 64px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(card.name.charAt(0).toUpperCase(), 112, 116);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillStyle = text; g.font = "800 56px Inter, sans-serif"; g.fillText(card.name, 200, 112);
    g.fillStyle = muted; g.font = "22px 'JetBrains Mono', monospace"; g.fillText((card.role === "samuka" ? "creator" : card.role === "nino" ? "PM" : "player") + " · joined " + month(card.joined), 200, 154);
    var best = card.best || {}, got = (card.achievements || []).length, list = (window.SamukaAch && window.SamukaAch.list) || [];
    [["Gem Match", fmt(best.gems)], ["Sidekiq", fmt(best.sidekiq)], ["Schema", fmt(best.schema)], ["Pit Wall", fmt(best.pitwall)], ["badges", got + "/" + list.length]].forEach(function (s, i) {
      var x = 52 + i * 190;
      g.fillStyle = soft; g.fillRect(x, 220, 176, 130);
      g.fillStyle = accent; g.font = "700 34px 'JetBrains Mono', monospace"; g.fillText(s[1], x + 16, 290);
      g.fillStyle = muted; g.font = "17px 'JetBrains Mono', monospace"; g.fillText(s[0].toUpperCase(), x + 16, 330);
    });
    g.font = "34px sans-serif";
    var have = {}; (card.achievements || []).forEach(function (k) { have[k] = 1; });
    list.forEach(function (a, i) { g.globalAlpha = have[a.key] ? 1 : 0.18; g.fillText(have[a.key] || !a.secret ? a.icon : "?", 52 + i * 47, 420); });
    g.globalAlpha = 1;
    g.fillStyle = muted; g.font = "20px 'JetBrains Mono', monospace"; g.fillText("georgesamo.github.io/u/?n=" + card.name, 52, 510);
    g.textAlign = "right"; g.fillStyle = hl; g.fillText("Samuka's Arcade", W - 52, 510);
    var a = document.createElement("a");
    a.download = "player-card-" + card.name.replace(/[^\w.-]/g, "_") + ".png";
    a.href = cv.toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener("submit", function (e) {
    if (!root || !e.target.matches("[data-pcard-find]")) return;
    e.preventDefault();
    var n = e.target.elements.n.value.trim(); if (!n) return;
    if (window.SamukaNav) window.SamukaNav.go("/u/?n=" + encodeURIComponent(n)); else location.search = "?n=" + encodeURIComponent(n);
  });
  document.addEventListener("click", function (e) {
    if (!root || !root.contains(e.target)) return;
    if (e.target.closest("[data-pcard-copy]")) {
      var b = e.target.closest("[data-pcard-copy]");
      if (navigator.clipboard) navigator.clipboard.writeText(location.origin + "/u/?n=" + encodeURIComponent(card.name)).then(function () { b.textContent = "✓ copied"; });
    }
    if (e.target.closest("[data-pcard-png]")) png();
    if (e.target.closest("[data-acct-open], [data-pcard-signin]")) { var a = A(); if (a) a.open(); }
  });
  var started = false;
  function go() { root = document.querySelector("[data-pcard]"); if (root && !started) { started = true; load(); } }
  window.addEventListener("samuka:auth", function () { setTimeout(go, 50); });
  window.addEventListener("samuka:page", function () { started = false; card = null; go(); });
  setTimeout(go, 2500);
})();
