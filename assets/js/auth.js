/* Samuka · optional accounts (Supabase): roles, synced preferences, account window
 *
 * Roles: guest (signed out) · user (default) · samuka · nino
 * The role is read from public.profiles (row-level security: own row only;
 * users can never change their own role). The UI uses it for cosmetic gating.
 */
(function () {
  "use strict";
  var cfg = (window.SITE && window.SITE.supabase) || {};
  var root = document.documentElement;
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ROLE_LABEL = { guest: "guest", user: "user", samuka: "samuka · owner", nino: "nino · PM" };

  /* local-only test session: http://127.0.0.1:4000/?as=samuka (never on the live site) */
  var mockRole = null;
  if (local) {
    var q = new URLSearchParams(location.search).get("as");
    if (q === "out") store.sset("samuka-mock", null);
    else if (q) store.sset("samuka-mock", q);
    mockRole = store.sget("samuka-mock");
    if (mockRole && ["guest", "user", "samuka", "nino"].indexOf(mockRole) < 0) mockRole = null;
  }

  var client = null;
  var enabled = !!(mockRole || (cfg.url && cfg.anon_key && window.supabase && window.supabase.createClient));
  var state = { user: null, profile: null, role: "guest", ready: false };
  var providers = { github: !!cfg.github }; // refreshed from Supabase at boot, so enabling a provider needs no deploy
  var saveTimer = 0, modal = null, notice = "", extras = [];

  /* ---------- state ---------- */
  function applyRole(role) {
    state.role = role;
    root.dataset.role = role;
    root.dataset.auth = enabled ? "on" : "off";
    store.set("samuka-role", role === "guest" ? null : role);
  }
  function applyTheme() {
    var S = window.Samuka; if (!S) return;
    // the account remembers the style (skin); dark/light stays a per-device choice
    if (state.profile) {
      var p = state.profile.theme;
      if (p === "crt") store.set("samuka-konami", "1"); // unlocked on another device
      S.setSkin(p === "knight" || p === "golden" || p === "crt" ? p : "phthalo", { persist: true });
    } else {
      S.setSkin(store.get("samuka-skin") || "phthalo", { persist: false });
    }
  }
  function emit() {
    window.dispatchEvent(new CustomEvent("samuka:auth", { detail: { user: state.user, role: state.role, profile: state.profile } }));
    paintButtons();
    if (modal && !modal.hidden) renderModal();
  }
  async function loadProfile() {
    if (mockRole) {
      state.profile = { role: mockRole, theme: store.sget("samuka-mock-theme") || "auto", glitches: store.sget("samuka-mock-glitch") !== "off", display_name: mockRole, nickname: store.sget("samuka-mock-nick") || null };
      return;
    }
    var res = await client.from("profiles").select("role, theme, glitches, display_name, nickname").eq("id", state.user.id).single();
    if (res.error) {
      console.warn("[auth] profile not found yet, using defaults", res.error.message);
      state.profile = { role: "user", theme: "auto", glitches: true, display_name: (state.user.email || "").split("@")[0] };
    } else state.profile = res.data;
  }
  // a fresh sign-in (magic link / GitHub return, or a local ?as= test login) starts in dark mode
  var justSignedIn = /(^|[#&])access_token=/.test(location.hash) || (!!mockRole && /[?&]as=/.test(location.search));
  async function onSession(session) {
    state.user = session ? session.user : null;
    if (state.user) await loadProfile(); else state.profile = null;
    applyRole(state.user ? (state.profile && state.profile.role) || "user" : "guest");
    if (state.user && justSignedIn && window.Samuka) { justSignedIn = false; window.Samuka.setMode("dark"); }
    applyTheme();
    state.ready = true;
    emit();
  }

  /* ---------- preferences ---------- */
  function savePrefs(patch) {
    if (!state.user || !state.profile) return;
    Object.keys(patch).forEach(function (k) { state.profile[k] = patch[k]; });
    if (mockRole) {
      if ("theme" in patch) store.sset("samuka-mock-theme", patch.theme);
      if ("glitches" in patch) store.sset("samuka-mock-glitch", patch.glitches ? "on" : "off");
      if ("nickname" in patch) store.sset("samuka-mock-nick", patch.nickname);
      emit(); return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      var res = await client.from("profiles").update(patch).eq("id", state.user.id);
      if (res.error) {
        console.warn("[auth] could not save preferences", res.error.message);
        if ("nickname" in patch && /duplicate|unique/i.test(res.error.message)) {
          state.profile.nickname = null;
          var ni = modal && modal.querySelector('input[name="nickname"]');
          if (ni) { ni.setCustomValidity("That nickname is taken. Try another one."); ni.reportValidity(); ni.addEventListener("input", function () { ni.setCustomValidity(""); }, { once: true }); }
        }
      }
    }, 400);
    emit();
  }
  window.addEventListener("samuka:theme", function (e) {
    var d = e.detail || {};
    if (d.user && d.changed === "skin" && state.user) savePrefs({ theme: d.skin === "phthalo" ? "auto" : d.skin });
    if (modal && !modal.hidden && state.user) renderModal();
  });

  /* ---------- actions ---------- */
  function redirectUrl() { return location.origin + location.pathname; }
  async function signInEmail(email) {
    if (mockRole || !client) return { error: { message: "sign-in is not configured yet" } };
    return client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectUrl() } });
  }
  async function signInGitHub() {
    if (!client) return;
    await client.auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirectUrl() } });
  }
  async function signOut() {
    if (mockRole) { store.sset("samuka-mock", null); mockRole = null; enabled = !!client; return onSession(null); }
    if (client) await client.auth.signOut();
  }

  /* ---------- buttons on the page ---------- */
  function initial() {
    var n = (state.profile && state.profile.display_name) || (state.user && state.user.email) || "?";
    return n.charAt(0).toUpperCase();
  }
  window.addEventListener("samuka:page", function () { paintButtons(); });
  function paintButtons() {
    document.querySelectorAll("[data-account]").forEach(function (b) {
      if (!enabled) { b.hidden = true; return; }
      b.hidden = false;
      b.classList.toggle("is-in", !!state.user);
      b.innerHTML = state.user
        ? '<span class="acct__avatar">' + esc(initial()) + '</span><span class="acct__role">' + esc(state.role) + "</span>"
        : '<span class="acct__in">sign in</span>';
      b.setAttribute("aria-label", state.user ? "Account (" + state.role + ")" : "Sign in");
    });
    // arcade: locked for guests when accounts are on
    var locked = enabled && !state.user;
    document.querySelectorAll("[data-play]").forEach(function (b) {
      b.classList.toggle("is-locked", locked);
      if (!b.hasAttribute("data-label")) b.setAttribute("data-label", b.innerHTML);   // keep each button's own text
      b.innerHTML = locked ? '<span class="btn__prompt">🔒</span> sign in to play' : b.getAttribute("data-label");
    });
  }

  /* ---------- account window ---------- */
  function build() {
    modal = document.createElement("div");
    modal.className = "acct";
    modal.hidden = true;
    modal.innerHTML = '<div class="acct__backdrop" data-acct-close></div><div class="acct__win" role="dialog" aria-modal="true" aria-labelledby="acct-title">' +
      '<div class="acct__bar"><span class="dots"><i data-acct-close></i><i></i><i></i></span><span class="acct__title" id="acct-title">app/controllers/sessions_controller.rb</span><button class="acct__x" type="button" data-acct-close aria-label="Close">esc</button></div>' +
      '<div class="acct__body" data-acct-body></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", onModalClick);
    modal.addEventListener("submit", onSubmit);
    modal.addEventListener("change", onChange);
  }
  function themeOptions() {
    var S = window.Samuka; if (!S) return "";
    var names = { phthalo: "Phthalo", knight: "Dark Knight", golden: "Golden", crt: "CRT" };
    var notes = { phthalo: "green & gold · everyone", knight: "samuka only · black & crimson", golden: "nino only · purple & gold", crt: "secret · phosphor terminal" };
    var skin = S.skin(), mode = S.mode();
    var modes = '<div class="acct__modes" role="radiogroup" aria-label="mode">' + ["dark", "light"].map(function (m) {
      return '<label class="acct__mode' + (m === mode ? " is-on" : "") + '"><input type="radio" name="mode" value="' + m + '"' + (m === mode ? " checked" : "") + '><span>' + (m === "dark" ? "☾ dark" : "☀ light") + "</span></label>";
    }).join("") + "</div>";
    return modes + S.availableSkins().map(function (t) {
      return '<label class="acct__theme acct__theme--' + t + (t === skin ? " is-on" : "") + '"><input type="radio" name="skin" value="' + t + '"' + (t === skin ? " checked" : "") + '>' +
        '<span class="acct__swatch" aria-hidden="true"><i></i><i></i></span><span><b>' + names[t] + "</b><small>" + notes[t] + "</small></span></label>";
    }).join("");
  }
  function renderModal() {
    var body = modal.querySelector("[data-acct-body]");
    if (!state.user) {
      body.innerHTML =
        '<p class="acct__kicker">$ bin/rails devise:sessions:new</p>' +
        "<h3>Sign in</h3>" +
        '<p>Totally optional. Signing in unlocks the <b>arcade</b> and remembers your theme.</p>' +
        (notice ? '<p class="acct__notice">' + notice + "</p>" : "") +
        '<form class="acct__form" data-acct-email novalidate><label for="acct-email">email</label>' +
        '<div class="acct__row"><input id="acct-email" type="email" name="email" autocomplete="email" required placeholder="you@company.com">' +
        '<button class="btn btn--primary" type="submit">send magic link</button></div></form>' +
        (providers.github ? '<div class="acct__or"><span>or</span></div><button class="btn acct__gh" type="button" data-acct-github><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg> Sign in with GitHub</button>' : "") +
        '<p class="acct__fine">No password needed: we email you a one-time link. Stored: your email, role and theme choice (Supabase, EU). To delete your account, email <a href="mailto:giorgisamo@gmail.com">giorgisamo@gmail.com</a>.</p>';
      setTimeout(function () { var i = body.querySelector("input"); if (i) i.focus(); }, 30);
      return;
    }
    var special = state.role === "samuka" || state.role === "nino";
    body.innerHTML =
      '<p class="acct__kicker">$ current_user.inspect</p>' +
      '<div class="acct__who"><span class="acct__avatar acct__avatar--lg">' + esc(initial()) + "</span><div><h3>" + esc((state.profile && state.profile.display_name) || "friend") + '</h3><p class="muted">' + esc(state.user.email || "") + ' · <span class="acct__badge acct__badge--' + state.role + '">' + esc(ROLE_LABEL[state.role] || state.role) + "</span></p></div></div>" +
      '<fieldset class="acct__themes"><legend>theme</legend>' + themeOptions() + "</fieldset>" +
      '<label class="acct__nick"><span>public nickname <small class="muted">· shown on leaderboards, the wall and live cursors</small></span>' +
        '<input name="nickname" maxlength="24" autocomplete="nickname" placeholder="anonymous dev" value="' + esc(state.profile.nickname || "") + '"></label>' +
      '<label class="acct__toggle"><input type="checkbox" name="glitches"' + (state.profile.glitches ? " checked" : "") + '><span>Occasional glitch easter eggs</span></label>' +
        '<button class="btn acct__preview" type="button" data-acct-glitch>⚡ preview glitch</button>' +
      extras.map(function (fn) { try { return fn(state) || ""; } catch (e) { return ""; } }).join("") +
      '<div class="acct__actions"><button class="btn" type="button" data-acct-out>sign out</button>' + (mockRole ? '<span class="muted">local test session</span>' : "") + "</div>";
  }
  function open(opts) {
    if (!enabled) return false;
    if (!modal) build();
    notice = opts && opts.reason === "arcade" ? "🔒 The arcade is for signed-in visitors. It's free and takes a few seconds." : "";
    renderModal();
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    return true;
  }
  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.documentElement.style.overflow = "";
  }
  async function onSubmit(e) {
    if (!e.target.matches("[data-acct-email]")) return;
    e.preventDefault();
    var input = e.target.querySelector("input"), btn = e.target.querySelector("button");
    var email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { input.classList.add("is-invalid"); input.focus(); return; }
    btn.disabled = true; btn.textContent = "sending…";
    var res = await signInEmail(email);
    btn.disabled = false; btn.textContent = "send magic link";
    var box = modal.querySelector(".acct__notice") || (function () { var p = document.createElement("p"); p.className = "acct__notice"; e.target.before(p); return p; })();
    box.innerHTML = res.error
      ? '<span class="err">✗ ' + esc(res.error.message) + "</span>"
      : '<span class="ok">✉ Check ' + esc(email) + "</span>: the sign-in link works once and expires in an hour.";
  }
  function onChange(e) {
    var S = window.Samuka;
    if (e.target.name === "skin" && S) S.setSkin(e.target.value, { user: true });
    if (e.target.name === "mode" && S) S.setMode(e.target.value, { user: true });
    if (e.target.name === "glitches") savePrefs({ glitches: e.target.checked });
    if (e.target.name === "nickname") {
      var v = e.target.value.trim().replace(/[^A-Za-z0-9 ._\-]/g, "").slice(0, 24);
      e.target.value = v;
      if (v.length === 1) return;
      savePrefs({ nickname: v || null });
    }
  }
  function isSpecial() { return state.role === "samuka" || state.role === "nino"; }
  function onModalClick(e) {
    if (e.target.closest("[data-acct-close]")) return close();
    if (e.target.closest("[data-acct-github]")) return signInGitHub();
    if (e.target.closest("[data-acct-out]")) { signOut(); return close(); }
    if (e.target.closest("[data-acct-glitch]")) {
      close();
      setTimeout(function () {
        if (isSpecial()) { if (window.SamukaGlitch) window.SamukaGlitch.fire(true); }
        else if (window.SamukaTextGlitch) window.SamukaTextGlitch.fire(true);
      }, 250);
    }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-account]");
    if (b) { e.preventDefault(); open(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal && !modal.hidden) { e.stopPropagation(); close(); } }, true);

  /* ---------- public API ---------- */
  window.SamukaAuth = {
    get enabled() { return enabled; },
    user: function () { return state.user; },
    role: function () { return state.role; },
    profile: function () { return state.profile; },
    ready: function () { return state.ready; },
    open: open, close: close, signOut: signOut, savePrefs: savePrefs,
    client: function () { return client; },
    mock: function () { return mockRole; },
    // other modules add sections to the account window: fn(state) -> html
    extend: function (fn) { extras.push(fn); if (modal && !modal.hidden) renderModal(); },
    refresh: function () { if (modal && !modal.hidden) renderModal(); },
    publicName: function () {
      var p = state.profile; if (!state.user) return "guest";
      return (p && p.nickname) || "dev-" + String(state.user.id || "0000").replace(/-/g, "").slice(0, 4);
    }
  };

  /* ---------- boot (after all deferred scripts, so window.Samuka exists) ---------- */
  function boot() {
    applyRole(root.dataset.role || "guest"); // cached role until verified
    if (mockRole === "guest") { onSession(null); return; }
    if (mockRole) { onSession({ user: { id: "local-" + mockRole, email: mockRole + "@localhost" } }); return; }
    if (!enabled) { applyRole("guest"); state.ready = true; emit(); return; }
    // implicit flow: the email link works in any browser/device, not only the one that asked for it
    // which sign-in methods are switched on in Supabase (public endpoint)
    fetch(cfg.url.replace(/\/$/, "") + "/auth/v1/settings", { headers: { apikey: cfg.anon_key } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s && s.external) { providers.github = !!s.external.github; if (modal && !modal.hidden && !state.user) renderModal(); } })
      .catch(function () {});
    client = window.supabase.createClient(cfg.url, cfg.anon_key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
    client.auth.getSession().then(function (r) {
      onSession(r.data && r.data.session).then(function () {
        // a used / expired email link comes back as #error_description=...: explain it instead of failing silently
        var h = new URLSearchParams(location.hash.replace(/^#/, ""));
        var err = h.get("error_description");
        if (err && !state.user) {
          history.replaceState(null, "", location.pathname + location.search);
          open();
          var body = modal.querySelector("[data-acct-body] form");
          if (body) {
            var p = document.createElement("p");
            p.className = "acct__notice";
            p.innerHTML = '<span class="err">✗ ' + esc(err) + "</span>. Links work once and expire after an hour, so send yourself a fresh one.";
            body.before(p);
          }
        }
      });
    });
    client.auth.onAuthStateChange(function (event, session) {
      if (event === "INITIAL_SESSION") return;
      // run outside the auth callback (supabase-js recommends not awaiting inside it)
      setTimeout(function () { onSession(session); }, 0);
    });
  }
  // Deferred scripts run while readyState is already "interactive", but DOMContentLoaded only fires
  // after ALL of them (app.js, glitch.js, ...) have run, so wait for it; "load" is a fallback.
  var booted = false;
  function bootOnce() { if (!booted) { booted = true; boot(); } }
  if (document.readyState === "complete") bootOnce();
  else { document.addEventListener("DOMContentLoaded", bootOnce); window.addEventListener("load", bootOnce); }
})();
