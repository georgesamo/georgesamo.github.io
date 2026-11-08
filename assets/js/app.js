/* Samuka · core interactions (no dependencies) */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var data = {};
  try { data = JSON.parse($("#resume-data").textContent); } catch (e) {}

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------- small facts ---------- */
  var start = new Date((data.person && data.person.career_start) || "2018-09-01");
  var years = Math.floor((Date.now() - start.getTime()) / (365.25 * 864e5));
  $$("[data-years]").forEach(function (el) { el.textContent = years; });
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- theme ---------- */
  // Two independent axes:
  //   mode (data-theme): dark | light, toggled by everyone
  //   skin (data-skin):  phthalo for everyone; knight (role samuka) and golden (role nino),
  //                      each with its own dark AND light version
  var MODES = { dark: "dark mode", light: "light mode" };
  var SKINS = {
    phthalo: { meta: { dark: "#07110c", light: "#f3f6f1" } },
    knight: { meta: { dark: "#050506", light: "#f2efe6" }, role: "samuka" },
    golden: { meta: { dark: "#120a1f", light: "#f6f1ff" }, role: "nino" },
    crt: { meta: { dark: "#020703", light: "#ece4cf" }, secret: "samuka-konami" }
  };
  var root = document.documentElement;
  function role() { return root.dataset.role || "guest"; }
  function canUseSkin(s) {
    var k = SKINS[s]; if (!k) return false;
    if (k.secret) return store.get(k.secret) === "1";
    return !k.role || k.role === role();
  }
  function availableSkins() { return Object.keys(SKINS).filter(canUseSkin); }
  function currentMode() { return root.dataset.theme === "light" ? "light" : "dark"; }
  function currentSkin() { var s = root.dataset.skin; return SKINS[s] ? s : "phthalo"; }
  function paintTheme(opts) {
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", SKINS[currentSkin()].meta[currentMode()]);
    $$("[data-theme-label]").forEach(function (el) { el.textContent = MODES[currentMode() === "light" ? "dark" : "light"]; });
    window.dispatchEvent(new CustomEvent("samuka:theme", { detail: { theme: currentMode(), skin: currentSkin(), user: !!(opts && opts.user), changed: opts && opts.changed } }));
  }
  function setMode(m, opts) {
    root.dataset.theme = m === "light" ? "light" : "dark";
    if (!opts || opts.persist !== false) store.set("samuka-theme", root.dataset.theme);
    paintTheme({ user: opts && opts.user, changed: "mode" });
  }
  function setSkin(s, opts) {
    if (!canUseSkin(s)) s = "phthalo";
    if (s === "phthalo") delete root.dataset.skin; else root.dataset.skin = s;
    if (!opts || opts.persist !== false) store.set("samuka-skin", s);
    paintTheme({ user: opts && opts.user, changed: "skin" });
  }
  // backwards compatible entry point: dark/light set the mode, a skin name sets the skin
  function setTheme(t, opts) {
    if (t === "dark" || t === "light") return setMode(t, opts);
    return setSkin(t, opts);
  }
  // the head script already applied stored values; a stored special skin waits for auth.js to confirm the role
  paintTheme();
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-toggle-theme]")) setMode(currentMode() === "light" ? "dark" : "light", { user: true });
  });

  /* ---------- cursor spotlight ---------- */
  var spot = $(".spotlight"), spotQueued = false, mx = 0, my = 0;
  if (spot && !reduced) {
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (spotQueued) return;
      spotQueued = true;
      requestAnimationFrame(function () {
        spot.style.setProperty("--mx", mx + "px");
        spot.style.setProperty("--my", my + "px");
        spotQueued = false;
      });
    }, { passive: true });
  }

  /* ---------- boot sequence ---------- */
  function boot() {
    var el = $("#boot"), log = $("#boot-log");
    if (!el || reduced || store.sget("samuka-booted")) return Promise.resolve();
    store.sset("samuka-booted", "1");
    el.classList.add("is-on");
    document.documentElement.style.overflow = "hidden";
    var ide = document.querySelector(".ide"), lobby = !!(ide && ide.getAttribute("data-page") === "lobby");
    var now = new Date();
    var stamp = now.toISOString().replace("T", " ").slice(0, 19);
    var lines = [
      ['<span class="b-ruby">$</span> <span class="b-hi">bin/rails server -e production</span>', 260],
      ['=> Booting Puma', 90],
      ['=> Rails application <span class="b-hi">Samuka</span> starting in <span class="b-ok">production</span>', 90],
      ['=> Run <span class="b-dim">`bin/rails server --help`</span> for more startup options', 70],
      ['Puma starting in single mode...', 120],
      ['* Ruby version: ruby 3.3 (+YJIT)', 50],
      ['*  Min threads: 3, max threads: 3', 50],
      ['*  Environment: production', 50],
      ['*  Experience: <span class="b-ok">' + years + ' years</span> in healthcare backends', 90],
      ['* Listening on <span class="b-hi">https://georgesamo.github.io</span>', 160],
      ['<span class="b-dim">Use Ctrl-C to stop</span>', 120],
      ['Started GET "/" for <span class="b-hi">you</span> at ' + stamp, 90],
      lobby ? ['Processing by <span class="b-ok">ArcadeController#lobby</span> as HTML', 90] : ['Processing by <span class="b-ok">PortfolioController#show</span> as HTML', 90],
      lobby ? ['  Rendered arcade/lobby.rb, games/sidekiq_rush.rb, games/gem_match.rb, leaderboards.yml', 110] : ['  Rendered app/models/samuka.rb, log/career.log, Gemfile, db/migrate', 110],
      ['<span class="b-ok">Completed 200 OK</span> in 42ms (Views: 12.4ms | ActiveRecord: 0.0ms | Allocations: 2048)', 380]
    ];
    var skipped = false;
    return new Promise(function (resolve) {
      function finish() {
        if (finish.done) return; finish.done = true;
        window.removeEventListener("keydown", skip);
        el.removeEventListener("pointerdown", skip);
        el.classList.add("is-leaving");
        document.documentElement.style.overflow = "";
        setTimeout(function () { el.classList.remove("is-on", "is-leaving"); el.remove(); }, 950);
        resolve();
      }
      function skip() { skipped = true; finish(); }
      window.addEventListener("keydown", skip);
      el.addEventListener("pointerdown", skip);
      (async function () {
        for (var i = 0; i < lines.length && !skipped; i++) {
          log.innerHTML = log.innerHTML.replace('<span class="caret"></span>', "") + lines[i][0] + "\n" + '<span class="caret"></span>';
          await wait(lines[i][1]);
        }
        if (!skipped) finish();
      })();
    });
  }

  /* ---------- scramble name ---------- */
  function scramble(el) {
    var target = el.getAttribute("data-scramble");
    if (reduced) { el.textContent = target; return; }
    var glyphs = "<>/{}[]=+*#$%&_01";
    var frame = 0, total = 34;
    function tick() {
      var out = "";
      for (var i = 0; i < target.length; i++) {
        var settle = 8 + i * 4;
        if (frame >= settle) out += esc(target[i]);
        else out += '<span class="scr">' + esc(glyphs[(Math.random() * glyphs.length) | 0]) + "</span>";
      }
      el.innerHTML = out;
      if (++frame <= total) setTimeout(function () { requestAnimationFrame(tick); }, 34);
      else el.textContent = target;
    }
    tick();
  }

  /* ---------- typewriter (line-by-line clip) ---------- */
  function prepareTyping(pre) {
    var d = 0;
    $$(".ln", pre).forEach(function (ln) {
      var n = Math.max(1, ln.textContent.length);
      ln.style.setProperty("--n", n);
      ln.style.setProperty("--d", d + "ms");
      d += n * 22 + 70;
    });
  }

  /* ---------- reveal on scroll ---------- */
  var revealIO = null;
  function setupReveal() {
    $$(".migrations, .gitlog__list").forEach(function (group) {
      $$(".reveal", group).forEach(function (el, i) { el.style.setProperty("--rd", Math.min(i * 70, 420) + "ms"); });
    });
    if (!("IntersectionObserver" in window)) { $$(".reveal").forEach(function (el) { el.classList.add("is-in"); }); return; }
    if (revealIO) revealIO.disconnect();
    var io = revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        var typer = en.target.querySelector(".code[data-type]");
        if (typer) typer.classList.add("is-typing");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  }

  /* ---------- scroll spy: tab name, tree, status bar ---------- */
  var sections = [], tabName = null, tabCrumbs = null, tabIcon = null, statusFile = null, statusPos = $("[data-status-pos]"), spy = null;
  function setActive(sec) {
    var file = sec.getAttribute("data-file");
    var parts = file.split("/");
    if (tabName) tabName.textContent = parts[parts.length - 1];
    if (tabCrumbs) tabCrumbs.textContent = parts.join(" › ");
    if (tabIcon) tabIcon.className = "fi fi--" + sec.getAttribute("data-icon");
    if (statusFile) statusFile.textContent = file;
    $$("[data-nav]").forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("data-nav") === sec.id); });
  }
  function initSpy() {
    sections = $$("[data-file]");
    tabName = $("[data-tab-name]"); tabCrumbs = $("[data-tab-crumbs]"); tabIcon = $("[data-tab-icon]"); statusFile = $("[data-status-file]");
    if (spy) spy.disconnect();
    if (!("IntersectionObserver" in window)) return;
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }
  var posQueued = false;
  function onScroll() {
    if (posQueued) return; posQueued = true;
    requestAnimationFrame(function () {
      posQueued = false;
      var ed = document.querySelector(".editor");
      var ln = Math.floor(Math.max(window.scrollY, ed ? ed.scrollTop : 0) / 23) + 1;
      if (statusPos) statusPos.textContent = "Ln " + ln + ", Col " + ((ln * 7) % 41 + 1);
      drawGraphProgress();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  // phones scroll inside .editor (see hub.css)
  var edEl = document.querySelector(".editor"); if (edEl) edEl.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- git graph ---------- */
  var gitlog = null, paths = [], lens = [0, 0], gitRO = null;
  function laneX(lane) {
    var cs = getComputedStyle(document.documentElement);
    return parseFloat(cs.getPropertyValue(lane ? "--lane1" : "--lane0")) || (lane ? 44 : 18);
  }
  function dotY(li) {
    var dot = $(".commit__dot", li);
    var gr = gitlog.getBoundingClientRect(), dr = dot.getBoundingClientRect();
    return dr.top + dr.height / 2 - gr.top;
  }
  function buildGraph() {
    if (!gitlog) return;
    var commits = $$(".commit", gitlog);
    if (!commits.length) return;
    var x0 = laneX(0), x1 = laneX(1);
    var main = commits.filter(function (c) { return c.getAttribute("data-lane") === "0"; });
    var branch = commits.filter(function (c) { return c.getAttribute("data-lane") === "1"; });
    var top = dotY(main[0]), root = dotY(main[main.length - 1]);
    var dMain = "M" + x0 + " " + top + " L" + x0 + " " + root;
    var dBranch = "";
    if (branch.length) {
      var bTop = dotY(branch[0]), bBot = dotY(branch[branch.length - 1]);
      // leave the merge commit, settle into lane 1 right below it, run down, fork back into the root
      var out = Math.min(46, (bTop - top) * 0.8), back = Math.max(12, root - bBot);
      dBranch = "M" + x0 + " " + top +
        " C" + x0 + " " + (top + out * 0.55) + " " + x1 + " " + (top + out * 0.45) + " " + x1 + " " + (top + out) +
        " L" + x1 + " " + bBot +
        " C" + x1 + " " + (bBot + back * 0.55) + " " + x0 + " " + (root - back * 0.45) + " " + x0 + " " + root;
    }
    paths[0].setAttribute("d", dMain); paths[2].setAttribute("d", dMain);
    paths[1].setAttribute("d", dBranch); paths[3].setAttribute("d", dBranch);
    lens = [paths[0].getTotalLength(), dBranch ? paths[1].getTotalLength() : 0];
    [0, 1].forEach(function (i) { paths[i].style.strokeDasharray = lens[i] + " " + lens[i]; });
    drawGraphProgress();
  }
  function drawGraphProgress() {
    if (!gitlog || !lens[0]) return;
    var r = gitlog.getBoundingClientRect();
    var p = reduced ? 1 : Math.min(1, Math.max(0, (window.innerHeight * 0.72 - r.top) / r.height));
    paths[0].style.strokeDashoffset = lens[0] * (1 - p);
    if (lens[1]) paths[1].style.strokeDashoffset = lens[1] * (1 - p);
  }
  // rebuilding measures every commit; do it once the window stops resizing, not on every event
  var graphTimer = 0;
  window.addEventListener("resize", function () { clearTimeout(graphTimer); graphTimer = setTimeout(buildGraph, 150); });
  function initGitlog() {
    gitlog = $("#gitlog"); paths = gitlog ? $$("path", gitlog) : []; lens = [0, 0];
    if (gitRO) { gitRO.disconnect(); gitRO = null; }
    if (!gitlog) return;
    if ("ResizeObserver" in window) { gitRO = new ResizeObserver(function () { buildGraph(); }); gitRO.observe(gitlog); }
    gitlog.addEventListener("click", function (e) {
      var head = e.target.closest("button.commit__head");
      if (!head) return;
      var li = head.parentElement;
      var open = !li.classList.contains("is-open");
      li.classList.toggle("is-open", open);
      head.setAttribute("aria-expanded", String(open));
    });
    gitlog.addEventListener("transitionend", function (e) { if (e.propertyName === "grid-template-rows") buildGraph(); });
  }

  /* ---------- gem trace ---------- */
  var ALIASES = {
    "ruby": ["ruby"], "ruby on rails": ["ruby on rails", "rails"], "backend development": ["backend"],
    "object-oriented programming": ["oop", "object-oriented", "service objects", "models"],
    "javascript": ["javascript"], "node.js": ["node"], "express.js": ["express"],
    "postgresql": ["postgresql"], "microsoft sql server": ["microsoft sql server"], "sql": ["sql", "quer"],
    "database design": ["database models", "database changes", "data structures"], "database query optimization": ["query optimization", "indexing", "bottleneck"],
    "activerecord": ["activerecord"], "redis": ["redis"], "sidekiq": ["sidekiq", "background processing"], "elasticsearch": ["elasticsearch"], "docker": ["docker"],
    "software architecture": ["architecture", "technical planning"], "service-oriented architecture": ["service-oriented", "service objects", "services"],
    "rest api": ["rest api", "api endpoints", "apis"], "api development": ["api"], "hl7 fhir": ["fhir"],
    "system integration": ["integration"], "healthcare information systems": ["healthcare", "hospitals", "patient"],
    "rspec": ["rspec"], "test-driven development": ["rspec", "testing", "tests"], "git": ["git", "version control"],
    "refactoring": ["improved existing", "improvements", "continuous improvement"], "debugging": ["debugging", "fixed bugs", "investigat"],
    "performance optimization": ["optimiz", "performance", "latency", "response times"], "code review": ["code review"],
    "problem solving": ["resolved", "investigat", "fixed"], "team collaboration": ["collaborated", "worked closely", "teams"],
    "mentoring and leadership": ["mentor", "supported continuous"], "ai-assisted coding (claude)": []
  };
  var jobs = (data.experience || []);
  var traceBody = null;
  var hitLines = [];
  function regexFor(skill) {
    var terms = ALIASES[skill] || [skill];
    if (!terms.length) return null;
    return new RegExp("\\b(" + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")[\\w.-]*", "gi");
  }
  function clearTrace() {
    hitLines.forEach(function (p) { p.classList.remove("is-hit"); p.textContent = p.dataset.orig; });
    hitLines = [];
    $$(".commit.is-hit").forEach(function (c) { c.classList.remove("is-hit"); });
    $$(".gem.is-active").forEach(function (g) { g.classList.remove("is-active"); });
  }
  function trace(gemEl) {
    clearTrace();
    gemEl.classList.add("is-active");
    var skill = gemEl.getAttribute("data-skill");
    var label = gemEl.textContent.replace(/"/g, "");
    var re = regexFor(skill);
    var html = '<p class="gem-trace__name">gem "' + esc(label) + '"</p>';
    var total = 0;
    if (re) {
      $$(".commit--job").forEach(function (li) {
        var count = 0;
        $$(".diff__add", li).forEach(function (p) {
          if (!p.dataset.orig) p.dataset.orig = p.textContent;
          re.lastIndex = 0;
          if (re.test(p.dataset.orig)) {
            re.lastIndex = 0;
            p.innerHTML = esc(p.dataset.orig).replace(re, "<mark>$&</mark>");
            p.classList.add("is-hit"); hitLines.push(p); count++;
          }
        });
        if (count) {
          li.classList.add("is-hit"); total += count;
          var job = jobs.filter(function (j) { return j.id === li.getAttribute("data-id"); })[0] || {};
          html += '<span class="gem-trace__hit"><span class="commit__hash">' + esc(job.hash || "") + "</span>" + esc(job.company || "") + ' · <span class="gem-trace__count">' + count + " line" + (count > 1 ? "s" : "") + "</span><br><span class=\"muted\">" + esc(job.role || "") + "</span></span>";
        }
      });
    }
    if (!total) {
      html += skill.indexOf("claude") > -1
        ? '<p>Freshly added to the toolbox: pairing with Claude to explore code, write specs and ship refactors faster, with human review on every line.</p>'
        : '<p class="muted">Not in the commit log, but used in day-to-day work.</p>';
    } else {
      html += '<p class="muted" style="margin-top:8px">' + total + " matching line" + (total > 1 ? "s" : "") + " highlighted in the career log ↑</p>" +
        '<button class="btn gem-trace__jump" type="button" data-trace-jump>show in career log ↑</button>';
    }
    if (traceBody) traceBody.outerHTML = '<div data-trace-body>' + html + "</div>";
    traceBody = $("[data-trace-body]");
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest("[data-trace-jump]")) return;
    var first = $(".commit.is-hit"); if (!first) return;
    if (!first.classList.contains("is-open")) $("button.commit__head", first).click();
    first.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  });
  function initGems() {
  traceBody = $("[data-trace-body]"); hitLines = [];
  $$(".gem").forEach(function (g) {
    var downAt = null;
    g.addEventListener("pointerdown", function (e) { downAt = [e.clientX, e.clientY]; }, { passive: true });
    g.addEventListener("mouseenter", function () { trace(g); });
    g.addEventListener("focus", function () { trace(g); });
    // a tap only fills the trace box; it never moves the page (a swipe that starts on a gem must just scroll)
    g.addEventListener("click", function (e) {
      if (downAt && Math.abs(e.clientX - downAt[0]) + Math.abs(e.clientY - downAt[1]) > 8) return;
      trace(g);
    });
  });
  }

  /* ---------- bundle install ---------- */
  function ver(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % 7 + 1) + "." + (h % 13) + "." + (h % 5); }
  function initBundle() {
  var bundleBtn = $("[data-bundle]"), bundleOut = $("[data-bundle-out]");
  if (bundleBtn) bundleBtn.addEventListener("click", async function () {
    if (bundleBtn.disabled) return;
    bundleBtn.disabled = true;
    var gems = $$(".gem");
    bundleOut.hidden = false;
    bundleOut.innerHTML = "Fetching gem metadata from https://georgesamo.github.io/" ;
    for (var d = 0; d < 6; d++) { await wait(reduced ? 0 : 70); bundleOut.innerHTML += "."; }
    bundleOut.innerHTML += "\nResolving dependencies...\n";
    for (var i = 0; i < gems.length; i++) {
      var g = gems[i], name = g.textContent.replace(/"/g, "");
      g.classList.add("is-installing");
      bundleOut.innerHTML += "Installing " + esc(name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")) + " " + ver(name) + "\n";
      bundleOut.scrollTop = bundleOut.scrollHeight;
      await wait(reduced ? 0 : 55);
      g.classList.remove("is-installing"); g.classList.add("is-installed");
    }
    bundleOut.innerHTML += '<span class="ok">Bundle complete! ' + gems.length + " Gemfile dependencies, " + gems.length + " gems now installed.</span>\nUse `bundle info [gemname]` to see where a bundled gem is installed.";
    bundleOut.scrollTop = bundleOut.scrollHeight;
    setTimeout(function () { gems.forEach(function (g) { g.classList.remove("is-installed"); }); bundleBtn.disabled = false; }, 800);
  });
  }

  /* ---------- contact form ---------- */
  var form = null, resp = null;
  function showResponse(html) { resp.hidden = false; resp.innerHTML = html; }
  function initForm() {
  form = $("#contact-form"); resp = form && $("[data-response]", form);
  if (form) form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = form.elements;
    var name = f.name.value.trim(), email = f.email.value.trim(), msg = f.message.value.trim();
    [f.name, f.email, f.message].forEach(function (i) { i.classList.remove("is-invalid"); });
    var bad = [];
    if (!name) bad.push(f.name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad.push(f.email);
    if (msg.length < 2) bad.push(f.message);
    if (bad.length) {
      bad.forEach(function (i) { i.classList.add("is-invalid"); });
      bad[0].focus();
      showResponse('<span class="err">HTTP/1.1 422 Unprocessable Content</span>\n{ "errors": [' + bad.map(function (i) { return '"' + i.name + ' is invalid"'; }).join(", ") + "] }");
      return;
    }
    if (f._honey.value) return;
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    showResponse('<span class="pending">→ sending request…</span>');
    try {
      var res = await fetch(window.SITE.contactEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ name: name, email: email, message: msg, _subject: "New message from georgesamo.github.io", _template: "box", _captcha: "false" })
      });
      var body = {};
      try { body = await res.json(); } catch (x) {}
      if (!res.ok || String(body.success) === "false") throw new Error(body.message || ("HTTP " + res.status));
      showResponse('<span class="ok">HTTP/1.1 201 Created</span>\nContent-Type: application/json\n\n{\n  "status": "delivered",\n  "from": "' + esc(name) + '",\n  "reply_eta": "usually within a day"\n}');
      form.reset();
    } catch (err) {
      showResponse('<span class="err">HTTP/1.1 503 Service Unavailable</span>\n{ "error": "' + esc(err.message) + '" }\n\nThe mail relay didn\'t answer. Please email <a href="mailto:' + esc(data.person.email) + '">' + esc(data.person.email) + "</a> directly.");
    } finally { btn.disabled = false; }
  });
  }

  /* ---------- public API (used by terminal.js / gem.js) ---------- */
  window.Samuka = {
    data: data, years: years, reduced: reduced,
    setTheme: setTheme, setMode: setMode, setSkin: setSkin,
    theme: currentMode, mode: currentMode, skin: currentSkin, skins: SKINS,
    availableSkins: availableSkins, canUseSkin: canUseSkin,
    canUseTheme: function (t) { return t === "dark" || t === "light" || canUseSkin(t); },
    go: function (id) {
      var el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); return; }
      // the section lives on the other page: arcade hub (/) or the creator's profile (/samuka/)
      var hub = { lobby: 1, games: 1, boards: 1, wall: 1, arcade: 1 };
      var to = hub[id] ? "/#" + (id === "arcade" ? "games" : id) : "/samuka/#" + (id === "hero" ? "" : id);
      if (window.SamukaNav) window.SamukaNav.go(to); else location.href = to;
    },
    focusContact: function () {
      if (!form) {
        if (window.SamukaNav) { window.SamukaNav.go("/samuka/#contact"); window.addEventListener("samuka:page", function () { setTimeout(function () { form && form.elements.name.focus({ preventScroll: true }); }, 400); }, { once: true }); }
        else location.href = "/samuka/#contact";
        return;
      } this.go("contact"); setTimeout(function () { form && form.elements.name.focus({ preventScroll: true }); }, reduced ? 0 : 650); }
  };

  /* ---------- page parts (re-run after a seamless page switch) ---------- */
  function initPage() {
    $$("[data-years]").forEach(function (el) { el.textContent = years; });
    $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
    $$(".code[data-type]").forEach(prepareTyping);
    initSpy(); initGitlog(); initGems(); initBundle(); initForm();
  }
  initPage();
  window.addEventListener("samuka:page", function () {
    initPage();
    setupReveal();
    $$("[data-scramble]").forEach(scramble);
    requestAnimationFrame(buildGraph);
    // the hero gem lives on the profile page: start a fresh one for the new canvas
    var g = document.getElementById("gem-canvas");
    if (g && !g.__gem) { var s = document.createElement("script"); s.src = "/assets/js/gem.js"; document.body.appendChild(s); }
  });

  /* ---------- go ---------- */
  boot().then(function () {
    setupReveal();
    // phones scroll inside .editor, where the browser doesn't apply #anchors on load by itself
    if (location.hash && window.matchMedia("(max-width: 860px)").matches) {
      var hashTarget = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (hashTarget) setTimeout(function () { hashTarget.scrollIntoView({ behavior: "instant", block: "start" }); }, 60);
    }
    $$("[data-scramble]").forEach(scramble);
    buildGraph();
    window.dispatchEvent(new Event("samuka:ready"));
    window.__samukaReady = true;
  });
})();
