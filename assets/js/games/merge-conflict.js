/* Merge Conflict · resolve conflicts before the two sides collide
 *
 * Each round: HEAD vs the incoming branch, one line each, with their commit
 * messages. Pick ← keep HEAD, → keep incoming, ↑ keep both, before the fuse
 * runs out. Faster answers and streaks score more; three bad merges and the
 * merge fails. Live 2-player: the same 15 conflicts for both players.
 */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  // a: which resolution is right: "head" | "in" | "both"
  var BANK = [
    { h: ["fix: stop SQL injection", 'User.where(name: params[:q])'], i: ["feat: search users", "User.where(\"name = '#{params[:q]}'\")"], a: "head", why: "Incoming builds SQL from user input: injection risk." },
    { h: ["feat: audit log", "AuditLog.create!(user: current_user)"], i: ["feat: send receipt", "ReceiptMailer.with(order:).deliver_later"], a: "both", why: "Two independent additions: keep both." },
    { h: ["chore: tidy Gemfile", 'gem "rails", "~> 7.1"'], i: ["chore: upgrade to Rails 8", 'gem "rails", "~> 8.0"'], a: "in", why: "The incoming branch exists to do the upgrade." },
    { h: ["refactor: tidy associations", "has_many :coments"], i: ["fix: typo in association", "has_many :comments"], a: "in", why: "HEAD still has the typo." },
    { h: ["perf: index user_id", "add_index :orders, :user_id"], i: ["feat: order status", "add_column :orders, :status, :string"], a: "both", why: "Separate schema changes: keep both." },
    { h: ["security: filter passwords", "config.filter_parameters += [:password]"], i: ["security: filter tokens", "config.filter_parameters += [:token]"], a: "both", why: "Both filters are needed in the logs." },
    { h: ["fix: time zones", "Time.current"], i: ["wip: timestamps", "Time.now"], a: "head", why: "Time.current respects the app's time zone." },
    { h: ["debug: inspect order", "binding.irb"], i: ["feat: welcome email", "WelcomeMailer.with(user:).deliver_later"], a: "in", why: "Never ship a debugger breakpoint." },
    { h: ["feat: payments", 'API_KEY = "sk_live_9f8a2c71d0"'], i: ["fix: read key from env", 'API_KEY = ENV.fetch("API_KEY")'], a: "in", why: "HEAD hard-codes a live secret." },
    { h: ["fix: show 10 items", "items.first(10)"], i: ["refactor: slicing", "items[0..10]"], a: "head", why: "0..10 is eleven items." },
    { h: ["feat: retries", "sidekiq_options retry: 5"], i: ["feat: critical queue", "sidekiq_options queue: :critical"], a: "both", why: "Sidekiq merges the options: keep both." },
    { h: ["fix: strong params", "params.require(:user).permit(:name, :email)"], i: ["feat: profile form", "params.require(:user).permit!"], a: "head", why: "permit! allows mass-assigning anything, even admin flags." },
    { h: ["feat: email presence", "validates :email, presence: true"], i: ["feat: email uniqueness", "validates :email, uniqueness: true"], a: "both", why: "Two different validations: keep both." },
    { h: ["test: focus on card spec", 'fit "charges the card" do'], i: ["test: card spec", 'it "charges the card" do'], a: "in", why: "fit focuses one spec and silently skips the rest." },
    { h: ["fix: escape comments", "<%= comment.body %>"], i: ["feat: rich comments", "<%= comment.body.html_safe %>"], a: "head", why: "html_safe on user input is an XSS hole." },
    { h: ["fix: enforce https", "config.force_ssl = true"], i: ["debug: local ssl issue", "config.force_ssl = false"], a: "head", why: "Don't switch HTTPS off in production for a local bug." },
    { h: ["feat: invoices", "resources :invoices"], i: ["feat: payments", "resources :payments"], a: "both", why: "Two new routes: keep both." },
    { h: ["chore: ruby 3.3", 'ruby "3.3.6"'], i: ["feat: billing (branched 2 years ago)", 'ruby "3.1.2"'], a: "head", why: "The old branch carries a stale Ruby version." },
    { h: ["perf: send email in background", "UserMailer.welcome(user).deliver_later"], i: ["feat: welcome flow", "UserMailer.welcome(user).deliver_now"], a: "head", why: "deliver_now blocks the web request." },
    { h: ["feat: payment log", 'Rails.logger.info("paid #{order.id}")'], i: ["debug", "puts order.inspect"], a: "head", why: "puts debugging doesn't belong in production." },
    { h: ["fix: email required", "t.string :email, null: false"], i: ["feat: users table", "t.string :email"], a: "head", why: "Keep the NOT NULL constraint." },
    { h: ["feat: active scope", "scope :active, -> { where(active: true) }"], i: ["feat: recent scope", "scope :recent, -> { order(created_at: :desc) }"], a: "both", why: "Two different scopes: keep both." },
    { h: ["fix: rescue missing record", "rescue ActiveRecord::RecordNotFound"], i: ["wip: stop crashes", "rescue Exception"], a: "head", why: "rescue Exception swallows everything, even shutdown signals." },
    { h: ["feat: FHIR patients", 'resource_type: "Patient"'], i: ["style: lowercase", 'resource_type: "patient"'], a: "head", why: "FHIR resource types are case-sensitive." },
    { h: ["docs: setup", "## Setup"], i: ["docs: deploy", "## Deploy"], a: "both", why: "Two new README sections: keep both." },
    { h: ["feat: cache prices", "Rails.cache.fetch(key) { compute }"], i: ["fix: cache expiry", "Rails.cache.fetch(key, expires_in: 1.hour) { compute }"], a: "in", why: "Without expiry the cached prices go stale forever." },
    { h: ["feat: N+1 fix", "@posts = Post.includes(:author)"], i: ["revert: simplify", "@posts = Post.all"], a: "head", why: "includes avoids one query per author." },
    { h: ["feat: soft delete", "default_scope { where(deleted_at: nil) }"], i: ["feat: archive", "scope :archived, -> { where.not(archived_at: nil) }"], a: "both", why: "Independent additions: keep both." },
    { h: ["feat: env config", 'ENV.fetch("REDIS_URL")'], i: ["feat: redis", 'ENV["REDIS_URL"]'], a: "head", why: "fetch fails loudly when the variable is missing." }
  ];
  var KEYS = { ArrowLeft: "head", a: "head", A: "head", ArrowRight: "in", d: "in", D: "in", ArrowUp: "both", w: "both", W: "both", b: "both", B: "both" };
  var LABEL = { head: "kept HEAD", "in": "kept incoming", both: "kept both" };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  window.SamukaArcade.register("merge", {
    title: "merge-conflict.rb",
    blurb: "Resolve merge conflicts before the two branches collide.",
    mount: function (stage, api) {
      var rng = api.rng, race = api.mode === "race" && api.opts.race, RACE_N = 15;
      var deck = [], cur = null, n = 0, score = 0, streak = 0, bestStreak = 0, strikes = 0, alive = false, locked = false, paused = false;
      var dur = 7000, t0 = 0, elapsed = 0, raf = 0, last = 0, best = api.peekBest();
      stage.innerHTML =
        '<div class="mc">' +
          '<p class="mc__file" data-file></p>' +
          '<div class="mc__arena">' +
            '<section class="mc__side mc__side--head" data-side="head"><p class="mc__mark">&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</p><p class="mc__msg" data-hmsg></p><pre class="mc__code" data-hcode></pre></section>' +
            '<div class="mc__fuse" aria-hidden="true"><i data-fuse></i></div>' +
            '<section class="mc__side mc__side--in" data-side="in"><p class="mc__mark">&gt;&gt;&gt;&gt;&gt;&gt;&gt; <span data-branch></span></p><p class="mc__msg" data-imsg></p><pre class="mc__code" data-icode></pre></section>' +
          "</div>" +
          '<p class="mc__why" data-why aria-live="polite"></p>' +
          '<div class="mc__pad"><button class="btn" type="button" data-pick="head">◀ keep HEAD</button><button class="btn" type="button" data-pick="both">▲ keep both</button><button class="btn" type="button" data-pick="in">keep incoming ▶</button></div>' +
        "</div>";
      api.foot("<span><kbd>←</kbd>/<kbd>A</kbd> keep HEAD · <kbd>↑</kbd>/<kbd>W</kbd> keep both · <kbd>→</kbd>/<kbd>D</kbd> keep incoming · <kbd>P</kbd> pause. Read the commit messages: they tell you what each side was trying to do.</span>");
      var $ = function (s) { return stage.querySelector(s); };
      var arena = $(".mc__arena");
      var FILES = ["app/models/user.rb", "app/controllers/orders_controller.rb", "config/application.rb", "Gemfile", "app/jobs/charge_job.rb", "db/schema.rb", "spec/models/order_spec.rb", "config/routes.rb", "app/views/comments/_comment.html.erb", "README.md"];
      var BRANCHES = ["feature/search", "feature/billing", "fix/hotfix-42", "chore/upgrade", "feature/fhir-sync", "nino/sprint-12", "feature/receipts"];

      function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (rng() * (i + 1)) | 0, x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
      function draw() { if (!deck.length) deck = shuffle(BANK.slice()); return deck.pop(); }
      function hud() {
        api.hud("<span>score <b>" + score + "</b></span><span>streak <b>" + streak + "</b></span><span>conflicts <b>" + n + (race ? "/" + RACE_N : "") + "</b></span><span>strikes <b" + (strikes ? ' class="low"' : "") + ">" + "✗".repeat(strikes) + "·".repeat(3 - strikes) + '</b></span><span class="hide-sm">best <b>' + Math.max(best, score) + "</b></span>");
        if (race) race.tick(score, n, strikes * 33);
      }
      function show() {
        cur = draw(); n++; elapsed = 0; locked = false;
        $("[data-file]").textContent = "CONFLICT (content): merge conflict in " + FILES[(rng() * FILES.length) | 0];
        $("[data-branch]").textContent = BRANCHES[(rng() * BRANCHES.length) | 0];
        $("[data-hmsg]").textContent = cur.h[0]; $("[data-hcode]").textContent = cur.h[1];
        $("[data-imsg]").textContent = cur.i[0]; $("[data-icode]").textContent = cur.i[1];
        $("[data-why]").innerHTML = "&nbsp;";
        arena.className = "mc__arena"; arena.style.setProperty("--p", 0);
        hud();
      }
      function resolve(pick) {
        if (!alive || locked || paused) return;
        locked = true;
        var ok = pick === cur.a, p = Math.min(1, elapsed / dur);
        if (ok) {
          streak++; bestStreak = Math.max(bestStreak, streak);
          var mult = 1 + Math.floor(streak / 5) * 0.5, pts = Math.round((100 + 200 * (1 - p)) * mult);
          score += pts;
          dur = Math.max(2800, dur - 220);
          arena.classList.add("is-ok");
          $("[data-why]").innerHTML = '<b class="ok">✓ ' + LABEL[pick] + " +" + pts + (mult > 1 ? " ×" + mult : "") + "</b> · " + esc(cur.why);
          if (streak === 10) { api.toast("10 clean merges in a row", "ok"); api.emit("streak10"); }
        } else {
          strikes++; streak = 0;
          arena.classList.add("is-bad");
          $("[data-why]").innerHTML = '<b class="err">✗ ' + (pick ? LABEL[pick] : "collision!") + "</b> · should have " + LABEL[cur.a] + ". " + esc(cur.why);
        }
        hud();
        var done = strikes >= 3 || (race && n >= RACE_N);
        setTimeout(function () { if (!alive) return; if (done) over(); else show(); }, ok ? 900 : 1700);
      }
      function frame(ts) {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        if (!last) last = ts;
        var dt = ts - last; last = ts;
        if (paused || locked) return;
        elapsed += dt;
        var p = Math.min(1, elapsed / dur);
        arena.style.setProperty("--p", p.toFixed(3));
        if (p >= 1) resolve(null);
      }
      function start() {
        deck = []; n = 0; score = 0; streak = 0; bestStreak = 0; strikes = 0; dur = race ? 6000 : 7000; alive = true; paused = false; last = 0;
        api.clearOverlay(); show();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      }
      function over() {
        alive = false; cancelAnimationFrame(raf);
        var b = api.best(score, { streak: bestStreak, conflicts: n });
        if (race) {
          race.over(score, n);
          api.overlay('<p class="arcade__kicker">$ git merge --continue</p><dl class="arcade__stats"><dt>your score</dt><dd>' + score + "</dd><dt>resolved</dt><dd>" + (n - strikes) + " / " + n + '</dd></dl><div class="race-result" data-race-result><p class="muted">waiting for the other player…</p></div>');
          return;
        }
        api.overlay('<p class="arcade__err">Automatic merge failed; fix conflicts and then commit the result.</p>' +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd><dt>best</dt><dd>" + b.best + "</dd><dt>conflicts</dt><dd>" + n + "</dd><dt>best streak</dt><dd>" + bestStreak + "</dd></dl>" +
          '<div class="lb-mini" data-lb-mini="merge"></div><button class="btn btn--primary" type="button" data-mc-start>↻ git merge again</button>');
      }
      function intro() {
        cur = BANK[0];
        $("[data-file]").textContent = "CONFLICT (content): merge conflict in app/models/user.rb";
        $("[data-branch]").textContent = "feature/search";
        $("[data-hmsg]").textContent = cur.h[0]; $("[data-hcode]").textContent = cur.h[1];
        $("[data-imsg]").textContent = cur.i[0]; $("[data-icode]").textContent = cur.i[1];
        api.hud('<span>best <b>' + best + "</b></span>");
        api.overlay('<p class="arcade__kicker">$ git merge feature/search</p><h3>Merge Conflict</h3>' +
          "<p>Two branches changed the same line. Before they collide, pick <b>◀ HEAD</b>, <b>incoming ▶</b> or <b>▲ both</b>.</p>" +
          '<p class="muted">Read the commit messages and the code: secrets, injections, debug lines and stale versions should not survive the merge. Two independent additions? Keep both. Three bad merges and it fails.</p>' +
          '<button class="btn btn--primary" type="button" data-mc-start>▶ git merge</button>');
      }
      function onClick(e) {
        if (e.target.closest("[data-mc-start]")) return start();
        var p = e.target.closest("[data-pick]"); if (p) resolve(p.getAttribute("data-pick"));
      }
      stage.addEventListener("click", onClick);
      intro();
      if (race) start();
      return {
        key: function (e) {
          if (!alive) return;
          if ((e.key === "p" || e.key === "P") && !race) { paused = !paused; api.toast(paused ? "paused (P to resume)" : "resumed"); return; }
          var k = KEYS[e.key]; if (k) { e.preventDefault(); resolve(k); }
        },
        pause: function () { if (alive && !paused && !race) { paused = true; api.toast("paused (P to resume)"); } },
        destroy: function () {
          if (race && alive) race.over(score, n, true);
          alive = false; cancelAnimationFrame(raf); stage.removeEventListener("click", onClick);
        }
      };
    }
  });
})();
