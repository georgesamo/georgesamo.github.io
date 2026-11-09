/* Samuka · arcade shell: one modal window that hosts any registered game */
(function () {
  "use strict";
  var games = {}, current = null, currentId = null, modal = null, lastFocus = null;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  function build() {
    modal = document.createElement("div");
    modal.className = "arcade";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="arcade__backdrop" data-arcade-close></div>' +
      '<div class="arcade__win" role="dialog" aria-modal="true" aria-labelledby="arcade-title">' +
        '<div class="arcade__bar">' +
          '<span class="dots"><i data-arcade-close></i><i></i><i></i></span>' +
          '<span class="arcade__title" id="arcade-title"></span>' +
          '<span class="arcade__hud" data-hud aria-live="off"></span>' +
          '<button class="arcade__x" type="button" data-arcade-close aria-label="Close game">esc</button>' +
        "</div>" +
        '<div class="arcade__stage" data-stage tabindex="-1"></div>' +
        '<div class="arcade__foot" data-foot></div>' +
      "</div>";
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target.closest("[data-arcade-close]")) close(); });
  }

  /* personal bests: kept per signed-in account (a shared device doesn't mix people up) and
   * merged with the scores saved on the server by scores.js (SamukaArcade.mergeBests) */
  function bestKey(id) {
    var A = window.SamukaAuth, u = A && A.user && A.user();
    return "samuka-best-" + (u && u.id ? u.id + "-" : "") + id;
  }
  function getBest(id) {
    var v = parseInt(store.get(bestKey(id)) || "0", 10) || 0;
    return v || parseInt(store.get("samuka-best-" + id) || "0", 10) || 0;   // scores from before accounts
  }
  function setBest(id, v) { store.set(bestKey(id), String(v)); }

  // seeded random numbers (daily puzzle, live races): same seed, same game
  function seeded(seed) {
    var str = String(seed), h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    var a = h >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function emit(id, name, data, opts) {
    var d = { game: id, name: name, mode: (opts && opts.mode) || "free" };
    if (data) for (var k in data) d[k] = data[k];
    window.dispatchEvent(new CustomEvent("samuka:game", { detail: d }));
  }

  // a guest's game-over card offers to keep the score (scores.js holds it until they sign in)
  function guestNudge(stage, score) {
    var A = window.SamukaAuth;
    if (!A || !A.enabled || A.user() || !(score > 0)) return;
    var tries = 0;
    (function attach() {   // games draw their game-over card right after best(), sometimes after an animation
      var card = stage.isConnected && stage.querySelector(".arcade__overlay .arcade__card");
      if (!card) { if (++tries < 40) setTimeout(attach, 100); return; }
      if (card.querySelector(".arcade__claim")) return;
      var p = document.createElement("p");
      p.className = "arcade__claim";
      p.innerHTML = "💾 <b>" + Number(score).toLocaleString("en-US") + "</b> is kept on this device. " +
        '<button type="button" class="linklike" data-me-act="signin">Sign in</button> to put it on the leaderboards.';
      card.appendChild(p);
    })();
  }

  function api(id, stage, opts) {
    opts = opts || {};
    return {
      stage: stage,
      opts: opts,
      mode: opts.mode || "free",
      rng: opts.seed != null ? seeded(opts.seed) : Math.random,
      emit: function (name, data) { emit(id, name, data, opts); },
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      // only touch the DOM when the text actually changed (games call these every frame)
      hud: function (html) { var el = modal.querySelector("[data-hud]"); if (el.__h !== html) { el.__h = html; el.innerHTML = html; } },
      foot: function (html) { var el = modal.querySelector("[data-foot]"); if (el.__h !== html) { el.__h = html; el.innerHTML = html; } },
      best: function (score, extra) {
        var payload = { score: score }; if (extra) for (var k in extra) payload[k] = extra[k];
        emit(id, "over", payload, opts);
        guestNudge(stage, score);
        if (opts.mode === "daily" || opts.mode === "race") return { best: score, isNew: false };
        var prev = getBest(id);
        if (score > prev) { setBest(id, score); return { best: score, isNew: true }; }
        return { best: prev, isNew: false };
      },
      peekBest: function () { return getBest(id); },
      overlay: function (html) {
        var o = stage.querySelector(".arcade__overlay");
        if (!o) { o = document.createElement("div"); o.className = "arcade__overlay"; stage.appendChild(o); }
        o.innerHTML = '<div class="arcade__card">' + html + "</div>";
        // focus without scrolling: on a short screen the card scrolls, and a plain focus() jumped it to
        // the button at the bottom, so the game's title and rules opened out of view
        var btn = o.querySelector("button"); if (btn) setTimeout(function () { btn.focus({ preventScroll: true }); }, 30);
        return o;
      },
      clearOverlay: function () { var o = stage.querySelector(".arcade__overlay"); if (o) o.remove(); },
      toast: function (text, cls) {
        var t = document.createElement("div");
        t.className = "arcade__toast " + (cls || "");
        t.textContent = text;
        stage.appendChild(t);
        setTimeout(function () { t.remove(); }, 1400);
      }
    };
  }

  function open(id, opts) {
    if (!games[id]) return false;
    // guests can play; the daily puzzle and live races need an account (one try a day, a name to race)
    var A = window.SamukaAuth;
    if (A && A.enabled && !A.user() && opts && (opts.mode === "daily" || opts.mode === "race")) { A.open({ reason: "arcade" }); return false; }
    if (!modal) build();
    if (current) teardown();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    // the window covers the viewport, so the page behind it is only burning frames: is-arcade
    // lets the CSS drop the card previews out of rendering while a game runs
    document.documentElement.classList.add("is-arcade");
    modal.querySelector("#arcade-title").textContent = games[id].title + (opts && opts.mode && opts.mode !== "free" ? " · " + opts.mode : "");
    modal.querySelector("[data-hud]").innerHTML = "";
    modal.querySelector("[data-foot]").innerHTML = "";
    modal.dataset.game = id;
    var stage = modal.querySelector("[data-stage]");
    stage.innerHTML = "";
    stage.className = "arcade__stage arcade__stage--" + id;
    currentId = id;
    current = games[id].mount(stage, api(id, stage, opts)) || {};
    emit(id, "start", null, opts);
    stage.focus({ preventScroll: true });
    return true;
  }
  function teardown() {
    if (current && current.destroy) current.destroy();
    if (currentId) window.dispatchEvent(new CustomEvent("samuka:game", { detail: { game: currentId, name: "closed" } }));
    current = null; currentId = null;
  }
  function showBests() {
    document.querySelectorAll("[data-best]").forEach(function (el) {
      var v = getBest(el.getAttribute("data-best"));
      el.innerHTML = v ? "your best <b>" + v + "</b>" : "no score yet";
    });
  }
  showBests();
  window.addEventListener("samuka:page", showBests);   // seamless navigation swaps new cards in
  window.addEventListener("samuka:auth", showBests);
  function close() {
    if (!modal || modal.hidden) return;
    teardown();
    showBests();
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    document.documentElement.classList.remove("is-arcade");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("keydown", function (e) {
    if (!modal || modal.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (current && current.key) current.key(e);
  }, true);
  document.addEventListener("visibilitychange", function () { if (document.hidden && current && current.pause) current.pause(); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-play]");
    if (b) { e.preventDefault(); open(b.getAttribute("data-play"), b.hasAttribute("data-mode") ? { mode: b.getAttribute("data-mode") } : null); }
  });

  window.SamukaArcade = {
    register: function (id, def) { games[id] = def; },
    open: open, close: close,
    list: function () { return Object.keys(games).map(function (k) { return { id: k, title: games[k].title, blurb: games[k].blurb }; }); },
    isOpen: function () { return !!(modal && !modal.hidden); },
    current: function () { return currentId; },
    seeded: seeded,
    best: getBest,
    // bests saved on the server (scores.js) never lower a local best
    mergeBests: function (map) { Object.keys(map || {}).forEach(function (g) { if ((map[g] | 0) > getBest(g)) setBest(g, map[g] | 0); }); showBests(); },
    _debug: function () { return current && current._debug; } // used by automated playtests only
  };
})();
