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
  // sidebar folders: "a b" + toggle "b" → "a"; toggle "c" → "a b c" (space-separated, no blanks)
  function toggleFolder(closed, key) {
    var list = String(closed || "").split(/\s+/).filter(Boolean);
    if (!key) return list.join(" ");
    var i = list.indexOf(key);
    if (i > -1) list.splice(i, 1); else list.push(key);
    return list.join(" ");
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

  /* ---------- ranks, streaks, recent games (from player_card(), supabase/me.sql) ---------- */
  // ranks: { game: { rank, of, behind } } → your best placing (lowest rank, then smallest gap)
  function topRank(ranks) {
    var top = null;
    Object.keys(ranks || {}).forEach(function (k) {
      var r = ranks[k] || {}, rank = Number(r.rank);
      if (!GAMES[k] || !(rank > 0)) return;
      var cand = { key: k, label: GAMES[k], rank: rank, of: Number(r.of) || rank, behind: Number(r.behind) || 0 };
      if (!top || cand.rank < top.rank || (cand.rank === top.rank && cand.behind < top.behind)) top = cand;
    });
    return top;
  }
  function rankLine(r) {
    if (!r) return "";
    return "#" + r.rank + " of " + r.of + (r.rank === 1 ? " · leading" : r.behind > 0 ? " · " + fmt(r.behind) + " pts behind #" + (r.rank - 1) : " · tied");
  }
  function streakOf(card) {
    var s = card && card.streak;
    return s ? { current: Number(s.current) || 0, best: Number(s.best) || 0 } : null;
  }
  function ago(t, now) {
    var s = Math.max(0, Math.round(((now || Date.now()) - new Date(t).getTime()) / 1000));
    if (!isFinite(s)) return "";
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  /* ---------- account window: panels ---------- */
  // c: { ach: {n,total}, card: undefined (loading) | null (none) | { games, best, ranks?, streak? } }
  function statsHtml(c) {
    var ach = c.ach || { n: 0, total: 0 }, card = c.card, loading = card === undefined;
    var top = card ? bestGame(card.best) : null, place = card ? topRank(card.ranks) : null, streak = streakOf(card);
    var third = loading ? ["…", "best rank"]
      : place ? ["#" + place.rank, "of " + place.of + " · " + esc(place.label)]
      : top ? [fmt(top.score), "best · " + esc(top.label)]
      : ["–", "no scores yet"];
    return '<div class="acct__stats" data-me-stats>' +
      '<button type="button" class="acct__stat" data-me-act="badges"><b>' + ach.n + "/" + ach.total + "</b><span>badges</span></button>" +
      '<a class="acct__stat" href="' + esc(c.cardHref || "/u/") + '"><b>' + (loading ? "…" : card ? fmt(card.games) : "0") + "</b><span>games played</span></a>" +
      '<a class="acct__stat" href="' + RANKS_HREF + '"' + (place ? ' title="' + esc(rankLine(place)) + '"' : "") + "><b>" + third[0] + "</b><span>" + third[1] + "</span></a>" +
      (streak ? '<button type="button" class="acct__stat" data-daily><b>' + (streak.current ? "🔥 " : "") + streak.current + "</b><span>day streak · best " + streak.best + "</span></button>" : "") +
      "</div>";
  }
  // the extra sections of a public player card
  function cardExtrasHtml(card, now) {
    if (!card) return "";
    var ranks = card.ranks || {}, streak = streakOf(card), recent = card.recent || [];
    var rows = Object.keys(GAMES).filter(function (k) { return ranks[k]; }).map(function (k) {
      var r = ranks[k];
      return '<li><span>' + esc(GAMES[k]) + "</span><b>" + esc(rankLine({ rank: Number(r.rank), of: Number(r.of), behind: Number(r.behind) || 0 })) + "</b></li>";
    });
    return (rows.length ? '<section class="pcard-more"><h3>ranks <small>all-time</small></h3><ul class="pcard-ranks">' + rows.join("") + "</ul></section>" : "") +
      (streak ? '<section class="pcard-more"><h3>daily streak</h3><p class="pcard-streak"><b>' + (streak.current ? "🔥 " : "") + streak.current + "</b> day" + (streak.current === 1 ? "" : "s") + ' now · best <b>' + streak.best + "</b></p></section>" : "") +
      (recent.length ? '<section class="pcard-more"><h3>recent games</h3><ol class="pcard-recent">' + recent.map(function (g) {
        return "<li><span>" + esc(GAMES[g.game] || g.game) + (g.mode && g.mode !== "free" ? ' <small class="muted">' + esc(g.mode) + "</small>" : "") + "</span><b>" + fmt(g.score) + '</b><time datetime="' + esc(g.at) + '">' + esc(ago(g.at, now)) + "</time></li>";
      }).join("") + "</ol></section>" : "");
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
  // "your data" section, appended after every other settings section; c: { owner }
  function dataHtml(c) {
    return '<section class="acct__data"><h4>your data</h4>' +
      "<p>Download everything stored about you as a JSON file" + (c.owner ? "." : ", or delete your account and all of it for good.") + "</p>" +
      '<div class="acct__quick"><button class="btn" type="button" data-me-act="export">⬇ download my data</button>' +
      (c.owner ? '<span class="muted">the owner account can\'t be deleted here</span>' : '<button class="btn btn--danger" type="button" data-me-act="delete">delete account…</button>') +
      "</div><div data-me-danger></div></section>";
  }
  // typed confirmation, so a stray click can never delete an account
  function deleteConfirmHtml(name) {
    return '<form class="acct__confirm" data-me-delete novalidate>' +
      "<p><b>This can't be undone.</b> Your scores, badges, card, wall and chat posts are deleted. Type <code>" + esc(name) + "</code> to confirm.</p>" +
      '<div class="acct__row"><input name="confirm" autocomplete="off" spellcheck="false" aria-label="Type your name to confirm" placeholder="' + esc(name) + '">' +
      '<button class="btn btn--danger" type="submit" disabled>delete for good</button><button class="btn" type="button" data-me-act="delete-cancel">cancel</button></div></form>';
  }
  function confirmMatches(typed, name) { return String(typed || "").trim().toLowerCase() === String(name || "").trim().toLowerCase() && !!String(name || "").trim(); }
  function exportFileName(name, d) {
    var day = (d || new Date()).toISOString().slice(0, 10);
    return "samuka-arcade-" + (String(name || "me").replace(/[^\w.-]+/g, "_") || "me") + "-" + day + ".json";
  }
  function footerHtml(c) {
    return '<div class="acct__actions"><button class="btn" type="button" data-acct-out>sign out</button>' + (c && c.mock ? '<span class="muted">local test session</span>' : "") + "</div>";
  }

  var GITHUB_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  var PERKS = [
    ["💾", "Keep your scores", "guest scores on this device move to your account"],
    ["🏆", "Get on the leaderboards", "plus daily puzzles, streaks and live 1v1 races"],
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
      '<p class="acct__fine">No password needed: we email you a one-time link. Stored: your email, role, theme choice, scores and badges (Supabase, EU). Download or delete all of it any time under Settings.</p>';
  }

  /* ---------- achievement progress ---------- */
  // which locked achievements can show a progress bar, and which number feeds them
  var ACH_PROGRESS = { retry_100: { max: 100, from: "retries" }, gems_4000: { max: 4000, from: "gems" } };
  function achProgress(key, data) {
    var p = ACH_PROGRESS[key]; if (!p) return null;
    var cur = Math.max(0, Math.min(p.max, Number((data || {})[p.from]) || 0));
    return { cur: cur, max: p.max, pct: Math.round(cur / p.max * 100) };
  }
  // the locked, non-secret achievement you are closest to (else the first one left)
  function nextUp(list, has, data) {
    var open = (list || []).filter(function (a) { return !a.secret && !(has && has(a.key)); });
    if (!open.length) return null;
    var best = null;
    open.forEach(function (a) {
      var p = achProgress(a.key, data);
      if (p && p.cur > 0 && (!best || p.pct > best.prog.pct)) best = { ach: a, prog: p };
    });
    return best || { ach: open[0], prog: achProgress(open[0].key, data) };
  }
  function progressBar(p) {
    return '<span class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.max + '" aria-valuenow="' + p.cur + '"><i style="width:' + p.pct + '%"></i></span>';
  }
  function nextUpHtml(n) {
    if (!n) return '<p class="acct__next">🏁 Every visible badge is yours. Only secrets left…</p>';
    return '<p class="acct__next"><small>next up</small><span aria-hidden="true">' + esc(n.ach.icon) + "</span> <b>" + esc(n.ach.title) + "</b> · " + esc(n.ach.how) +
      (n.prog ? " " + progressBar(n.prog) + " <small>" + fmt(n.prog.cur) + " / " + fmt(n.prog.max) + "</small>" : "") + "</p>";
  }

  /* ---------- command palette ("go to…") ---------- */
  // c: { signedIn, enabled, name, role, games: [{id,title}] }
  function paletteItems(c) {
    var items = [
      { label: "Lobby", hint: "home", href: "/", kw: "arcade home start" },
      { label: "Games", hint: "page", href: "/games/", kw: "arcade play" },
      { label: "Leaderboards", hint: "page", href: "/leaderboards/", kw: "scores top ranking" },
      { label: "Events", hint: "weekly challenge", href: "/events/", kw: "week challenge" },
      { label: "Your collection", hint: "bests, badges, music", href: "/me/", kw: "me collection unlocks secrets bonus tracks" },
      { label: "What's new", hint: "site updates", href: "/whats-new/", kw: "changelog updates new release notes" },
      { label: "Guestbook", hint: "visitors wall", href: "/#wall", kw: "guestbook wall commit visitors" },
      { label: "Find a player", hint: "player cards", href: "/u/", kw: "card search user" },
      { label: "Samuka", hint: "the creator · hire me", href: "/samuka/", kw: "about profile resume cv experience hire" },
      { label: "News", hint: "tech & gaming", href: "/news/", kw: "news headlines feed rss tech gaming rails ruby newsletter" },
      { label: "Trailers & reviews", hint: "watch", href: "/watch/", kw: "watch video youtube trailer review games gameplay" },
      { label: "Pull requests", hint: "blog", href: "/blog/", kw: "blog posts articles" },
      { label: "Soundtrack", hint: "15 tracks", href: "/soundtrack/", kw: "music lofi songs" }
    ];
    // arcade titles are file names ("pit-wall.rb"); prefer the friendly name
    (c.games || []).forEach(function (g) { items.push({ label: "Play " + (GAMES[g.id] || g.title), hint: "game", act: "play:" + g.id, kw: "game play " + g.id + " " + g.title }); });
    items.push({ label: "Daily Gem Match", hint: "one try a day", act: "daily", kw: "puzzle today streak" });
    items.push({ label: "1v1 race", hint: "live Sidekiq Rush", act: "race", kw: "versus multiplayer duel" });
    if (c.signedIn) {
      items.push(
        { label: "My player card", hint: "you", href: cardHref(c.name), kw: "me profile badges" },
        { label: "My ranks", hint: "you", href: RANKS_HREF, kw: "me leaderboard position" },
        { label: "Achievements", hint: "you", act: "badges", kw: "badges me" },
        { label: "Appearance", hint: "settings", act: "appearance", kw: "theme skin dark light mode" },
        { label: "Account settings", hint: "settings", act: "profile", kw: "nickname name me" },
        { label: "Download my data", hint: "settings", act: "export", kw: "export json privacy gdpr" }
      );
      if (isTeam(c.role)) items.push({ label: "Our board", hint: "team", act: "board", kw: "kanban tasks" });
      if (c.role === "samuka") items.push({ label: "Admin", hint: "owner", act: "admin", kw: "users moderate" });
      items.push({ label: "Sign out", hint: "account", act: "signout", kw: "logout log out" });
    } else if (c.enabled) items.push({ label: "Sign in", hint: "save scores", act: "signin", kw: "login log in account register" });
    items.push({ label: "Toggle light / dark", hint: "theme", act: "theme", kw: "mode dark light" });
    items.push({ label: "Open terminal", hint: "Ctrl K", act: "terminal", kw: "shell console command" });
    return items;
  }
  function isSubsequence(q, s) { var i = 0; for (var j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++; return i === q.length; }
  function paletteScore(it, q) {
    var label = it.label.toLowerCase(), kw = (it.kw || "").toLowerCase() + " " + (it.hint || "").toLowerCase();
    if (label.indexOf(q) === 0) return 100;
    if (label.split(/\s+/).some(function (w) { return w.indexOf(q) === 0; })) return 80;
    if (label.indexOf(q) > -1) return 60;
    if (kw.split(/\s+/).some(function (w) { return w.indexOf(q) === 0; })) return 40;
    if (isSubsequence(q.replace(/\s+/g, ""), label.replace(/\s+/g, ""))) return 20;
    return 0;
  }
  // best matches first (stable for ties); empty query = everything in order
  function searchPalette(items, query, limit) {
    var q = String(query || "").trim().toLowerCase();
    var scored = (items || []).map(function (it, i) { return { it: it, i: i, s: q ? paletteScore(it, q) : 1 }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    return scored.slice(0, limit || 8).map(function (x) { return x.it; });
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
  // c.streak: current daily streak when known (shown as 🔥 n)
  function menuHtml(c) {
    var last = null;
    return '<div class="me-menu__head"><span class="acct__avatar acct__avatar--md">' + esc(initial(c.name)) + '</span><span><b>' + esc(c.name) + '</b><small>' + esc(roleLabel(c.role)) + (c.streak > 0 ? " · 🔥 " + c.streak : "") + "</small></span></div>" +
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
  // one compact row, always at the top of the sidebar (everything else is in the avatar menu)
  // c: { enabled, ready, signedIn, name, ach, here: "card"|"", cached: {name,n,total}|null }
  // Until the session is known (ready false) it shows the last known you, or a quiet placeholder of
  // the same size, never "sign in", so the row doesn't flicker or jump on every page load.
  function treeHtml(c) {
    if (c.ready === false) {
      var k = c.cached;
      if (k && k.name) {
        return '<a class="tree__who" href="' + esc(cardHref(k.name)) + '" title="Your player card">' +
          '<span class="acct__avatar" aria-hidden="true">' + esc(initial(k.name)) + '</span><span class="tree__who-name">' + esc(k.name) + "</span>" +
          (k.total ? '<small title="badges">' + (Number(k.n) || 0) + "/" + Number(k.total) + "</small>" : "") + "</a>";
      }
      return '<span class="tree__who tree__who--wait" aria-hidden="true"><span class="acct__avatar"></span><span class="tree__who-name">&nbsp;</span></span>';
    }
    if (!c.enabled) return "";
    if (!c.signedIn) {
      return '<button type="button" class="tree__who tree__who--in" data-me-act="signin"><span class="acct__avatar" aria-hidden="true">?</span><span class="tree__who-name">sign in</span><small>save scores</small></button>';
    }
    var a = c.ach || { n: 0, total: 0 };
    return '<a class="tree__who' + (c.here === "card" ? " is-here" : "") + '" href="' + esc(cardHref(c.name)) + '" title="Your player card">' +
      '<span class="acct__avatar" aria-hidden="true">' + esc(initial(c.name)) + '</span><span class="tree__who-name">' + esc(c.name) + "</span>" +
      '<small title="badges">' + a.n + "/" + a.total + "</small></a>";
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
    cleanNickname: cleanNickname, achCount: achCount, bestGame: bestGame, nextIndex: nextIndex, toggleFolder: toggleFolder,
    tabOf: tabOf, collectExtras: collectExtras, visibleTabs: visibleTabs, pickTab: pickTab, tabsHtml: tabsHtml,
    statsHtml: statsHtml, profileHtml: profileHtml, appearanceHtml: appearanceHtml, settingsHtml: settingsHtml, footerHtml: footerHtml, guestHtml: guestHtml,
    dataHtml: dataHtml, deleteConfirmHtml: deleteConfirmHtml, confirmMatches: confirmMatches, exportFileName: exportFileName,
    topRank: topRank, rankLine: rankLine, streakOf: streakOf, ago: ago, cardExtrasHtml: cardExtrasHtml,
    achProgress: achProgress, nextUp: nextUp, progressBar: progressBar, nextUpHtml: nextUpHtml,
    paletteItems: paletteItems, searchPalette: searchPalette,
    menuItems: menuItems, menuHtml: menuHtml, treeHtml: treeHtml, sheetHtml: sheetHtml
  };
});
