/* Regex Golf · match every green word, none of the red ones, in as few characters as you can.
 * Free play: 15 holes, score per hole = 100 + 10 × (par − your length), min 10.
 * Daily: one hole per day (same for everyone); score = 1000 − 10 × length.
 * Patterns run in your own browser only; length is capped to keep things fast.
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var MAX = 60;
  // par = length of a known solution (verified by an automated check)
  var HOLES = [
    { name: "snake_case", hit: ["created_at", "user_id", "line_items", "has_many"], miss: ["createdAt", "userId", "LineItems", "hasMany"], par: 1 },
    { name: "bang or ask", hit: ["save!", "valid?", "update!", "admin?"], miss: ["save", "valid", "update_all", "admin"], par: 4 },
    { name: "route params", hit: ["/users/:id", "/posts/:post_id/comments", "/orders/:id/edit"], miss: ["/users", "/posts/new", "/orders/index", ":id"], par: 2 },
    { name: "controllers", hit: ["UsersController", "PostsController", "OrdersController", "ApplicationController"], miss: ["User", "Post", "Order", "ApplicationRecord", "controller_path"], par: 4 },
    { name: "instance vars", hit: ["@user", "@posts", "@current_user"], miss: ["user", "posts", "@@count", "current_user"], par: 4 },
    { name: "background jobs", hit: ["SyncPatientJob", "SendInvoiceJob", "ReindexJob"], miss: ["Job", "JobRunner", "SyncPatient", "jobs"], par: 5 },
    { name: "double letters", hit: ["cookie", "coffee", "rubber", "address"], miss: ["code", "ruby", "rails", "deploy"], par: 5 },
    { name: "migration files", hit: ["20241105_add_index", "20230101_create_users", "20250630_drop_orders"], miss: ["add_index", "create_users_2023", "v2_drop_orders", "2024_add"], par: 5 },
    { name: "email-ish", hit: ["ana@clinic.ge", "ops@vian.io", "nino@pm.dev"], miss: ["ana@", "@vian.io", "nino.pm.dev", "ops@@vian.io"], par: 5 },
    { name: "env vars", hit: ["DATABASE_URL", "REDIS_URL", "SECRET_KEY_BASE", "RAILS_ENV"], miss: ["database_url", "RailsEnv", "redis", "SECRET"], par: 8 },
    { name: "happy statuses", hit: ["200", "201", "204", "304"], miss: ["404", "500", "422", "301"], par: 7 },
    { name: "HTTP verbs", hit: ["GET", "POST", "PATCH", "PUT", "DELETE"], miss: ["get", "post", "Put", "OPTIONS", "HEAD"], par: 11 },
    { name: "ISO dates", hit: ["2026-11-08", "1999-01-31", "2024-02-29"], miss: ["2026/11/08", "08-11-2026", "2026-1-8", "20261108"], par: 10 },
    { name: "semver", hit: ["7.1.3", "3.3.0", "1.10.12"], miss: ["7.1", "3.3", "v2", "1.2.3.4"], par: 15 },
    { name: "hex colours", hit: ["#123524", "#fff", "#E5383B"], miss: ["123524", "#ggg", "#12345", "red"], par: 20 }
  ];
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function dayNo() { return Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.UTC(2026, 10, 8)) / 864e5) + 1; }

  function test(src, hole) {
    var re = null, err = null;
    if (src) { try { re = new RegExp(src); } catch (e) { err = e.message.replace(/^Invalid regular expression: /, ""); } }
    var hits = hole.hit.map(function (w) { return !!(re && re.test(w)); });
    var miss = hole.miss.map(function (w) { return !!(re && re.test(w)); });
    var ok = !!re && hits.every(Boolean) && !miss.some(Boolean);
    return { re: re, err: err, hits: hits, miss: miss, ok: ok };
  }
  function mark(word, re) {
    if (!re) return esc(word);
    var m = word.match(re);
    if (!m || !m[0]) return esc(word);
    var i = m.index;
    return esc(word.slice(0, i)) + "<mark>" + esc(m[0]) + "</mark>" + esc(word.slice(i + m[0].length));
  }

  window.SamukaArcade.register("regex", {
    title: "regex-golf.rb",
    blurb: "Match the green words, skip the red ones, in as few characters as you can.",
    mount: function (stage, api) {
      var daily = api.mode === "daily";
      var order = daily ? [HOLES[(dayNo() * 7 + 3) % HOLES.length]] : HOLES.slice();   // daily walks the course in a scattered order
      var idx = 0, total = 0, results = [], best = api.peekBest(), done = false;
      stage.innerHTML = '<div class="rg"><div class="rg__head" data-head></div>' +
        '<label class="rg__input"><span class="rg__slash">/</span><input data-re spellcheck="false" autocomplete="off" autocapitalize="off" maxlength="' + MAX + '" aria-label="Your regular expression" placeholder="type a pattern"><span class="rg__slash">/</span><b data-len>0</b></label>' +
        '<p class="rg__err" data-err role="alert"></p>' +
        '<div class="rg__cols"><div><p class="rg__col rg__col--hit">must match</p><ul data-hit></ul></div><div><p class="rg__col rg__col--miss">must not match</p><ul data-miss></ul></div></div>' +
        '<div class="rg__actions"><button class="btn btn--primary" type="button" data-submit disabled>⛳ hole out</button>' + (daily ? "" : '<button class="btn" type="button" data-skip>skip (0)</button>') + "</div></div>";
      api.foot('<span>JavaScript regex, no flags. <code>^</code> start, <code>$</code> end, <code>\\d</code> digit, <code>\\w</code> word char, <code>[abc]</code>, <code>(a|b)</code>, <code>x{2}</code>, <code>(.)\\1</code> repeat. Shorter = more points.</span>');
      var input = stage.querySelector("[data-re]");

      function hole() { return order[idx]; }
      function paint() {
        var h = hole(), src = input.value, r = test(src, h);
        stage.querySelector("[data-head]").innerHTML = daily
          ? '<p class="arcade__kicker">$ rails regex:daily[' + new Date().toISOString().slice(0, 10) + "] · #" + dayNo() + '</p><h3 class="rg__title">' + esc(h.name) + ' <span class="muted">par ' + h.par + "</span></h3>"
          : '<p class="arcade__kicker">hole ' + (idx + 1) + " / " + order.length + '</p><h3 class="rg__title">' + esc(h.name) + ' <span class="muted">par ' + h.par + "</span></h3>";
        stage.querySelector("[data-len]").textContent = src.length;
        stage.querySelector("[data-err]").textContent = r.err ? "✗ " + r.err : "";
        stage.querySelector("[data-hit]").innerHTML = h.hit.map(function (w, i) { return '<li class="' + (r.hits[i] ? "is-ok" : "is-bad") + '"><span>' + (r.hits[i] ? "✓" : "·") + "</span>" + mark(w, r.re) + "</li>"; }).join("");
        stage.querySelector("[data-miss]").innerHTML = h.miss.map(function (w, i) { return '<li class="' + (r.miss[i] ? "is-bad" : "is-ok") + '"><span>' + (r.miss[i] ? "✗" : "✓") + "</span>" + mark(w, r.re) + "</li>"; }).join("");
        stage.querySelector("[data-submit]").disabled = !r.ok;
        stage.querySelector(".rg").classList.toggle("is-solved", r.ok);
        var pts = daily ? Math.max(10, 1000 - 10 * src.length) : Math.max(10, 100 + 10 * (h.par - src.length));
        api.hud(daily ? "<span>length <b>" + src.length + "</b></span><span>score <b>" + (r.ok ? pts : 0) + "</b></span>"
          : "<span>score <b>" + total + "</b></span><span>hole <b>" + (idx + 1) + "/" + order.length + '</b></span><span class="hide-sm">best <b>' + Math.max(best, total) + "</b></span>");
        return { r: r, pts: pts };
      }
      function holeOut(skip) {
        if (done) return;
        var h = hole(), state = paint(), len = input.value.length;
        if (!skip && !state.r.ok) return;
        var pts = skip ? 0 : state.pts;
        total += pts;
        results.push({ name: h.name, len: skip ? null : len, par: h.par, pts: pts, src: skip ? "" : input.value });
        if (!skip && len <= h.par) { api.toast((len < h.par ? "under par! " : "par · ") + "+" + pts, "ok"); api.emit("par"); }
        else if (!skip) api.toast("holed out · +" + pts, "ok");
        if (daily || idx === order.length - 1) return finish();
        idx++; input.value = ""; paint(); input.focus();
      }
      function finish() {
        done = true;
        var b = api.best(total, { holes: results.length, daily: daily });
        if (daily) {
          var r0 = results[0], text = "Regex Golf daily #" + dayNo() + " · " + r0.len + " chars (par " + r0.par + ") ⛳\nhttps://georgesamo.github.io/#games";
          api.overlay('<p class="arcade__kicker">$ rails regex:daily · done</p><h3>' + r0.len + " characters · " + total + " pts</h3>" +
            '<pre class="daily__grid">/' + esc(r0.src) + "/</pre>" +
            '<button class="btn btn--primary" type="button" data-daily-share data-text="' + esc(text) + '">⧉ copy result</button><div class="lb-mini" data-lb-mini="regex"></div>');
          setTimeout(function () { if (window.SamukaScores) window.SamukaScores.fillMini && window.SamukaScores.fillMini("regex", "daily"); }, 60);
          return;
        }
        api.overlay('<p class="arcade__kicker">$ rails regex:golf · 18th green</p><h3>' + (total >= 1500 ? "Regex wizard" : total >= 1000 ? "Under control" : "Course complete") + "</h3>" +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + total + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>best</dt><dd>" + b.best + "</dd><dt>holes at par or better</dt><dd>" +
          results.filter(function (x) { return x.len != null && x.len <= x.par; }).length + " / " + results.length + "</dd></dl>" +
          '<div class="lb-mini" data-lb-mini="regex"></div><button class="btn btn--primary" type="button" data-rg-start>↻ new round</button>');
      }
      function start() { idx = 0; total = 0; results = []; done = false; input.value = ""; api.clearOverlay(); paint(); input.focus(); }
      function intro() {
        paint();
        if (daily) {
          api.overlay('<p class="arcade__kicker">$ rails regex:daily</p><h3>Daily hole #' + dayNo() + "</h3><p>Same puzzle for everyone today. Match all green words, none of the red ones. One submission; shorter scores more.</p>" +
            '<button class="btn btn--primary" type="button" data-rg-start>▶ tee off</button>');
        } else {
          api.overlay('<p class="arcade__kicker">$ gem install regex-golf</p><h3>Regex Golf</h3><p>15 holes. Write a pattern that matches every <b class="ok">green</b> word and none of the <b class="err">red</b> ones.</p>' +
            "<p class=\"muted\">Each hole has a par (a known solution's length). Beat it for bonus points: score = 100 + 10 × (par − length).</p>" +
            '<button class="btn btn--primary" type="button" data-rg-start>▶ tee off</button>');
        }
      }
      function onClick(e) {
        if (e.target.closest("[data-rg-start]")) return start();
        if (e.target.closest("[data-submit]")) return holeOut(false);
        if (e.target.closest("[data-skip]")) return holeOut(true);
      }
      function onInput() { if (!done) paint(); }
      stage.addEventListener("click", onClick);
      input.addEventListener("input", onInput);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); holeOut(false); } });
      intro();
      return {
        key: function () {},
        destroy: function () { stage.removeEventListener("click", onClick); },
        _debug: { holes: HOLES, test: test }
      };
    }
  });
  window.SamukaRegexGolf = { holes: HOLES, test: test };
})();
