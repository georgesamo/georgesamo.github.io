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

  function api(id, stage) {
    return {
      stage: stage,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      hud: function (html) { modal.querySelector("[data-hud]").innerHTML = html; },
      foot: function (html) { modal.querySelector("[data-foot]").innerHTML = html; },
      best: function (score) {
        var key = "samuka-best-" + id, prev = parseInt(store.get(key) || "0", 10) || 0;
        if (score > prev) { store.set(key, String(score)); return { best: score, isNew: true }; }
        return { best: prev, isNew: false };
      },
      peekBest: function () { return parseInt(store.get("samuka-best-" + id) || "0", 10) || 0; },
      overlay: function (html) {
        var o = stage.querySelector(".arcade__overlay");
        if (!o) { o = document.createElement("div"); o.className = "arcade__overlay"; stage.appendChild(o); }
        o.innerHTML = '<div class="arcade__card">' + html + "</div>";
        var btn = o.querySelector("button"); if (btn) setTimeout(function () { btn.focus(); }, 30);
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

  function open(id) {
    if (!games[id]) return false;
    if (!modal) build();
    if (current) teardown();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    modal.querySelector("#arcade-title").textContent = games[id].title;
    modal.querySelector("[data-hud]").innerHTML = "";
    modal.querySelector("[data-foot]").innerHTML = "";
    modal.dataset.game = id;
    var stage = modal.querySelector("[data-stage]");
    stage.innerHTML = "";
    stage.className = "arcade__stage arcade__stage--" + id;
    currentId = id;
    current = games[id].mount(stage, api(id, stage)) || {};
    stage.focus({ preventScroll: true });
    return true;
  }
  function teardown() { if (current && current.destroy) current.destroy(); current = null; currentId = null; }
  function showBests() {
    document.querySelectorAll("[data-best]").forEach(function (el) {
      var v = parseInt(store.get("samuka-best-" + el.getAttribute("data-best")) || "0", 10);
      el.innerHTML = v ? "your best <b>" + v + "</b>" : "no score yet";
    });
  }
  showBests();
  function close() {
    if (!modal || modal.hidden) return;
    teardown();
    showBests();
    modal.hidden = true;
    document.documentElement.style.overflow = "";
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
    if (b) { e.preventDefault(); open(b.getAttribute("data-play")); }
  });

  window.SamukaArcade = {
    register: function (id, def) { games[id] = def; },
    open: open, close: close,
    list: function () { return Object.keys(games).map(function (k) { return { id: k, title: games[k].title, blurb: games[k].blurb }; }); },
    isOpen: function () { return !!(modal && !modal.hidden); },
    _debug: function () { return current && current._debug; } // used by automated playtests only
  };
})();
