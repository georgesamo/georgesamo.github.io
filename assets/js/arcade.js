/* Samuka · arcade shell: one modal window that hosts any registered game */
(function () {
  "use strict";
  var games = {}, current = null, currentApi = null, currentId = null, modal = null, lastFocus = null;
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
    /* Every run has a seed, so any run can be replayed as a challenge (challenge.js). Games keep the
     * api.rng function they got at mount; newRun() swaps the generator behind it when a run starts:
     * a fresh random seed in free play, the given one in daily / race / challenge (same board every try). */
    var fixed = opts.seed != null, gen = null, runSeed = null;
    function newRun() {
      runSeed = fixed ? String(opts.seed) : id + "-" + Math.random().toString(36).slice(2, 10);
      gen = seeded(runSeed);
      return runSeed;
    }
    newRun();
    return {
      stage: stage,
      opts: opts,
      mode: opts.mode || "free",
      rng: function () { return gen(); },
      newRun: newRun,
      seed: function () { return runSeed; },
      emit: function (name, data) { emit(id, name, data, opts); },
      get reduced() { return window.SamukaCalm ? window.SamukaCalm.on() : window.matchMedia("(prefers-reduced-motion: reduce)").matches; },   // calm mode, live
      // only touch the DOM when the text actually changed (games call these every frame)
      hud: function (html) { var el = modal.querySelector("[data-hud]"); if (el.__h !== html) { el.__h = html; el.innerHTML = html; } },
      foot: function (html) { var el = modal.querySelector("[data-foot]"); if (el.__h !== html) { el.__h = html; el.innerHTML = html; } },
      best: function (score, extra) {
        var payload = { score: score, seed: runSeed }; if (extra) for (var k in extra) payload[k] = extra[k];
        emit(id, "over", payload, opts);
        // a challenge is a known board: it doesn't count as a best or go on the boards
        if (opts.mode === "daily" || opts.mode === "race" || opts.mode === "challenge") return { best: score, isNew: false };
        guestNudge(stage, score);
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

  /* ---------- games load on demand ----------
   * Each game's code (20–60 KB) is fetched the first time it's opened, or a moment earlier when a
   * play button is hovered, focused or pressed. window.SamukaGameSrc (default.html) maps id → src. */
  function src() { return window.SamukaGameSrc || {}; }
  var loading = {};
  function load(id) {
    if (games[id]) return Promise.resolve(games[id]);
    if (loading[id]) return loading[id];
    var s = src()[id];
    if (!s) return Promise.reject(new Error("unknown game " + id));
    loading[id] = new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = s.src; el.async = true;
      el.onload = function () { games[id] ? resolve(games[id]) : reject(new Error(id + " didn't register")); };
      el.onerror = function () { delete loading[id]; el.remove(); reject(new Error("couldn't load " + id)); };
      document.head.appendChild(el);
    });
    return loading[id];
  }
  function intent(e) {
    var b = e.target.closest && e.target.closest("[data-play]");
    if (b) load(b.getAttribute("data-play")).catch(function () {});
  }
  document.addEventListener("pointerover", intent, { passive: true });
  document.addEventListener("pointerdown", intent, { passive: true });
  document.addEventListener("focusin", intent);

  var pending = null;   // the game whose code is on its way
  function open(id, opts) {
    if (!games[id] && !src()[id]) return false;
    // guests can play; the daily puzzle and live races need an account (one try a day, a name to race)
    var A = window.SamukaAuth;
    if (A && A.enabled && !A.user() && opts && (opts.mode === "daily" || opts.mode === "race")) { A.open({ reason: "arcade" }); return false; }
    if (!modal) build();
    if (current || currentId) teardown();
    lastFocus = document.activeElement;
    if (!games[id]) {
      // show the window right away: a short "loading" state while the game's code arrives
      showWindow(id, opts, src()[id].title);
      var stage = modal.querySelector("[data-stage]");
      stage.innerHTML = '<p class="arcade__loading" role="status">loading ' + src()[id].title + "…</p>";
      currentId = id; pending = id;
      load(id).then(function () {
        if (pending !== id || modal.hidden) return;   // closed or switched meanwhile
        pending = null;
        mount(id, opts);
      }, function () {
        if (pending !== id) return;
        pending = null; currentId = null;   // nothing started, so closing or retrying sends no "closed"
        stage.innerHTML = '<div class="arcade__overlay"><div class="arcade__card"><h3>Couldn\'t load the game</h3><p>Check your connection and try again.</p>' +
          '<button class="btn btn--primary" type="button" data-play="' + id + '">↻ try again</button></div></div>';
      });
      return true;
    }
    showWindow(id, opts, games[id].title);
    mount(id, opts);
    return true;
  }
  function showWindow(id, opts, title) {
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    // the window covers the viewport, so the page behind it is only burning frames: is-arcade
    // lets the CSS drop the card previews out of rendering while a game runs
    document.documentElement.classList.add("is-arcade");
    document.querySelectorAll(".arcade-card__preview").forEach(function (pv) { setPreview(pv, false); });
    modal.querySelector("#arcade-title").textContent = title + (opts && opts.mode && opts.mode !== "free" ? " · " + opts.mode : "");
    modal.querySelector("[data-hud]").innerHTML = "";
    modal.querySelector("[data-foot]").innerHTML = "";
    modal.dataset.game = id;
    var stage = modal.querySelector("[data-stage]");
    stage.innerHTML = "";
    stage.className = "arcade__stage arcade__stage--" + id;
  }
  function mount(id, opts) {
    var stage = modal.querySelector("[data-stage]");
    stage.innerHTML = "";
    currentId = id;
    currentApi = api(id, stage, opts);
    current = games[id].mount(stage, currentApi) || {};
    emit(id, "start", null, opts);
    stage.focus({ preventScroll: true });
    return true;
  }
  function teardown() {
    if (current && current.destroy) current.destroy();
    // a game closed while its code was still loading never started: no "closed" for it
    if (currentId && !pending) window.dispatchEvent(new CustomEvent("samuka:game", { detail: { game: currentId, name: "closed" } }));
    current = null; currentId = null; pending = null;
  }
  function showBests() {
    document.querySelectorAll("[data-best]").forEach(function (el) {
      var v = getBest(el.getAttribute("data-best"));
      el.innerHTML = v ? "your best <b>" + v + "</b>" : "no score yet";
    });
  }
  showBests();
  window.addEventListener("samuka:page", showBests);   // seamless navigation swaps new cards in

  /* The card previews animate only while you can see them: off screen (most of the list on a phone) they
   * stop - their CSS animations, and the Pit Wall preview's SVG clock, whose <animateMotion> cars cost a
   * layout pass every frame. A game being open stops them all (the window covers the page). */
  var pvIO = null;
  function setPreview(pv, on) {
    pv.classList.toggle("is-idle", !on);
    pv.querySelectorAll("svg").forEach(function (s) { if (s.pauseAnimations) { if (on) s.unpauseAnimations(); else s.pauseAnimations(); } });
  }
  function watchPreviews() {
    if (pvIO) pvIO.disconnect();
    var pvs = document.querySelectorAll(".arcade-card__preview");
    if (!pvs.length || !("IntersectionObserver" in window)) return;
    pvIO = new IntersectionObserver(function (en) {
      en.forEach(function (e) { setPreview(e.target, e.isIntersecting && !current); });
    }, { rootMargin: "80px" });
    pvs.forEach(function (pv) { setPreview(pv, false); pvIO.observe(pv); });
  }
  watchPreviews();
  window.addEventListener("samuka:page", watchPreviews);
  window.addEventListener("samuka:auth", showBests);
  function close() {
    if (!modal || modal.hidden) return;
    teardown();
    showBests();
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    document.documentElement.classList.remove("is-arcade");
    watchPreviews();   // the previews in view start again
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
    // every game the site has, loaded or not (menus, the terminal and Ctrl+P list them before any code loads)
    list: function () {
      var all = {}, s = src();
      Object.keys(s).forEach(function (k) { all[k] = { id: k, title: s[k].title, blurb: s[k].blurb }; });
      Object.keys(games).forEach(function (k) { all[k] = { id: k, title: games[k].title, blurb: games[k].blurb }; });
      return Object.keys(all).map(function (k) { return all[k]; });
    },
    load: load,
    loaded: function (id) { return !!games[id]; },
    isOpen: function () { return !!(modal && !modal.hidden); },
    current: function () { return currentId; },
    seeded: seeded,
    seed: function () { return currentApi && currentId ? currentApi.seed() : null; },   // the running game's seed
    best: getBest,
    // bests saved on the server (scores.js) never lower a local best
    mergeBests: function (map) { Object.keys(map || {}).forEach(function (g) { if ((map[g] | 0) > getBest(g)) setBest(g, map[g] | 0); }); showBests(); },
    _debug: function () { return current && current._debug; } // used by automated playtests only
  };
})();
