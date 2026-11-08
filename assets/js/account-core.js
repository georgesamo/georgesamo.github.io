/* Samuka · account core: pure helpers and HTML builders for everything "me"
 * (account window tabs, avatar menu, sidebar folder, phone sheet, stats strip).
 * No DOM access and no globals, so it is unit-tested directly (tests/).
 * Loaded before auth.js; also works as a CommonJS module.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SamukaAccountCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }

  var ROLE_LABEL = { guest: "guest", user: "user", samuka: "samuka · owner", nino: "nino · PM" };
  var GAMES = { gems: "Gem Match", sidekiq: "Sidekiq Rush", schema: "Schema Stack", pitwall: "Pit Wall" };
  var RANKS_HREF = "/leaderboards/#me";

  /* tabs of the account window; core tabs always show, the rest only when a module fills them */
  var TABS = [
    { key: "profile", label: "Profile", icon: "👤", file: "current_user.rb", core: true },
    { key: "appearance", label: "Appearance", icon: "🎨", file: "theme.yml", core: true },
    { key: "settings", label: "Settings", icon: "⚙", file: "settings.yml", core: true },
    { key: "badges", label: "Badges", icon: "🎖", file: "achievements.log" },
    { key: "team", label: "Team", icon: "🛠", file: "team.rb" }
  ];
  var TAB_KEYS = TABS.map(function (t) { return t.key; });
  var DEFAULT_TAB = "profile", EXTRA_TAB = "settings";

  var SKIN_NAMES = { phthalo: "Phthalo", knight: "Dark Knight", golden: "Golden", crt: "CRT" };
  var SKIN_NOTES = { phthalo: "green & gold · everyone", knight: "samuka only · black & crimson", golden: "nino only · purple & gold", crt: "secret · phosphor terminal" };

  /* ---------- small rules ---------- */
  function isTeam(role) { return role === "samuka" || role === "nino"; }
  function roleLabel(role) { return ROLE_LABEL[role] || String(role || "guest"); }
  function initial(name) { var s = String(name || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function cardHref(name) { return "/u/?n=" + encodeURIComponent(name || ""); }
  function isMyCard(path, search, name) {
    if (!name || !/^\/u\/?$/.test(path || "")) return false;
    var n = new URLSearchParams(search || "").get("n");
    return n == null || n === "" || n === name;   // bare /u/ redirects to your own card
  }
  // the same rule the database enforces: letters, digits, space . _ -, at most 24
  function cleanNickname(v) { return String(v == null ? "" : v).trim().replace(/[^A-Za-z0-9 ._\-]/g, "").slice(0, 24); }
  function achCount(list, has) {
    list = list || [];
    var n = typeof has === "function" ? list.filter(function (a) { return has(a.key); }).length : 0;
    return { n: n, total: list.length };
  }
  function bestGame(best) {
    var top = null;
    Object.keys(GAMES).forEach(function (k) {
      var s = Number((best || {})[k] || 0);
      if (s > 0 && (!top || s > top.score)) top = { key: k, label: GAMES[k], score: s };
    });
    return top;
  }
  // roving focus for menus (vertical) and tab lists (horizontal); -1 = key not handled
  function nextIndex(i, len, key, horizontal) {
    if (!len) return -1;
    var fwd = horizontal ? "ArrowRight" : "ArrowDown", back = horizontal ? "ArrowLeft" : "ArrowUp";
    if (key === fwd) return (i + 1 + len) % len;
    if (key === back) return (i - 1 + len) % len;
    if (key === "Home") return 0;
    if (key === "End") return len - 1;
    return -1;
  }

  /* ---------- account window: tabs ---------- */
  function tabOf(key) { return TABS.filter(function (t) { return t.key === key; })[0] || null; }
  // extras: [{ fn: state -> html, tab }] registered by other modules through SamukaAuth.extend
  function collectExtras(extras, state) {
    var out = {};
    (extras || []).forEach(function (x) {
      var html = "";
      try { html = x.fn(state) || ""; } catch (e) { html = ""; }
      if (!html) return;
      var key = TAB_KEYS.indexOf(x.tab) > -1 ? x.tab : EXTRA_TAB;
      out[key] = (out[key] || "") + html;
    });
    return out;
  }
  function visibleTabs(extraByTab) {
    extraByTab = extraByTab || {};
    return TABS.filter(function (t) { return t.core || !!extraByTab[t.key]; });
  }
  function pickTab(wanted, visible) {
    return (visible || []).some(function (t) { return t.key === wanted; }) ? wanted : DEFAULT_TAB;
  }
  function tabsHtml(visible, active) {
    return '<div class="acct__tabs" role="tablist" aria-label="Account sections">' + visible.map(function (t) {
      var on = t.key === active;
      return '<button type="button" role="tab" class="acct__tab' + (on ? " is-on" : "") + '" id="acct-tab-' + t.key + '" data-acct-tab="' + t.key + '" aria-selected="' + on + '" aria-controls="acct-panel" tabindex="' + (on ? 0 : -1) + '">' +
        '<span aria-hidden="true">' + t.icon + "</span>" + t.label + "</button>";
    }).join("") + "</div>";
  }

  /* ---------- account window: panels ---------- */
  // c: { ach: {n,total}, card: undefined (loading) | null (none) | { games, best } }
  function statsHtml(c) {
    var ach = c.ach || { n: 0, total: 0 }, card = c.card, top = card ? bestGame(card.best) : null;
    var games = card === undefined ? "…" : card ? fmt(card.games) : "0";
    var best = card === undefined ? "…" : top ? fmt(top.score) : "–";
    return '<div class="acct__stats" data-me-stats>' +
      '<button type="button" class="acct__stat" data-me-act="badges"><b>' + ach.n + "/" + ach.total + "</b><span>badges</span></button>" +
      '<a class="acct__stat" href="' + esc(c.cardHref || "/u/") + '"><b>' + games + "</b><span>games played</span></a>" +
      '<a class="acct__stat" href="' + RANKS_HREF + '"><b>' + best + "</b><span>" + (top ? "best · " + esc(top.label) : card === undefined ? "best score" : "no scores yet") + "</span></a>" +
      "</div>";
  }
  // c: { name, publicName, email, role, nickname, ach, card }
  function profileHtml(c) {
    var href = cardHref(c.publicName);
    return '<div class="acct__who"><span class="acct__avatar acct__avatar--lg">' + esc(initial(c.name)) + "</span><div><h3>" + esc(c.name || "friend") + "</h3>" +
        '<p class="muted">' + esc(c.email || "") + ' · <span class="acct__badge acct__badge--' + esc(c.role) + '">' + esc(roleLabel(c.role)) + "</span></p></div></div>" +
      statsHtml({ ach: c.ach, card: c.card, cardHref: href }) +
      '<div class="acct__quick">' +
        '<a class="btn btn--primary" href="' + esc(href) + '">🪪 view my card</a>' +
        '<button class="btn" type="button" data-me-act="copy">⧉ copy card link</button>' +
        '<a class="btn" href="' + RANKS_HREF + '">🏆 my ranks</a>' +
      "</div>" +
      '<label class="acct__nick"><span>public nickname <small class="muted">· shown on leaderboards, the wall, live cursors and your card</small></span>' +
        '<input name="nickname" maxlength="24" autocomplete="nickname" placeholder="anonymous dev" value="' + esc(c.nickname || "") + '"></label>';
  }
  // c: { mode, skin, skins: [keys], secretLeft: bool }
  function appearanceHtml(c) {
    var modes = '<div class="acct__modes" role="radiogroup" aria-label="mode">' + ["dark", "light"].map(function (m) {
      var on = m === c.mode;
      return '<label class="acct__mode' + (on ? " is-on" : "") + '"><input type="radio" name="mode" value="' + m + '"' + (on ? " checked" : "") + "><span>" + (m === "dark" ? "☾ dark" : "☀ light") + "</span></label>";
    }).join("") + "</div>";
    var skins = (c.skins || []).map(function (t) {
      var on = t === c.skin;
      return '<label class="acct__theme acct__theme--' + esc(t) + (on ? " is-on" : "") + '"><input type="radio" name="skin" value="' + esc(t) + '"' + (on ? " checked" : "") + ">" +
        '<span class="acct__swatch" aria-hidden="true"><i></i><i></i></span><span><b>' + esc(SKIN_NAMES[t] || t) + "</b><small>" + esc(SKIN_NOTES[t] || "") + "</small></span></label>";
    }).join("");
    return '<fieldset class="acct__themes"><legend>mode <small class="muted">· this device</small></legend>' + modes + "</fieldset>" +
      '<fieldset class="acct__themes"><legend>skin <small class="muted">· saved to your account</small></legend>' + skins + "</fieldset>" +
      (c.secretLeft ? '<p class="acct__hint">🕹 One more skin is hidden somewhere on this site. Old gamers know the way.</p>' : "");
  }
  function settingsHtml(c) {
    return '<label class="acct__toggle"><input type="checkbox" name="glitches"' + (c.glitches ? " checked" : "") + "><span>Occasional glitch easter eggs</span></label>" +
      '<button class="btn acct__preview" type="button" data-acct-glitch>⚡ preview glitch</button>';
  }
  function footerHtml(c) {
    return '<div class="acct__actions"><button class="btn" type="button" data-acct-out>sign out</button>' + (c && c.mock ? '<span class="muted">local test session</span>' : "") + "</div>";
  }

  var GITHUB_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  var PERKS = [
    ["🕹", "Play the arcade", "four games, daily and weekly challenges"],
    ["🏆", "Get on the leaderboards", "your scores are saved across devices"],
    ["🪪", "Your own player card", "best scores and badges, shareable"],
    ["🎖", "Collect achievements", "a few of them are secret"],
    ["🎨", "Keep your skin", "theme choices follow you everywhere"]
  ];
  // c: { notice (trusted html), github: bool }
  function guestHtml(c) {
    return '<p class="acct__kicker">$ bin/rails devise:sessions:new</p>' +
      "<h3>Sign in</h3>" +
      "<p>Totally optional, free, and no password. Signing in gets you:</p>" +
      '<ul class="acct__perks">' + PERKS.map(function (p) { return '<li><span aria-hidden="true">' + p[0] + "</span><b>" + p[1] + "</b><small>" + p[2] + "</small></li>"; }).join("") + "</ul>" +
      (c.notice ? '<p class="acct__notice">' + c.notice + "</p>" : "") +
      '<form class="acct__form" data-acct-email novalidate><label for="acct-email">email</label>' +
      '<div class="acct__row"><input id="acct-email" type="email" name="email" autocomplete="email" required placeholder="you@company.com">' +
      '<button class="btn btn--primary" type="submit">send magic link</button></div></form>' +
      (c.github ? '<div class="acct__or"><span>or</span></div><button class="btn acct__gh" type="button" data-acct-github>' + GITHUB_SVG + " Sign in with GitHub</button>" : "") +
      '<p class="acct__fine">No password needed: we email you a one-time link. Stored: your email, role and theme choice (Supabase, EU). To delete your account, email <a href="mailto:giorgisamo@gmail.com">giorgisamo@gmail.com</a>.</p>';
  }

  /* ---------- avatar menu ---------- */
  // c: { name, role, ach: {n,total} }
  function menuItems(c) {
    var items = [
      { key: "card", icon: "🪪", label: "My player card", hint: "scores & badges", href: cardHref(c.name) },
      { key: "ranks", icon: "🏆", label: "My ranks", hint: "leaderboards", href: RANKS_HREF },
      { key: "badges", icon: "🎖", label: "Achievements", hint: (c.ach ? c.ach.n + "/" + c.ach.total : ""), act: "badges" },
      { key: "appearance", icon: "🎨", label: "Appearance", hint: "mode & skin", act: "appearance" },
      { key: "profile", icon: "⚙", label: "Account & settings", hint: "nickname, toggles", act: "profile" }
    ];
    if (isTeam(c.role)) items.push({ key: "board", icon: "📋", label: "Our board", hint: "team", act: "board", group: "team" });
    if (c.role === "samuka") items.push({ key: "admin", icon: "🛠", label: "Admin", hint: "owner", act: "admin", group: "team" });
    items.push({ key: "signout", icon: "⎋", label: "Sign out", act: "signout", group: "end" });
    return items;
  }
  function menuHtml(c) {
    var last = null;
    return '<div class="me-menu__head"><span class="acct__avatar acct__avatar--md">' + esc(initial(c.name)) + '</span><span><b>' + esc(c.name) + '</b><small>' + esc(roleLabel(c.role)) + "</small></span></div>" +
      menuItems(c).map(function (it) {
        var sep = it.group && it.group !== last ? '<hr class="me-menu__sep" role="separator">' : "";
        last = it.group || last;
        var inner = '<span class="me-menu__icon" aria-hidden="true">' + it.icon + "</span><span>" + esc(it.label) + "</span>" + (it.hint ? "<small>" + esc(it.hint) + "</small>" : "");
        return sep + (it.href
          ? '<a class="me-menu__item" role="menuitem" tabindex="-1" data-me-item="' + it.key + '" href="' + esc(it.href) + '">' + inner + "</a>"
          : '<button class="me-menu__item" role="menuitem" tabindex="-1" type="button" data-me-item="' + it.key + '" data-me-act="' + it.act + '">' + inner + "</button>");
      }).join("");
  }

  /* ---------- sidebar "me" folder and phone sheet header ---------- */
  // c: { enabled, signedIn, name, ach, here: "card"|"" }
  function treeHtml(c) {
    if (!c.enabled) return "";
    if (!c.signedIn) {
      return '<p class="tree__dir">▾ me</p>' +
        '<button type="button" class="tree__item" data-me-act="signin"><i class="fi fi--rb"></i>sign_in.rb<small>save scores</small></button>';
    }
    var a = c.ach || { n: 0, total: 0 };
    return '<p class="tree__dir">▾ me <span class="tree__me-name">' + esc(c.name) + "</span></p>" +
      '<a class="tree__item' + (c.here === "card" ? " is-here" : "") + '" href="' + esc(cardHref(c.name)) + '"><i class="fi fi--rb"></i>player_card.rb</a>' +
      '<a class="tree__item" href="' + RANKS_HREF + '"><i class="fi fi--yml"></i>my_ranks.yml</a>' +
      '<button type="button" class="tree__item" data-me-act="badges"><i class="fi fi--log"></i>achievements.log<small>' + a.n + "/" + a.total + "</small></button>" +
      '<button type="button" class="tree__item" data-me-act="profile"><i class="fi fi--rb"></i>settings.rb</button>';
  }
  function sheetHtml(c) {
    if (!c.enabled) return "";
    if (!c.signedIn) return '<button type="button" class="msheet__signin" data-me-act="signin">🔑 sign in <small>save scores · get a player card</small></button>';
    var a = c.ach || { n: 0, total: 0 };
    return '<div class="msheet__who"><span class="acct__avatar acct__avatar--md">' + esc(initial(c.name)) + "</span><span><b>" + esc(c.name) + "</b><small>" + esc(roleLabel(c.role)) + " · " + a.n + "/" + a.total + " badges</small></span></div>" +
      '<div class="msheet__quick">' +
        '<a href="' + esc(cardHref(c.name)) + '">🪪<span>my card</span></a>' +
        '<a href="' + RANKS_HREF + '">🏆<span>ranks</span></a>' +
        '<button type="button" data-me-act="badges">🎖<span>badges</span></button>' +
        '<button type="button" data-me-act="profile">⚙<span>settings</span></button>' +
      "</div>";
  }

  return {
    esc: esc, fmt: fmt, ROLE_LABEL: ROLE_LABEL, GAMES: GAMES, TABS: TABS, RANKS_HREF: RANKS_HREF,
    isTeam: isTeam, roleLabel: roleLabel, initial: initial, cardHref: cardHref, isMyCard: isMyCard,
    cleanNickname: cleanNickname, achCount: achCount, bestGame: bestGame, nextIndex: nextIndex,
    tabOf: tabOf, collectExtras: collectExtras, visibleTabs: visibleTabs, pickTab: pickTab, tabsHtml: tabsHtml,
    statsHtml: statsHtml, profileHtml: profileHtml, appearanceHtml: appearanceHtml, settingsHtml: settingsHtml, footerHtml: footerHtml, guestHtml: guestHtml,
    menuItems: menuItems, menuHtml: menuHtml, treeHtml: treeHtml, sheetHtml: sheetHtml
  };
});
