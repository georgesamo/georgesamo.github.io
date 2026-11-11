/* Samuka · /settings/: every preference in one place.
 * Draws only. Each control calls the module that already owns the setting:
 *   look    → Samuka.setMode / setSkin (app.js; auth.js saves the skin to the account)
 *   sound   → SamukaLofi (play, volume, shuffle)
 *   account → SamukaAuth (glitches), SamukaPresence (live cursors), me.js ([data-me-act] buttons)
 * Re-draws on samuka:page / auth / theme; music changes only touch the music row.
 */
(function () {
  "use strict";
  var C = window.SamukaAccountCore;
  if (!C) return;
  var esc = C.esc;
  function $(s, r) { return (r || document).querySelector(s); }
  function root() { return $("[data-settings]"); }

  /* ---------- state from the owning modules ---------- */
  function ctx() {
    var S = window.Samuka, A = window.SamukaAuth, L = window.SamukaLofi, P = window.SamukaPresence;
    var user = !!(A && A.user && A.user());
    var skins = S && S.availableSkins ? S.availableSkins() : ["phthalo"];
    var prof = user && A.profile ? A.profile() || {} : {};
    return {
      mode: S && S.mode ? S.mode() : (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
      skin: S && S.skin ? S.skin() : "phthalo",
      skins: skins,
      secretLeft: skins.indexOf("crt") < 0,
      auth: !!(A && A.enabled),
      user: user,
      name: user && A.publicName ? A.publicName() : "",
      role: user && A.role ? A.role() : "guest",
      glitches: prof.glitches !== false,
      cursors: user && P && P.cursors ? P.cursors() : null,
      music: L ? music(L) : null,
      calm: window.SamukaCalm ? { pref: window.SamukaCalm.pref(), on: window.SamukaCalm.on(), system: window.SamukaCalm.system() } : null
    };
  }
  function music(L) {
    var t = L.track && L.track();
    return { on: !!(L.isOn && L.isOn()), paused: !!(L.isPaused && L.isPaused()), vol: L.volume ? L.volume() : 1, shuffle: !!(L.shuffle && L.shuffle()), track: t ? t.name : "" };
  }

  /* ---------- markup ---------- */
  function section(id, title, note, body) {
    return '<section class="set" aria-labelledby="set-' + id + '"><h2 class="set__h" id="set-' + id + '">' + title + (note ? " <small>" + note + "</small>" : "") + "</h2>" + body + "</section>";
  }
  function toggle(attr, on, label, hint) {
    return '<label class="acct__toggle set__toggle"><input type="checkbox" ' + attr + (on ? " checked" : "") + "><span>" + label + (hint ? "<small>" + hint + "</small>" : "") + "</span></label>";
  }
  function musicRow(m) {
    var playing = m.on && !m.paused;
    return '<div class="set__row" data-set-music-row><span class="set__label">Music<small data-set-track>' + (m.on ? (m.paused ? "paused · " : "♪ ") + esc(m.track) : "off") + "</small></span>" +
      '<button type="button" class="btn" data-set-music aria-pressed="' + playing + '">' + (playing ? "⏸ pause" : "▶ play") + "</button></div>";
  }
  function soundHtml(m) {
    if (!m) return '<p class="muted">Music isn\'t available in this browser.</p>';
    return musicRow(m) +
      '<label class="set__row"><span class="set__label">Volume<small data-set-vol-n>' + Math.round(m.vol * 100) + "%</small></span>" +
      '<input type="range" class="set__range" min="0" max="100" step="5" value="' + Math.round(m.vol * 100) + '" data-set-volume aria-label="Music volume"></label>' +
      toggle("data-set-shuffle", m.shuffle, "Shuffle", "play tracks in a random order");
  }
  var CALM = [["auto", "auto"], ["on", "on"], ["off", "off"]];
  function calmHtml(k) {
    if (!k) return "";
    var opts = CALM.map(function (o) {
      var on = o[0] === k.pref;
      return '<label class="acct__mode' + (on ? " is-on" : "") + '"><input type="radio" name="calm" value="' + o[0] + '"' + (on ? " checked" : "") + "><span>" + o[1] + "</span></label>";
    }).join("");
    var now = k.pref === "auto" ? "Following your device: reduced motion is " + (k.system ? "on, so calm mode is on." : "off, so calm mode is off.") : "Calm mode is " + (k.on ? "on." : "off.");
    return '<div class="set__row set__row--stack"><span class="set__label">Calm mode<small>no screen shake, glitches, spinning or sliding animations</small></span>' +
      '<div class="acct__modes set__modes3" role="radiogroup" aria-label="Calm mode">' + opts + "</div>" +
      '<p class="set__note" data-set-calm-now>' + now + "</p></div>";
  }
  function accountHtml(c) {
    if (!c.auth) return '<p class="muted">Accounts aren\'t available right now. Your scores and settings stay on this device.</p>';
    if (!c.user) {
      return '<p class="set__lead">You\'re playing as a guest. Scores, badges and settings stay on this device.</p>' +
        '<button type="button" class="btn btn--primary" data-me-act="signin">🔑 sign in</button> <span class="muted">to save scores, get a player card and use your skin everywhere</span>';
    }
    return '<div class="set__row"><span class="set__label">Signed in as <b>' + esc(c.name) + "</b><small>" + esc(C.roleLabel(c.role)) + "</small></span>" +
        '<span class="set__btns"><button type="button" class="btn" data-me-act="profile">edit nickname</button><button type="button" class="btn" data-me-act="signout">sign out</button></span></div>' +
      toggle("data-set-glitches", c.glitches, "Glitch easter eggs", "the screen occasionally glitches for a moment") +
      (c.cursors === null ? "" : toggle("data-set-cursors", c.cursors, "Live cursors", "see where other visitors are pointing")) +
      C.dataHtml({ owner: c.role === "samuka" });
  }
  function html(c) {
    return section("look", "Look", c.user ? "" : "this device", C.appearanceHtml({ mode: c.mode, skin: c.skin, skins: c.skins, secretLeft: c.secretLeft, local: !c.user })) +
      (c.calm ? section("comfort", "Comfort", "this device", calmHtml(c.calm)) : "") +
      section("sound", "Sound", "this device", soundHtml(c.music)) +
      section("account", "Account", "", accountHtml(c));
  }

  /* ---------- paint ---------- */
  function paint() {
    var el = root();
    if (!el) return;
    // keep focus on the control the visitor is using across the redraw
    var f = document.activeElement, key = f && el.contains(f) ? focusKey(f) : null;
    el.innerHTML = html(ctx());
    if (key) { var again = el.querySelector(key); if (again) again.focus({ preventScroll: true }); }
  }
  function focusKey(f) {
    if (f.name && f.value && f.type === "radio") return 'input[name="' + f.name + '"][value="' + f.value + '"]';
    var a = ["data-set-music", "data-set-shuffle", "data-set-glitches", "data-set-cursors", "data-set-volume"].filter(function (x) { return f.hasAttribute(x); })[0];
    return a ? "[" + a + "]" : null;
  }
  function paintMusic() {
    var el = root(), L = window.SamukaLofi;
    if (!el || !L) return;
    var row = el.querySelector("[data-set-music-row]");
    if (!row) return paint();
    var m = music(L), had = document.activeElement && document.activeElement.hasAttribute("data-set-music");
    var tmp = document.createElement("div");
    tmp.innerHTML = musicRow(m);
    row.replaceWith(tmp.firstChild);
    if (had) el.querySelector("[data-set-music]").focus({ preventScroll: true });
  }

  /* ---------- controls ---------- */
  document.addEventListener("change", function (e) {
    var el = root(), t = e.target;
    if (!el || !el.contains(t)) return;
    var S = window.Samuka, L = window.SamukaLofi;
    if (t.name === "mode" && S) S.setMode(t.value, { user: true });
    else if (t.name === "skin" && S) S.setSkin(t.value, { user: true });
    else if (t.name === "calm" && window.SamukaCalm) window.SamukaCalm.set(t.value);
    else if (t.hasAttribute("data-set-shuffle") && L) L.shuffle(t.checked);
    else if (t.hasAttribute("data-set-glitches") && window.SamukaAuth) window.SamukaAuth.savePrefs({ glitches: t.checked });
    else if (t.hasAttribute("data-set-cursors") && window.SamukaPresence) window.SamukaPresence.cursors(t.checked);
  });
  document.addEventListener("input", function (e) {
    var el = root(), t = e.target;
    if (!el || !el.contains(t) || !t.hasAttribute("data-set-volume") || !window.SamukaLofi) return;
    var v = Math.max(0, Math.min(100, Number(t.value) || 0));
    window.SamukaLofi.volume(v / 100);
    var n = el.querySelector("[data-set-vol-n]"); if (n) n.textContent = v + "%";
  });
  document.addEventListener("click", function (e) {
    var el = root(), b = e.target.closest && e.target.closest("[data-set-music]");
    if (!el || !b || !el.contains(b)) return;
    var L = window.SamukaLofi; if (!L) return;
    if (!L.isOn()) L.start(); else if (L.isPaused()) L.resume(); else L.pause();
    setTimeout(paintMusic, 60);
  });

  window.addEventListener("samuka:page", paint);
  window.addEventListener("samuka:auth", paint);
  window.addEventListener("samuka:theme", paint);
  window.addEventListener("samuka:calm", paint);
  window.addEventListener("samuka:lofi", paintMusic);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
  window.addEventListener("load", function () { setTimeout(paint, 300); });

  window.SamukaSettings = { html: html, ctx: ctx, paint: paint };
})();
