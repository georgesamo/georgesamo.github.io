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
  var saveTimer = 0, modal = null, notice = "";

  /* ---------- state ---------- */
  function applyRole(role) {
    state.role = role;
    root.dataset.role = role;
    root.dataset.auth = enabled ? "on" : "off";
    store.set("samuka-role", role === "guest" ? null : role);
  }
  function applyTheme() {
    var S = window.Samuka; if (!S) return;
    var wanted = state.profile && state.profile.theme && state.profile.theme !== "auto" ? state.profile.theme : store.get("samuka-theme");
    if (wanted) S.setTheme(S.canUseTheme(wanted) ? wanted : "dark", { persist: true });
    else S.setTheme(S.theme(), { persist: false });
  }
  function emit() {
    window.dispatchEvent(new CustomEvent("samuka:auth", { detail: { user: state.user, role: state.role, profile: state.profile } }));
    paintButtons();
    if (modal && !modal.hidden) renderModal();
  }
  async function loadProfile() {
    if (mockRole) {
      state.profile = { role: mockRole, theme: store.sget("samuka-mock-theme") || "auto", glitches: store.sget("samuka-mock-glitch") !== "off", display_name: mockRole };
      return;
    }
    var res = await client.from("profiles").select("role, theme, glitches, display_name").eq("id", state.user.id).single();
    if (res.error) {
      console.warn("[auth] profile not found yet, using defaults", res.error.message);
      state.profile = { role: "user", theme: "auto", glitches: true, display_name: (state.user.email || "").split("@")[0] };
    } else state.profile = res.data;
  }
  async function onSession(session) {
    state.user = session ? session.user : null;
    if (state.user) await loadProfile(); else state.profile = null;
    applyRole(state.user ? (state.profile && state.profile.role) || "user" : "guest");
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
      emit(); return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      var res = await client.from("profiles").update(patch).eq("id", state.user.id);
      if (res.error) console.warn("[auth] could not save preferences", res.error.message);
    }, 400);
    emit();
  }
  window.addEventListener("samuka:theme", function (e) {
    if (e.detail && e.detail.user && state.user) savePrefs({ theme: e.detail.theme });
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
      b.innerHTML = locked ? '<span class="btn__prompt">🔒</span> sign in to play' : '<span class="btn__prompt">▶</span> play';
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
    var names = { dark: "Phthalo dark", light: "Phthalo light", knight: "Dark Knight", golden: "Golden" };
    var notes = { knight: "samuka only · noir black & gold", golden: "nino only · purple & gold" };
    var current = S.theme();
    return S.availableThemes().map(function (t) {
      return '<label class="acct__theme acct__theme--' + t + (t === current ? " is-on" : "") + '"><input type="radio" name="theme" value="' + t + '"' + (t === current ? " checked" : "") + '>' +
        '<span class="acct__swatch" aria-hidden="true"></span><span><b>' + names[t] + "</b>" + (notes[t] ? '<small>' + notes[t] + "</small>" : "") + "</span></label>";
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
        (cfg.github ? '<button class="btn acct__gh" type="button" data-acct-github>Sign in with GitHub</button>' : "") +
        '<p class="acct__fine">No password needed: we email you a one-time link. Stored: your email, role and theme choice (Supabase, EU). To delete your account, email <a href="mailto:giorgisamo@gmail.com">giorgisamo@gmail.com</a>.</p>';
      setTimeout(function () { var i = body.querySelector("input"); if (i) i.focus(); }, 30);
      return;
    }
    var special = state.role === "samuka" || state.role === "nino";
    body.innerHTML =
      '<p class="acct__kicker">$ current_user.inspect</p>' +
      '<div class="acct__who"><span class="acct__avatar acct__avatar--lg">' + esc(initial()) + "</span><div><h3>" + esc((state.profile && state.profile.display_name) || "friend") + '</h3><p class="muted">' + esc(state.user.email || "") + ' · <span class="acct__badge acct__badge--' + state.role + '">' + esc(ROLE_LABEL[state.role] || state.role) + "</span></p></div></div>" +
      '<fieldset class="acct__themes"><legend>theme</legend>' + themeOptions() + "</fieldset>" +
      (special ? '<label class="acct__toggle"><input type="checkbox" name="glitches"' + (state.profile.glitches ? " checked" : "") + '><span>Occasional glitch easter eggs</span></label>' +
        '<button class="btn acct__preview" type="button" data-acct-glitch>⚡ preview glitch</button>' : "") +
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
    if (e.target.name === "theme" && S) { S.setTheme(e.target.value, { user: true }); renderModal(); }
    if (e.target.name === "glitches") savePrefs({ glitches: e.target.checked });
  }
  function onModalClick(e) {
    if (e.target.closest("[data-acct-close]")) return close();
    if (e.target.closest("[data-acct-github]")) return signInGitHub();
    if (e.target.closest("[data-acct-out]")) { signOut(); return close(); }
    if (e.target.closest("[data-acct-glitch]")) { close(); setTimeout(function () { window.SamukaGlitch && window.SamukaGlitch.fire(true); }, 250); }
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
    open: open, close: close, signOut: signOut, savePrefs: savePrefs
  };

  /* ---------- boot (after all deferred scripts, so window.Samuka exists) ---------- */
  function boot() {
    applyRole(root.dataset.role || "guest"); // cached role until verified
    if (mockRole === "guest") { onSession(null); return; }
    if (mockRole) { onSession({ user: { id: "local-" + mockRole, email: mockRole + "@localhost" } }); return; }
    if (!enabled) { applyRole("guest"); state.ready = true; emit(); return; }
    // implicit flow: the email link works in any browser/device, not only the one that asked for it
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
