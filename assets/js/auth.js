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
  var C = window.SamukaAccountCore;   // markup + rules for the account window (account-core.js)
  var esc = C.esc;

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
  var saveTimer = 0, modal = null, notice = "", extras = [], tab = "profile";

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
  function displayName() { return (state.profile && state.profile.display_name) || (state.user && state.user.email) || ""; }
  function initial() { return C.initial(displayName()); }
  window.addEventListener("samuka:page", function () { paintButtons(); });
  function paintButtons() {
    document.querySelectorAll("[data-account]").forEach(function (b) {
      if (!enabled) { b.hidden = true; return; }
      b.hidden = false;
      b.classList.toggle("is-in", !!state.user);
      b.innerHTML = state.user
        ? '<span class="acct__avatar">' + esc(initial()) + '</span><span class="acct__role">' + esc(state.role) + "</span>"
        : '<span class="acct__in">sign in</span>';
      b.setAttribute("aria-label", state.user ? "Your account menu (" + state.role + ")" : "Sign in");
      if (state.user) b.setAttribute("aria-haspopup", "menu"); else { b.removeAttribute("aria-haspopup"); b.removeAttribute("aria-expanded"); }
    });
    // arcade: locked for guests when accounts are on
    var locked = enabled && !state.user;
    document.querySelectorAll("[data-play]").forEach(function (b) {
      b.classList.toggle("is-locked", locked);
      if (!b.hasAttribute("data-label")) b.setAttribute("data-label", b.innerHTML);   // keep each button's own text
      var lab = b.getAttribute("data-label");
      b.innerHTML = locked ? lab.replace(/<span class="btn__prompt">▶<\/span>|▶/, '<span class="btn__prompt">🔒</span>') : lab;
      b.title = locked ? "Sign in to play (free, a few seconds)" : "";
    });
  }

  /* ---------- account window (tabs: profile · appearance · settings · badges · team) ---------- */
  var lastFocus = null;
  function build() {
    modal = document.createElement("div");
    modal.className = "acct";
    modal.hidden = true;
    modal.innerHTML = '<div class="acct__backdrop" data-acct-close></div><div class="acct__win" role="dialog" aria-modal="true" aria-labelledby="acct-title">' +
      '<div class="acct__bar"><span class="dots"><i data-acct-close></i><i></i><i></i></span><span class="acct__title" id="acct-title">Your account</span><button class="acct__x" type="button" data-acct-close aria-label="Close">esc</button></div>' +
      '<div class="acct__body" data-acct-body></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", onModalClick);
    modal.addEventListener("submit", onSubmit);
    modal.addEventListener("change", onChange);
    modal.addEventListener("keydown", onTabKey);
  }
  function setTitle(text, file) {
    modal.querySelector(".acct__title").innerHTML = esc(text) + (file ? ' <small class="acct__file">' + esc(file) + "</small>" : "");
  }
  function appearance() {
    var S = window.Samuka; if (!S) return "";
    var skins = S.availableSkins();
    return C.appearanceHtml({ mode: S.mode(), skin: S.skin(), skins: skins, secretLeft: skins.indexOf("crt") < 0 });
  }
  function panels(extra) {
    var A = window.SamukaAch, p = state.profile || {};
    var core = {
      profile: C.profileHtml({
        name: displayName() || "friend", publicName: window.SamukaAuth.publicName(), email: state.user.email, role: state.role,
        nickname: p.nickname, ach: A ? C.achCount(A.list, A.has) : { n: 0, total: 0 }, card: undefined
      }),
      appearance: appearance(),
      settings: C.settingsHtml({ glitches: !!p.glitches })
    };
    var out = {};
    C.TABS.forEach(function (t) { out[t.key] = (core[t.key] || "") + (extra[t.key] || ""); });
    return out;
  }
  function renderModal() {
    var body = modal.querySelector("[data-acct-body]");
    if (!state.user) {
      setTitle("Sign in", "app/controllers/sessions_controller.rb");
      body.innerHTML = C.guestHtml({ notice: notice, github: providers.github });
      setTimeout(function () { var i = body.querySelector("input"); if (i) i.focus(); }, 30);
      return;
    }
    var extra = C.collectExtras(extras, state), visible = C.visibleTabs(extra);
    tab = C.pickTab(tab, visible);
    var t = C.tabOf(tab);
    setTitle("Your account · " + t.label, "app/me/" + t.file);
    body.innerHTML = C.tabsHtml(visible, tab) +
      '<div class="acct__panel" role="tabpanel" id="acct-panel" aria-labelledby="acct-tab-' + tab + '" tabindex="0">' + panels(extra)[tab] + "</div>" +
      C.footerHtml({ mock: !!mockRole });
    if (tab === "profile" && window.SamukaMe) window.SamukaMe.fillStats(body);
  }
  function showTab(key, focus) {
    tab = key;
    renderModal();
    if (focus) { var b = modal.querySelector('[data-acct-tab="' + tab + '"]'); if (b) b.focus(); }
  }
  function onTabKey(e) {
    var cur = e.target.closest && e.target.closest("[data-acct-tab]"); if (!cur) return;
    var list = Array.prototype.slice.call(modal.querySelectorAll("[data-acct-tab]"));
    var i = C.nextIndex(list.indexOf(cur), list.length, e.key, true);
    if (i > -1) { e.preventDefault(); showTab(list[i].getAttribute("data-acct-tab"), true); }
  }
  // opts: { tab: "profile"|"appearance"|"settings"|"badges"|"team", reason: "arcade" }
  function open(opts) {
    opts = opts || {};
    if (!enabled) return false;
    if (!modal) build();
    var wasOpen = !modal.hidden;
    if (!wasOpen) lastFocus = document.activeElement;
    notice = opts.reason === "arcade" ? "🔒 The arcade is for signed-in visitors. It's free and takes a few seconds." : "";
    tab = opts.tab || (wasOpen ? tab : "profile");
    renderModal();
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    if (state.user) { var b = modal.querySelector('[data-acct-tab="' + tab + '"]'); if (b) b.focus({ preventScroll: true }); }
    return true;
  }
  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
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
      var v = C.cleanNickname(e.target.value);
      e.target.value = v;
      if (v.length === 1) return;
      savePrefs({ nickname: v || null });
    }
  }
  function isSpecial() { return C.isTeam(state.role); }
  function onModalClick(e) {
    if (e.target.closest("[data-acct-close]")) return close();
    var t = e.target.closest("[data-acct-tab]");
    if (t) return showTab(t.getAttribute("data-acct-tab"), true);
    if (e.target.closest("[data-acct-github]")) return signInGitHub();
    if (e.target.closest("[data-acct-out]")) { signOut(); return close(); }
    if (e.target.closest("a[href]:not([href^='mailto:'])")) return close();   // nav.js follows the link
    if (e.target.closest("[data-acct-glitch]")) {
      close();
      setTimeout(function () {
        if (isSpecial()) { if (window.SamukaGlitch) window.SamukaGlitch.fire(true); }
        else if (window.SamukaTextGlitch) window.SamukaTextGlitch.fire(true);
      }, 250);
    }
  }
  // the avatar button: signed in → quick menu (me.js), signed out → sign-in window
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-account]");
    if (!b) return;
    e.preventDefault();
    if (state.user && window.SamukaMe) window.SamukaMe.menu.toggle(b); else open();
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
    // other modules add sections to the account window: fn(state) -> html, shown on opts.tab
    // ("settings" by default; "badges" and "team" tabs only appear once something fills them)
    extend: function (fn, opts) { extras.push({ fn: fn, tab: (opts && opts.tab) || "settings" }); if (modal && !modal.hidden) renderModal(); },
    tab: function () { return tab; },
    isOpen: function () { return !!(modal && !modal.hidden); },
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
