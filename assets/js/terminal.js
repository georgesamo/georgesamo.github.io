/* Samuka · interactive terminal + ruby rain */
(function () {
  "use strict";
  var term = document.getElementById("term");
  if (!term) return;
  var out = document.getElementById("term-out");
  var input = document.getElementById("term-input");
  var form = document.getElementById("term-form");
  var ps1 = document.getElementById("term-ps1");
  var S = window.Samuka || {};
  var data = S.data || {};
  var p = data.person || {};
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var history = [], hIdx = 0, mode = "sh", lastFocus = null, greeted = false;

  /* ---------- output helpers ---------- */
  function print(html, cls) {
    var el = document.createElement("p");
    if (cls) el.className = cls;
    el.innerHTML = html;
    out.appendChild(el);
    out.scrollTop = out.scrollHeight;
    return el;
  }
  function echo(cmd) {
    var prompt = mode === "irb"
      ? '<span class="hl">irb(main):' + String(history.length).padStart(3, "0") + ":0&gt;</span> "
      : mode === "chat" ? '<span class="hl">#lobby&gt;</span> '
      : '<span class="u">visitor@samuka</span>:<span class="d">~</span>$ ';
    print(prompt + esc(cmd), "cmd");
  }
  function setPrompt() {
    ps1.innerHTML = mode === "irb"
      ? '<span class="u">irb(main)</span>:<span class="d">' + String(history.length + 1).padStart(3, "0") + "</span>&gt;"
      : mode === "chat" ? '<span class="hl">#lobby</span>&gt;'
      : '<span class="u">visitor@samuka</span>:<span class="d">~</span>$';
  }

  /* ---------- open / close ---------- */
  function open(prefill) {
    if (!term.hidden) { input.focus(); return; }
    lastFocus = document.activeElement;
    term.hidden = false;
    document.documentElement.style.overflow = "hidden";
    if (!greeted) { greeted = true; greet(); }
    if (prefill) input.value = prefill;
    setTimeout(function () { input.focus(); }, 20);
  }
  function close() {
    if (term.hidden) return;
    term.hidden = true;
    document.documentElement.style.overflow = "";
    if (window.SamukaA11y) window.SamukaA11y.restore(lastFocus); else if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function greet() {
    print('<pre class="ascii">' + [
      "  ___                  _          ",
      " / __| __ _ _ __ _  _| |__ __ _  ",
      " \\__ \\/ _` | '  \\ || | / // _` | ",
      " |___/\\__,_|_|_|_\\_,_|_\\_\\\\__,_| "
    ].map(esc).join("\n") + "</pre>");
    print('<span class="dim">samuka-shell 1.0 · ruby ' + "3.3" + " · type </span><span class=\"hl\">help</span><span class=\"dim\"> to see what I can do. Tab completes, ↑↓ walk history.</span>");
    var role = window.SamukaAuth ? window.SamukaAuth.role() : "guest";
    if (role === "samuka") print('<span class="hl">Welcome back, Samuka.</span> <span class="dim">The city\'s servers are quiet tonight. Try </span><span class="b">theme knight</span><span class="dim"> or </span><span class="b">glitch</span>');
    else if (role === "nino") print('<span class="hl">annyeong, Nino 🐰</span> <span class="dim">sprint status: 🟢 · try </span><span class="b">theme golden</span><span class="dim"> or </span><span class="b">glitch</span>');
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-open-terminal]")) { e.preventDefault(); open(); }
    else if (e.target.closest("[data-close-terminal]")) close();
  });
  document.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "k") { e.preventDefault(); term.hidden ? open() : close(); return; }
    if (e.key === "Escape" && !term.hidden) { e.preventDefault(); close(); return; }
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "`" && term.hidden && tag !== "input" && tag !== "textarea") { e.preventDefault(); open(); }
  });
  // keep focus inside the dialog
  term.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    complete();
  });
  out.addEventListener("click", function () { if (!window.getSelection().toString()) input.focus(); });

  /* ---------- commands ---------- */
  var jobs = data.experience || [];
  var edu = (data.education || []).slice().sort(function (a, b) { return a.version < b.version ? -1 : 1; });
  var groups = data.skills || [];
  var FILES = {
    "about.md": function () { return about(); },
    "skills.rb": function () { return skills([]); },
    "career.log": function () { return gitlog(); },
    "contact.txt": function () { return contact(); },
    "resume.rb": function () { return resumeRb(); },
    ".secret": function () { return '<span class="dim"># You found it.</span>\n<span class="hl">Rubies are formed under pressure. So are good backends.</span>'; }
  };

  function navTo(u) { if (window.SamukaNav) window.SamukaNav.go(u); else location.href = u; }
  function ach(k) { if (window.SamukaAch) window.SamukaAch.unlock(k); }
  function resumeRb() {
    var k = function (s) { return '<span class="k">' + s + "</span>"; }, str = function (s) { return '<span class="ok">"' + esc(s) + '"</span>'; };
    var lines = [
      k("class") + ' <span class="hl">Samuka</span> &lt; Engineer',
      "  role       " + str(p.role),
      "  based_in   " + str(p.location),
      "",
      "  " + k("def") + " experience",
      "    ["
    ];
    jobs.forEach(function (j) { lines.push("      { company: " + str(j.company) + ", role: " + str(j.role) + ", since: " + str(j.start) + " },"); });
    lines.push("    ]", "  " + k("end"), "", "  " + k("def") + " skills");
    groups.forEach(function (g) { lines.push("    " + esc(g.group) + ": %w[" + g.gems.map(esc).join(" ") + "],"); });
    lines.push("  " + k("end"), "", "  " + k("def") + " hire!", "    Contact.deliver(" + str(p.email) + ")", "  " + k("end"), k("end"));
    return lines.join("\n") + '\n\n<span class="dim"># the PDF: </span><span class="b">resume</span>';
  }
  function about() {
    return '<span class="hl">' + esc(p.handle) + "</span> <span class=\"dim\">(" + esc(p.full_name) + ")</span>\n" +
      esc(p.role) + " · " + esc(p.location) + "\n" +
      '<span class="ok">' + (S.years || 8) + " years</span> shipping Rails in production, mostly healthcare: bookings, billing,\ninsurance, medication catalogs and HL7 FHIR integrations.\n\n" +
      "Try: <span class=\"b\">experience</span>, <span class=\"b\">skills</span>, <span class=\"b\">education</span>, <span class=\"b\">contact</span>";
  }
  function gitlog(full) {
    return jobs.map(function (j, i) {
      var line = '<span class="warn">' + esc(j.hash) + "</span> " + (i === 0 ? '<span class="hl">(HEAD → main)</span> ' : "") +
        "<b>" + esc(j.role) + "</b> @ " + esc(j.company) + ' <span class="dim">' + esc(j.period) + "</span>";
      if (full) line += "\n" + j.bullets.map(function (b) { return '  <span class="ok">+</span> ' + esc(b); }).join("\n");
      return line;
    }).join(full ? "\n\n" : "\n") + (full ? "" : '\n\n<span class="dim">tip: </span><span class="b">experience -v</span><span class="dim"> for the full diff, or </span><span class="b">show vian</span>');
  }
  function show(arg) {
    var q = (arg || "").toLowerCase();
    var j = jobs.filter(function (x) { return x.hash === q || x.id === q || x.id.indexOf(q) === 0 || x.company.toLowerCase() === q; })[0];
    if (!j) return '<span class="warn">fatal: bad revision \'' + esc(arg || "") + "'</span>\nknown: " + jobs.map(function (x) { return x.id; }).join(", ");
    return '<span class="warn">commit ' + esc(j.hash) + "</span>\nRole:   " + esc(j.role) + "\nAt:     " + esc(j.company) + ", " + esc(j.location) + "\nDate:   " + esc(j.period) + "\n\n" +
      j.bullets.map(function (b) { return '  <span class="ok">+</span> ' + esc(b); }).join("\n");
  }
  function skills(args) {
    var g = args[0] ? args[0].replace(/^--group=/, "").toLowerCase() : "";
    var list = g ? groups.filter(function (x) { return x.group.indexOf(g) === 0; }) : groups;
    if (!list.length) return '<span class="warn">no such group.</span> groups: ' + groups.map(function (x) { return x.group; }).join(", ");
    return list.map(function (x) {
      return '<span class="b">group</span> <span class="hl">:' + esc(x.group) + '</span> <span class="dim"># ' + esc(x.title) + "</span>\n" +
        x.gems.map(function (s) { return '  gem <span class="ok">"' + esc(s) + '"</span>'; }).join("\n");
    }).join("\n\n");
  }
  function education() {
    return edu.map(function (e) {
      return '<span class="dim">== ' + esc(e.version) + " " + esc(e.klass) + ": migrated</span>\n  <b>" + esc(e.title) + "</b>\n  " + esc(e.school) + ' <span class="dim">· ' + esc(e.period) + " · " + esc(e.level) + "</span>";
    }).join("\n");
  }
  function languages() {
    return "mother_tongue: <span class=\"hl\">Georgian</span> (ქართული)\nenglish: <span class=\"ok\">C2</span> <span class=\"dim\">(CEFR, all skills)</span>\n\n" +
      '<span class="dim">full table: </span><span class="b">goto languages</span>';
  }
  function contact() {
    return 'email   <a href="mailto:' + esc(p.email) + '">' + esc(p.email) + "</a>\n" +
      'github  <a href="' + esc(p.github) + '" target="_blank" rel="noopener">' + esc(p.github) + "</a>\n" +
      "where   " + esc(p.location) + "\n\n" +
      '<span class="dim">or run </span><span class="b">mail</span><span class="dim"> to jump to the contact form.</span>';
  }
  function help() {
    var rows = [
      ["whoami / about", "who is Samuka"],
      ["experience [-v]", "git log of the career (-v = full diff)"],
      ["show &lt;id|hash&gt;", "one role in detail, e.g. show vian"],
      ["skills [group]", "the Gemfile (backend, data, architecture, practices)"],
      ["education", "db:migrate history"],
      ["languages", "config/locales"],
      ["contact / mail", "ways to reach me / open the form"],
      ["resume", "download the PDF"],
      ["github", "open GitHub profile"],
      ["goto &lt;section&gt;", "scroll the page (experience, skills, ...)"],
      ["play [sidekiq|gems|schema|pitwall]", "minigames (sign-in)"],
      ["login / logout / id", "optional account, unlocks the arcade"],
      ["me / settings [tab]", "your account at a glance · open a settings tab"],
      ["theme [light|dark]", "switch colors"],
      ["leaderboard [game] [week|daily]", "top scores"],
      ["daily / race", "daily Gem Match · live 1v1 Sidekiq Rush"],
      ["achievements", "what you've unlocked"],
      ["wall / blog / projects", "visitor commits · pull requests · repos"],
      ["news [tech|gaming|dev]", "latest headlines · /news/"],
      ["trailers / reviews", "watch official trailers · video reviews"],
      ["music [on|off]", "generated lo-fi that follows the theme"],
      ["cursors [on|off]", "other visitors' ghost cursors"],
      ["chat", "live #lobby chat with everyone on the site"],
      ["events / card [name]", "this week's challenge · player cards"],
      ["ls, cat &lt;file&gt;, pwd, date, echo, history, clear, exit", ""]
    ];
    return rows.map(function (r) {
      var pad = Math.max(1, 34 - r[0].replace(/&[a-z]+;/g, "x").length);
      return '  <span class="b">' + r[0] + "</span>" + " ".repeat(pad) + '<span class="dim">' + r[1] + "</span>";
    }).join("\n") + '\n\n<span class="dim">…and a few things that aren\'t listed. Rubyists know where to look.</span>';
  }

  var COMMANDS = {
    help: help, "?": help,
    whoami: about, about: about,
    experience: function (a) { return gitlog(a.indexOf("-v") > -1 || a.indexOf("--verbose") > -1); },
    git: function (a) {
      if (a[0] === "log") return gitlog(a.indexOf("-p") > -1 || a.indexOf("-v") > -1);
      if (a[0] === "show") return show(a[1]);
      if (a[0] === "blame") return '<span class="warn">' + esc(jobs[0] && jobs[0].hash) + "</span> (Samuka " + new Date().getFullYear() + ") it works on my machine";
      if (a[0] === "status") return "On branch main\nYour career is up to date with 'origin/main'.\n\nnothing to commit, working tree clean";
      if (a[0] === "push" && a.indexOf("--force") > -1) return '<span class="warn">Rejected.</span> We don\'t force-push to main here.';
      return "usage: git log | git show &lt;id&gt; | git status | git blame";
    },
    show: function (a) { return show(a[0]); },
    skills: skills, gems: skills,
    bundle: function (a) {
      if (a[0] === "install") { close(); S.go && S.go("skills"); setTimeout(function () { var b = document.querySelector("[data-bundle]"); b && b.click(); }, 700); return "Running bundle install on the Gemfile…"; }
      return skills([]);
    },
    education: education, "db:migrate": education,
    rails: function (a) {
      if (a[0] === "db:migrate") return education();
      if (a[0] === "console" || a[0] === "c") { mode = "irb"; ach("rails_c"); return '<span class="dim">Loading production environment (Rails 8.0)</span>\nType <span class="b">exit</span> to leave. Try: <span class="b">Samuka.skills.count</span>, <span class="b">Samuka.experience.first</span>, <span class="b">Samuka.hire!</span>'; }
      if (a[0] === "routes") return "  Prefix Verb URI Pattern     Controller#Action\n    root GET  /               portfolio#show\n contact POST /contact        samuka#inbox\n  resume GET  /resume.pdf     portfolio#resume";
      if (a[0] === "s" || a[0] === "server") return '<span class="ok">=> Already running.</span> You\'re looking at it.';
      return "usage: rails console | rails routes | rails db:migrate";
    },
    rake: function (a) {
      if (a[0] === "rubies") { rain(); return '<span class="hl">♦ ♦ ♦</span>'; }
      if (a[0] === "-T" || !a.length) return "rake rubies   # make it rain\nrake db:migrate";
      if (a[0] === "db:migrate") return education();
      return "rake aborted! Don't know how to build task '" + esc(a[0]) + "'";
    },
    languages: languages, locales: languages,
    contact: contact,
    mail: function () { close(); S.focusContact && S.focusContact(); return "opening the contact form…"; },
    email: function () {
      try { navigator.clipboard.writeText(p.email); return '<span class="ok">copied</span> ' + esc(p.email) + " to clipboard"; } catch (e) { return esc(p.email); }
    },
    resume: function () {
      var a = document.createElement("a");
      a.href = (window.SITE && window.SITE.resumePdf) || "/assets/samuka-resume.pdf";
      a.download = "Samuka - Giorgi Samukashvili - Resume.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      return '<span class="ok">GET /resume.pdf 200 OK</span> · downloading…';
    },
    github: function () { window.open(p.github, "_blank", "noopener"); return "opening " + esc(p.github) + " …"; },
    goto: function (a) {
      var map = { hero: "hero", top: "hero", home: "hero", experience: "experience", career: "experience", skills: "skills", gemfile: "skills", education: "education", languages: "languages", projects: "projects", repos: "projects", arcade: "arcade", wall: "wall", contact: "contact" };
      var id = map[(a[0] || "").toLowerCase()];
      if (!id) return "usage: goto " + Object.keys(map).join(" | ");
      close(); S.go && S.go(id); return "→ " + id;
    },
    play: function (a) {
      var A = window.SamukaArcade;
      if (!A) return "arcade not loaded";
      var alias = { sidekiq: "sidekiq", "sidekiq-rush": "sidekiq", rush: "sidekiq", gems: "gems", gem: "gems", "gem-match": "gems", match: "gems", schema: "schema", "schema-stack": "schema", stack: "schema", migrate: "schema", pitwall: "pitwall", "pit-wall": "pitwall", pit: "pitwall", race: "pitwall", f1: "pitwall", gp: "pitwall" };
      var id = alias[(a[0] || "").toLowerCase()];
      if (!id) return A.list().map(function (g) { return '  <span class="b">play ' + g.id + "</span>  " + '<span class="dim">' + esc(g.blurb) + "</span>"; }).join("\n");
      close(); setTimeout(function () { A.open(id); }, 60);
      return "launching " + id + "…";
    },
    cd: function (a) { return COMMANDS.goto(a.length ? [a[0].replace(/[\/.~]/g, "")] : ["top"]); },
    theme: function (a) {
      var skins = S.availableSkins ? S.availableSkins() : ["phthalo"];
      var mark = function (x, cur) { return x === cur ? '<span class="hl">' + x + "</span>" : x; };
      if (!a[0]) return "mode:  " + ["dark", "light"].map(function (m) { return mark(m, S.mode()); }).join("  ") +
        "\nstyle: " + skins.map(function (s) { return mark(s, S.skin()); }).join("  ") + '\n<span class="dim">usage: theme dark|light|&lt;style&gt;</span>';
      var t = a[0].toLowerCase();
      if (t === "dark" || t === "light") { S.setMode(t, { user: true }); return "mode → " + t; }
      if (S.skins && S.skins[t]) {
        if (!S.canUseSkin(t)) return '<span class="warn">403 Forbidden</span> · style "' + esc(t) + '" is reserved for a special role';
        S.setSkin(t, { user: true }); return "style → " + t + ' <span class="dim">(follows dark/light)</span>';
      }
      return "unknown theme. try: dark, light, " + skins.join(", ");
    },
    login: function () {
      var A = window.SamukaAuth;
      if (!A || !A.enabled) return '<span class="dim">accounts are not switched on yet.</span>';
      if (A.user()) return "already signed in as " + esc(A.role()) + " · try <span class=\"b\">id</span>";
      close(); setTimeout(function () { A.open(); }, 60); return "opening sessions#new…";
    },
    logout: function () {
      var A = window.SamukaAuth;
      if (!A || !A.user()) return "not signed in.";
      A.signOut(); return '<span class="ok">signed out.</span> see you around.';
    },
    me: function () {
      var A = window.SamukaAuth, C = window.SamukaAccountCore, M = window.SamukaMe;
      if (!A || !A.user() || !C || !M) return 'not signed in · <span class="b">login</span> to get a player card, saved scores and badges';
      var c = M.ctx();
      return '<span class="hl">' + esc(c.name) + '</span> <span class="dim">· ' + esc(C.roleLabel(c.role)) + "</span>\n" +
        "  badges   " + c.ach.n + "/" + c.ach.total + '  <span class="dim">→ achievements</span>\n' +
        '  card     <span class="b">card</span>  <span class="dim">→ ' + esc(C.cardHref(c.name)) + "</span>\n" +
        '  ranks    <span class="b">leaderboard</span>  <span class="dim">→ /leaderboards/#me</span>\n' +
        '  settings <span class="b">settings [profile|appearance|settings|badges]</span>';
    },
    settings: function (a) {
      var A = window.SamukaAuth, C = window.SamukaAccountCore;
      if (!A || !A.enabled) return '<span class="dim">accounts are not switched on yet.</span>';
      var tab = C && C.tabOf(a[0]) ? a[0] : "profile";
      close(); setTimeout(function () { A.open({ tab: tab }); }, 60); return A.user() ? "opening " + esc(tab) + "…" : "opening sessions#new…";
    },
    id: function () {
      var A = window.SamukaAuth, role = A ? A.role() : "guest";
      var groups = { guest: "guests", user: "guests,arcade", samuka: "guests,arcade,owner,knight", nino: "guests,arcade,pm,golden" };
      return "uid=" + (A && A.user() ? "1000" : "65534") + "(" + esc(role) + ") groups=" + groups[role];
    },
    glitch: function () {
      var A = window.SamukaAuth, role = A ? A.role() : "guest";
      if (!A || !A.user()) return '<span class="warn">Permission denied</span> · sign in first: <span class="b">login</span>';
      if (role !== "samuka" && role !== "nino") { close(); setTimeout(function () { window.SamukaTextGlitch && window.SamukaTextGlitch.fire(true); }, 300); return "…"; }
      close(); setTimeout(function () { window.SamukaGlitch && window.SamukaGlitch.fire(true); }, 300); return "…";
    },
    warp: function () {
      var A = window.SamukaAuth;
      if (!A || !A.user()) return '<span class="warn">Permission denied</span> · sign in first: <span class="b">login</span>';
      close(); setTimeout(function () { window.SamukaTextGlitch && window.SamukaTextGlitch.fire(true); }, 300); return "…";
    },
    ls: function (a) { return Object.keys(FILES).filter(function (f) { return a.indexOf("-a") > -1 || a.indexOf("-la") > -1 || f[0] !== "."; }).map(function (f) { return '<span class="b">' + f + "</span>"; }).join("  "); },
    cat: function (a) { var f = FILES[a[0]]; return f ? f() : "cat: " + esc(a[0] || "") + ": No such file or directory"; },
    pwd: function () { return "/home/visitor/samuka"; },
    date: function () { return new Date().toString(); },
    echo: function (a, raw) { return esc(raw.replace(/^echo\s*/, "")); },
    history: function () { return history.map(function (h, i) { return String(i + 1).padStart(4) + "  " + esc(h); }).join("\n"); },
    clear: function () { out.innerHTML = ""; return null; },
    exit: function () { close(); return null; },
    sudo: function (a) {
      if (a.join(" ").indexOf("hire") === 0) return sudoHire();
      ach("sudo");
      if (a.join(" ") === "make me a sandwich") return "Okay. 🥪";
      if (a.join(" ") === "rm -rf /") return '<span class="warn">Nice try.</span> This résumé is immutable.';
      return "visitor is not in the sudoers file. This incident will be reported. <span class=\"dim\">(just kidding)</span>";
    },
    rm: function () { return '<span class="warn">rm: refusing to remove anything.</span> Production data is sacred.'; },
    vim: function () { ach("vim"); return "You are now stuck in vim forever. <span class=\"dim\">(type :q! … no wait, wrong terminal. You're fine.)</span>"; },
    coffee: function () { return '<span class="warn">418 I\'m a teapot</span> · but Samuka runs on coffee anyway.'; },
    ruby: function (a) { return a[0] === "-v" ? "ruby 3.3.6 (2024-11-05) [samuka-linux]" : "usage: ruby -v · or try rails console"; },
    chat: function () {
      if (!window.SamukaChat) return "chat not loaded";
      mode = "chat";
      window.SamukaChat.enter({ print: print });
      var A = window.SamukaAuth;
      return '<span class="hl">joined #lobby</span> <span class="dim">· everyone on the site · ' + (A && A.user() ? "type to talk" : "read-only until you <b>login</b>") + " · /help · /exit</span>";
    },
    events: function () { return window.SamukaEvents ? window.SamukaEvents.text() + '\n<span class="dim">more: /events/</span>' : "events not loaded"; },
    card: function (a) {
      var A = window.SamukaAuth, n = a[0] || (A && A.user() ? A.publicName() : "");
      if (!n) return "usage: card &lt;nickname&gt;";
      close(); navTo("/u/?n=" + encodeURIComponent(n)); return "→ player card of " + esc(n);
    },
    achievements: function () {
      var t = window.SamukaAch && window.SamukaAch.text();
      return t || 'sign in to collect achievements: <span class="b">login</span>';
    },
    leaderboard: function (a) {
      var game = /^(sidekiq|rush)/.test(a[0] || "") ? "sidekiq" : /^(schema|stack)/.test(a[0] || "") ? "schema" : /^(pit|gp)/.test(a[0] || "") ? "pitwall" : "gems";
      var period = (a.indexOf("week") > -1 || a.indexOf("--week") > -1) ? "week" : (a.indexOf("daily") > -1 || a.indexOf("today") > -1) ? "daily" : "all";
      if (!window.SamukaScores) return "leaderboards are not loaded";
      var el = print('<span class="dim">SELECT * FROM leaderboard(\'' + game + "', '" + period + "') …</span>");
      window.SamukaScores.board(game, period, 10).then(function (rows) {
        el.innerHTML = (rows.length ? rows.map(function (r) {
          return String(r.rank).padStart(3) + "  " + (r.me ? '<span class="hl">' : "") + esc(r.name).padEnd(24) + (r.me ? "</span>" : "") + "  " + '<span class="ok">' + String(r.score).padStart(7) + "</span>" + (r.role === "samuka" || r.role === "nino" ? ' <span class="dim">' + r.role + "</span>" : "");
        }).join("\n") : '<span class="dim">no scores yet</span>') + '\n<span class="dim">usage: leaderboard [sidekiq|gems] [week|daily]</span>';
      }, function () { el.innerHTML = '<span class="warn">leaderboard offline</span>'; });
      return null;
    },
    daily: function () {
      if (!window.SamukaScores) return "not loaded";
      close(); setTimeout(function () { window.SamukaScores.openDaily(); }, 60); return "rails gems:daily …";
    },
    race: function () {
      if (!window.SamukaRace) return "not loaded";
      close(); setTimeout(function () { window.SamukaRace.open(); }, 60); return "bundle exec sidekiq --race …";
    },
    wall: function () { close(); S.go && S.go("wall"); return "→ wall (git log of visitors)"; },
    board: function () {
      var A = window.SamukaAuth, r = A && A.user() ? A.role() : "guest";
      if (!window.SamukaBoard || (r !== "samuka" && r !== "nino")) return '<span class="warn">404</span> · no board here.';
      close(); setTimeout(function () { window.SamukaBoard.open(); }, 60); return "opening our board…";
    },
    admin: function () {
      var A = window.SamukaAuth;
      if (!A || !A.user() || A.role() !== "samuka") return '<span class="warn">403 Forbidden</span>';
      close(); setTimeout(function () { window.SamukaAdmin && window.SamukaAdmin.open(); }, 60); return "rails admin …";
    },
    music: function (a) {
      var L = window.SamukaLofi, M = window.SamukaMusic;
      // the soundtrack loads on demand (music.js): fetch it, then run the command again
      if (!L && M && (window.AudioContext || window.webkitAudioContext)) { M.ready(function () { COMMANDS.music(a); }); return "♪ loading the soundtrack…"; }
      if (!L) return "audio not available in this browser";
      if (a[0] === "off" || a[0] === "stop") { L.stop(); return "♪ off"; }
      if (a[0] === "suite") {
        var th = L.theme ? L.theme() : "phthalo";
        if (!L.suite || !L.suite.open(th)) return '🔒 <span class="dim">track 6 is locked in this theme ·</span> patchbay';
        L.play(th, 5); return "♪ playing <b>" + esc(L.suite.title(th)) + '</b> <span class="dim">(the director’s cut · the same story, told once, end to end)</span>';
      }
      if (a[0] === "next" || a[0] === "skip") { if (!L.isOn()) L.start(); else L.next(); var n = L.track(); return "⏭ " + (n ? esc(n.name) : "next track"); }
      if (a[0] === "now" || (L.isOn() && !a[0])) { var t = L.track(); return t ? "♪ <b>" + esc(t.name) + '</b> <span class="dim">· ' + (t.style || "") + " · " + t.bpm + " bpm · bar " + (t.bar + 1) + "/" + t.bars + " · track " + t.no + "/" + (t.of || 5) + " · " + esc(t.themeName) + " · music next | music off · <a href=\"/soundtrack/\">/soundtrack/</a></span>" : "nothing playing"; }
      L.start(); var tr = L.track(); return '♪ playing <b>' + (tr ? esc(tr.name) : "the soundtrack") + '</b> <span class="dim">(your theme’s 5 songs · music next · music off)</span>';
    },
    patchbay: function (a) {
      var P = window.SamukaPatchBay; if (!P) return "not loaded";
      if (!window.SamukaLofi && window.SamukaMusic) { close(); window.SamukaMusic.ready(function () { P.open(a[0]); }); return "bin/patchbay …"; }
      close(); setTimeout(function () { P.open(a[0]); }, 60); return "bin/patchbay …";
    },
    cursors: function (a) {
      var P = window.SamukaPresence; if (!P) return "presence not loaded";
      if (a[0] === "off") { P.cursors(false); return "live cursors hidden"; }
      if (a[0] === "on") { P.cursors(true); return "live cursors visible"; }
      return "live cursors are " + (P.cursors() ? "on" : "off") + ' · <span class="dim">cursors on|off</span>';
    },
    who: function () {
      var P = window.SamukaPresence; if (!P) return "you";
      if (!P.visible || !P.visible()) return '<span class="dim">who: command not found</span>';
      var peers = P.peers();
      return "you" + (peers.length ? "\n" + peers.map(function (x) { return esc(x.name) + ' <span class="dim">(' + esc(x.role) + ")</span>"; }).join("\n") : '\n<span class="dim">nobody else right now</span>');
    },
    blog: function () { close(); navTo("/blog/"); return "→ /blog/"; },
    trailers: function () { close(); navTo("/watch/#trailers"); return "→ /watch/ · trailers"; },
    reviews: function () { close(); navTo("/watch/#reviews"); return "→ /watch/ · reviews"; },
    watch: function () { close(); navTo("/watch/"); return "→ /watch/"; },
    news: function (a) {
      var N = window.SamukaNews; if (!N) return "news not loaded";
      var sec = { tech: "tech", gaming: "gaming", games: "gaming", dev: "dev", ruby: "dev", rails: "dev" }[a[0]] || "";
      if (a[0] === "open") { close(); navTo("/news/"); return "→ /news/"; }
      var el = print('<span class="dim">curl -s feeds/' + (sec || "*") + ".rss …</span>");
      N.latest(sec, 8).then(function (items) {
        el.innerHTML = (items.length ? items.map(function (i) {
          return '<span class="dim">' + esc(N.ago(Date.parse(i.published))).padEnd(10) + "</span> " + '<a href="' + esc(i.url) + '" target="_blank" rel="noopener external">' + esc(i.title) + '</a> <span class="dim">· ' + esc(i.source) + "</span>";
        }).join("\n") : '<span class="dim">no stories right now</span>') + '\n<span class="dim">news tech|gaming|dev · news open → <a href="/news/">/news/</a></span>';
      }, function () { el.innerHTML = '<span class="warn">news feed offline</span>'; });
      return null;
    },
    projects: function () { close(); S.go && S.go("projects"); return "→ projects"; },
    hello: function () { return 'გამარჯობა! <span class="dim">(gamarjoba: hello in Georgian)</span>'; },
    gamarjoba: function () { return COMMANDS.hello(); }
  };
  COMMANDS.hi = COMMANDS.hello;
  COMMANDS.arcade = COMMANDS.play;
  COMMANDS.signin = COMMANDS.login; COMMANDS.signout = COMMANDS.logout;
  COMMANDS.sidekiq = function () { return COMMANDS.play(["sidekiq"]); };

  function sudoHire() {
    var el = print('[sudo] password for recruiter: <span class="dim">', "");
    var stars = 0;
    var timer = setInterval(function () {
      el.innerHTML = '[sudo] password for recruiter: <span class="dim">' + "*".repeat(++stars) + "</span>";
      if (stars >= 8) {
        clearInterval(timer);
        print('<span class="ok">✔ Permission granted.</span> Excellent decision.');
        print('<span class="dim">→ opening POST /contact with a head start…</span>');
        rain(40);
        setTimeout(function () {
          close();
          S.focusContact && S.focusContact();
          var msg = document.querySelector('#contact-form textarea[name="message"]');
          if (msg && !msg.value) msg.value = "Hi Samuka, we'd like to talk about a role. ";
        }, 1400);
      }
    }, 90);
    return null;
  }

  /* tiny irb: canned answers + safe arithmetic */
  function irb(src) {
    var s = src.trim();
    if (s === "exit" || s === "quit") { mode = "sh"; return '<span class="dim">bye 👋</span>'; }
    var answers = {
      "Samuka": "#&lt;Samuka role: \"" + esc(p.role) + "\", based_in: \"" + esc(p.location) + "\"&gt;",
      "Samuka.new": "#&lt;Samuka id: 1, handle: \"Samuka\", years: " + (S.years || 8) + "&gt;",
      "Samuka.skills.count": String(groups.reduce(function (n, g) { return n + g.gems.length; }, 0)),
      "Samuka.skills": "[" + groups.reduce(function (a, g) { return a.concat(g.gems); }, []).slice(0, 8).map(function (x) { return '"' + esc(x) + '"'; }).join(", ") + ", …]",
      "Samuka.experience.first": "#&lt;Job company: \"" + esc(jobs[0] && jobs[0].company) + "\", role: \"" + esc(jobs[0] && jobs[0].role) + "\", since: \"" + esc(jobs[0] && jobs[0].start) + "\"&gt;",
      "Samuka.experience.count": String(jobs.length),
      "Samuka.hire!": "Contact.deliver(\"" + esc(p.email) + "\") <span class=\"dim\"># => run `mail` in the shell</span>",
      "RUBY_VERSION": '"3.3.6"',
      "Rails.version": '"8.0.1"',
      "Time.now": esc(new Date().toString()),
      "nil": "nil", "true": "true", "false": "false"
    };
    if (Object.prototype.hasOwnProperty.call(answers, s)) return "=&gt; " + answers[s];
    if (/^[\d\s+\-*/%().]+$/.test(s) && /\d/.test(s)) {
      try {
        // arithmetic only (validated by the regex above)
        var r = Function('"use strict"; return (' + s.replace(/\*\*/g, "**") + ")")();
        if (typeof r === "number" && isFinite(r)) return "=&gt; " + r;
      } catch (e) {}
    }
    var m = s.match(/^"(.*)"\.(upcase|downcase|reverse|length|size)$/);
    if (m) {
      var v = m[1];
      var res = m[2] === "upcase" ? '"' + v.toUpperCase() + '"' : m[2] === "downcase" ? '"' + v.toLowerCase() + '"' : m[2] === "reverse" ? '"' + v.split("").reverse().join("") + '"' : String(v.length);
      return "=&gt; " + esc(res);
    }
    return '<span class="warn">NameError</span>: undefined local variable or method `' + esc(s.split(/[.\s(]/)[0]) + "' for main:Object";
  }

  function run(raw) {
    var line = raw.trim();
    echo(raw);
    if (!line) return;
    history.push(line); hIdx = history.length;
    var outHtml;
    if (mode === "irb") outHtml = irb(line);
    else if (mode === "chat") {
      var r = window.SamukaChat ? window.SamukaChat.input(line) : { leave: true, html: "chat unavailable" };
      if (r.leave) mode = "sh";
      outHtml = r.html;
    }
    else {
      var parts = line.split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1);
      var fn = COMMANDS[cmd];
      outHtml = fn ? fn(args, line) : '<span class="warn">command not found: ' + esc(cmd) + '</span> · try <span class="b">help</span>';
    }
    if (outHtml) print(outHtml);
    setPrompt();
  }

  function complete() {
    var v = input.value;
    if (mode !== "sh" || !v) return;
    var parts = v.split(/\s+/);
    var pool = parts.length > 1
      ? (parts[0] === "cat" ? Object.keys(FILES) : parts[0] === "goto" ? ["experience", "skills", "education", "languages", "contact", "top"] : parts[0] === "show" ? jobs.map(function (j) { return j.id; }) : parts[0] === "skills" ? groups.map(function (g) { return g.group; }) : parts[0] === "play" ? ["sidekiq", "gems", "schema", "pitwall"] : parts[0] === "leaderboard" ? ["sidekiq", "gems", "week", "daily"] : parts[0] === "music" || parts[0] === "cursors" ? ["on", "off"] : [])
      : Object.keys(COMMANDS);
    var last = parts[parts.length - 1];
    var hits = pool.filter(function (c) { return c.indexOf(last) === 0; });
    if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(" ") + " "; }
    else if (hits.length > 1) { echo(v); print(hits.join("  "), "dim"); }
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value; input.value = ""; run(v); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp") { e.preventDefault(); if (hIdx > 0) { hIdx--; input.value = history[hIdx]; } }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (hIdx < history.length - 1) { hIdx++; input.value = history[hIdx]; } else { hIdx = history.length; input.value = ""; } }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
    else if (e.key === "c" && e.ctrlKey && !window.getSelection().toString()) { e.preventDefault(); echo(input.value + "^C"); input.value = ""; if (mode === "chat" && window.SamukaChat) window.SamukaChat.leave(); if (mode !== "sh") { mode = "sh"; setPrompt(); } }
  });

  /* ---------- ruby rain ---------- */
  var rainCanvas = document.getElementById("rain");
  var raining = false;
  function rain(count) {
    if (!rainCanvas || raining || (S.reduced)) return;
    raining = true;
    var ctx = rainCanvas.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    rainCanvas.width = W * dpr; rainCanvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cs = getComputedStyle(document.documentElement);
    var ruby = cs.getPropertyValue("--ruby-red").trim() || "#ff4d6d", ruby2 = "#ff8fa3"; // real rubies stay red
    var n = count || 90, drops = [];
    for (var i = 0; i < n; i++) drops.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.9, vy: 160 + Math.random() * 260, s: 6 + Math.random() * 12, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 4, sway: Math.random() * 6.28 });
    var t0 = 0;
    function gemPath(s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.35); ctx.lineTo(s * 0.55, -s * 0.35); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath();
    }
    function step(ts) {
      if (!t0) t0 = ts;
      var dt = 1 / 60, alive = 0;
      ctx.clearRect(0, 0, W, H);
      drops.forEach(function (d) {
        d.y += d.vy * dt; d.r += d.vr * dt; d.sway += dt * 2;
        if (d.y < H + 30) alive++;
        ctx.save();
        ctx.translate(d.x + Math.sin(d.sway) * 10, d.y); ctx.rotate(d.r);
        gemPath(d.s);
        ctx.fillStyle = ruby; ctx.globalAlpha = 0.85; ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = ruby2; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s2(d) , -d.s * 0.35); ctx.lineTo(0, d.s); ctx.lineTo(s2(d), -d.s * 0.35); ctx.moveTo(-d.s, 0); ctx.lineTo(d.s, 0);
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
        ctx.restore();
      });
      if (alive && ts - t0 < 6000) requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, W, H); raining = false; }
    }
    function s2(d) { return d.s * 0.2; }
    requestAnimationFrame(step);
  }

  window.SamukaTerminal = { open: open, close: close, run: run };
})();
