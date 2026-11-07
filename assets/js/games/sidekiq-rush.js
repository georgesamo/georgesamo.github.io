/* Sidekiq Rush · route incoming jobs to the right queue before Redis runs out of memory */
(function () {
  "use strict";
  if (!window.SamukaArcade) return;

  var LANES = [
    { id: "critical", key: "1", label: "critical", dur: 1.4, bonus: 5 },
    { id: "default", key: "2", label: "default", dur: 2.1, bonus: 0 },
    { id: "mailers", key: "3", label: "mailers", dur: 1.0, bonus: 0 }
  ];
  var KLASS = {
    critical: ["ChargeInsuranceClaimJob", "SyncFhirPatientJob", "ConfirmBookingJob", "ReserveMedicationJob", "AuthorizePaymentJob"],
    default: ["RecalculatePricingJob", "ImportCatalogJob", "ReindexSearchJob", "ExportReportJob", "MergeDuplicatesJob"],
    mailers: ["AppointmentReminderMailer", "InvoiceMailer", "LabResultsMailer", "WelcomeMailer", "PasswordResetMailer"]
  };
  var MAX_QUEUE = 6, MAX_WORKERS = 4, BACKLOG_SAFE = 8;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var jid = function () { return Math.random().toString(16).slice(2, 8); };

  window.SamukaArcade.register("sidekiq", {
    title: "sidekiq-rush.rb",
    blurb: "Route jobs to the right queue before Redis runs out of memory.",
    mount: function (stage, api) {
      var S, raf = 0, last = 0, running = false, paused = false;

      stage.innerHTML =
        '<div class="sr">' +
          '<div class="sr__inbox">' +
            '<p class="sr__label">enqueued <span class="muted">· Redis</span></p>' +
            '<ol class="sr__jobs" data-inbox></ol>' +
            '<div class="sr__mem"><span>memory</span><div class="sr__bar"><i data-mem></i></div><b data-mem-pct>0%</b></div>' +
          "</div>" +
          '<div class="sr__lanes">' +
            LANES.map(function (l) {
              return '<section class="sr__lane sr__lane--' + l.id + '" data-lane="' + l.id + '" role="button" tabindex="0" aria-label="Route to ' + l.label + ' queue (key ' + l.key + ')">' +
                '<header class="sr__lane-head"><kbd>' + l.key + '</kbd> <b>:' + l.label + '</b><span class="sr__lane-cap" data-cap></span>' +
                '<button class="sr__hire" type="button" data-hire="' + l.id + '" title="Add a worker (uses a token)">+ worker</button></header>' +
                '<div class="sr__workers" data-workers></div>' +
                '<ol class="sr__queue" data-queue></ol>' +
              "</section>";
            }).join("") +
          "</div>" +
        "</div>";
      api.foot('<span>Route the <b>highlighted</b> job: click a lane or press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>. Click a job to pick it instead. Wrong lane = slow &amp; no points. Every 12 jobs earns a <b>+ worker</b> token.</span>');

      var inboxEl = stage.querySelector("[data-inbox]");
      var memEl = stage.querySelector("[data-mem]"), memPct = stage.querySelector("[data-mem-pct]");
      var laneEls = {};
      LANES.forEach(function (l) {
        var el = stage.querySelector('[data-lane="' + l.id + '"]');
        laneEls[l.id] = { root: el, queue: el.querySelector("[data-queue]"), workers: el.querySelector("[data-workers]"), cap: el.querySelector("[data-cap]"), hire: el.querySelector("[data-hire]") };
      });

      function fresh() {
        var lanes = {};
        LANES.forEach(function (l) { lanes[l.id] = { queue: [], workers: [{ job: null, t: 0, el: null }] }; });
        lanes.critical.workers.push({ job: null, t: 0, el: null });
        return { t: 0, spawnIn: 0.6, incoming: [], selected: null, lanes: lanes, score: 0, done: 0, misrouted: 0, dead: 0, retries: 0, tokens: 0, memory: 0, nextSpike: 35, history: [] };
      }

      /* ---------- DOM helpers (keyed: each job keeps its element) ---------- */
      function jobEl(job) {
        if (job.el) return job.el;
        var li = document.createElement("li");
        li.className = "sr__job sr__job--" + job.type;
        li.dataset.id = job.id;
        li.innerHTML = '<span class="sr__job-k">' + esc(job.klass) + '</span><span class="sr__job-m">' + job.type + (job.retries ? ' · retry ' + job.retries : "") + "</span>";
        job.el = li;
        return li;
      }
      function renderWorkers(laneId) {
        var L = S.lanes[laneId], box = laneEls[laneId].workers;
        while (box.children.length < L.workers.length) {
          var w = document.createElement("div"); w.className = "sr__worker"; w.innerHTML = '<span class="sr__wjob">idle</span><span class="sr__prog"><i></i></span>'; box.appendChild(w);
        }
        L.workers.forEach(function (wk, i) { wk.el = box.children[i]; });
      }
      function refreshLaneMeta() {
        LANES.forEach(function (l) {
          var L = S.lanes[l.id], E = laneEls[l.id];
          E.cap.textContent = L.queue.length + "/" + MAX_QUEUE + " · " + L.workers.length + "w";
          E.hire.disabled = !(S.tokens > 0 && L.workers.length < MAX_WORKERS);
          E.root.classList.toggle("is-full", L.queue.length >= MAX_QUEUE);
        });
      }
      function markSelected() {
        S.incoming.forEach(function (j) { if (j.el) j.el.classList.toggle("is-next", j === current()); });
      }
      function current() { return S.selected && S.incoming.indexOf(S.selected) > -1 ? S.selected : S.incoming[0]; }

      /* ---------- game actions ---------- */
      function spawn(type, retries, klass) {
        var job = { id: jid(), type: type || pick(["critical", "default", "default", "mailers", "mailers", "critical"]), retries: retries || 0 };
        job.klass = klass || pick(KLASS[job.type]);
        S.incoming.push(job);
        inboxEl.appendChild(jobEl(job));
        markSelected();
      }
      function route(laneId) {
        if (!running || paused) return;
        var job = current();
        var lane = laneEls[laneId].root;
        if (!job) { bump(lane); return; }
        var L = S.lanes[laneId];
        if (L.queue.length >= MAX_QUEUE) { bump(lane); api.toast("queue :" + laneId + " is full", "warn"); return; }
        S.incoming.splice(S.incoming.indexOf(job), 1);
        S.selected = null;
        job.lane = laneId;
        job.wrong = job.type !== laneId;
        if (job.wrong) job.el.classList.add("is-wrong");
        job.el.classList.remove("is-next");
        L.queue.push(job);
        laneEls[laneId].queue.appendChild(job.el);
        job.el.classList.remove("sr__fly"); void job.el.offsetWidth; job.el.classList.add("sr__fly");
        markSelected(); refreshLaneMeta();
      }
      function bump(el) { el.classList.remove("sr__bump"); void el.offsetWidth; el.classList.add("sr__bump"); }
      function hire(laneId) {
        var L = S.lanes[laneId];
        if (S.tokens <= 0 || L.workers.length >= MAX_WORKERS) return;
        S.tokens--; L.workers.push({ job: null, t: 0, el: null });
        renderWorkers(laneId); refreshLaneMeta();
        api.toast("+1 worker on :" + laneId, "ok");
      }
      function finish(laneId, wk) {
        var job = wk.job; wk.job = null;
        if (job.el) job.el.remove();
        if (Math.random() < 0.06 && !job.wrong) {           // the job raised: Sidekiq retries it
          if (job.retries >= 2) { S.dead++; S.score = Math.max(0, S.score - 20); api.toast(job.klass + " → DeadSet (-20)", "err"); return; }
          S.retries++;
          spawn(job.type, job.retries + 1, job.klass);
          api.toast(job.klass + " raised · retrying", "warn");
          return;
        }
        S.done++;
        S.history.push(S.t);
        if (job.wrong) { S.misrouted++; }
        else {
          var lane = LANES.filter(function (l) { return l.id === laneId; })[0];
          S.score += 10 + lane.bonus + Math.min(10, Math.floor(S.t / 20)) * 2;
        }
        if (S.done % 12 === 0) { S.tokens++; api.toast("worker token earned · " + S.tokens + " available", "ok"); }
      }

      /* ---------- loop ---------- */
      function step(dt) {
        S.t += dt;
        // spawn rate ramps up over time
        S.spawnIn -= dt;
        var interval = Math.max(0.42, 1.45 - S.t * 0.011);
        if (S.spawnIn <= 0) { spawn(); S.spawnIn = interval * (0.6 + Math.random() * 0.8); }
        if (S.t >= S.nextSpike) {
          S.nextSpike += 30 + Math.random() * 10;
          api.toast("⚡ traffic spike: Monday-morning bookings", "warn");
          for (var i = 0; i < 5; i++) spawn(i < 3 ? "critical" : null);
        }
        // workers
        LANES.forEach(function (l) {
          var L = S.lanes[l.id];
          L.workers.forEach(function (wk) {
            if (!wk.job && L.queue.length) {
              wk.job = L.queue.shift();
              wk.t = 0;
              wk.dur = l.dur * (wk.job.wrong ? 2.3 : 1) * (0.85 + Math.random() * 0.3);
              if (wk.job.el) wk.job.el.remove();
            }
            if (wk.job) { wk.t += dt; if (wk.t >= wk.dur) finish(l.id, wk); }
            if (wk.el) {
              var label = wk.el.firstChild, bar = wk.el.lastChild.firstChild;
              if (wk.job) { label.textContent = wk.job.klass; wk.el.classList.toggle("is-wrong", !!wk.job.wrong); bar.style.width = Math.min(100, (wk.t / wk.dur) * 100) + "%"; wk.el.classList.add("is-busy"); }
              else { label.textContent = "idle"; bar.style.width = "0%"; wk.el.classList.remove("is-busy", "is-wrong"); }
            }
          });
        });
        // Redis memory: grows when the backlog is long
        var backlog = S.incoming.length;
        if (backlog > BACKLOG_SAFE) S.memory += (backlog - BACKLOG_SAFE) * 3.8 * dt;
        else S.memory -= 6 * dt;
        S.memory = Math.max(0, S.memory);
        memEl.style.width = Math.min(100, S.memory) + "%";
        memPct.textContent = Math.min(100, Math.round(S.memory)) + "%";
        memEl.parentElement.classList.toggle("is-hot", S.memory > 60);
        if (S.memory >= 100) return over();
        // HUD (throughput over the last 10 s)
        S.history = S.history.filter(function (x) { return S.t - x < 10; });
        api.hud('<span>score <b>' + S.score + '</b></span><span>jobs <b>' + S.done + '</b></span><span class="hide-sm">' + (S.history.length / Math.min(10, Math.max(1, S.t))).toFixed(1) + ' jobs/s</span><span>tokens <b>' + S.tokens + "</b></span>");
        refreshLaneMeta();
      }
      function frame(ts) {
        if (!running) return;
        var dt = Math.min(0.1, last ? (ts - last) / 1000 : 0);
        last = ts;
        if (!paused) step(dt);
        if (running) raf = requestAnimationFrame(frame);
      }

      /* ---------- screens ---------- */
      function start() {
        S = fresh();
        inboxEl.innerHTML = "";
        LANES.forEach(function (l) { laneEls[l.id].queue.innerHTML = ""; laneEls[l.id].workers.innerHTML = ""; renderWorkers(l.id); });
        refreshLaneMeta();
        api.clearOverlay();
        running = true; paused = false; last = 0;
        raf = requestAnimationFrame(frame);
      }
      function over() {
        running = false;
        cancelAnimationFrame(raf);
        var b = api.best(S.score);
        api.overlay(
          '<p class="arcade__err">Redis::OutOfMemoryError</p>' +
          '<p class="muted">OOM command not allowed when used memory &gt; \'maxmemory\'</p>' +
          '<dl class="arcade__stats"><dt>score</dt><dd>' + S.score + (b.isNew ? ' <span class="arcade__new">new best!</span>' : "") + "</dd>" +
          "<dt>best</dt><dd>" + b.best + "</dd><dt>processed</dt><dd>" + S.done + "</dd><dt>misrouted</dt><dd>" + S.misrouted + "</dd><dt>retries · dead</dt><dd>" + S.retries + " · " + S.dead + "</dd><dt>uptime</dt><dd>" + Math.floor(S.t) + "s</dd></dl>" +
          '<button class="btn btn--primary" type="button" data-sr-start>↻ bundle exec sidekiq</button>'
        );
      }
      function intro() {
        S = fresh();
        LANES.forEach(function (l) { renderWorkers(l.id); });
        refreshLaneMeta();
        api.hud('<span>best <b>' + api.peekBest() + "</b></span>");
        api.overlay(
          '<p class="arcade__kicker">$ bundle exec sidekiq -q critical -q default -q mailers</p>' +
          "<h3>Sidekiq Rush</h3>" +
          "<p>Jobs from the hospital system pile up in Redis. Route each one to its queue:</p>" +
          '<ul class="sr__legend"><li><i class="sr__dot sr__dot--critical"></i><b>critical</b> claims, bookings, payments</li><li><i class="sr__dot sr__dot--default"></i><b>default</b> pricing, imports, reports</li><li><i class="sr__dot sr__dot--mailers"></i><b>mailers</b> reminders, invoices, results</li></ul>' +
          "<p class=\"muted\">Let the backlog grow and Redis runs out of memory. Traffic spikes hit every ~30 s.</p>" +
          '<button class="btn btn--primary" type="button" data-sr-start>▶ start workers</button>'
        );
      }

      /* ---------- input ---------- */
      function onClick(e) {
        if (e.target.closest("[data-sr-start]")) { start(); return; }
        var h = e.target.closest("[data-hire]");
        if (h) { e.stopPropagation(); hire(h.getAttribute("data-hire")); return; }
        var j = e.target.closest(".sr__job");
        if (j && j.parentElement === inboxEl) {
          S.selected = S.incoming.filter(function (x) { return x.id === j.dataset.id; })[0] || null;
          markSelected(); return;
        }
        var lane = e.target.closest("[data-lane]");
        if (lane) route(lane.getAttribute("data-lane"));
      }
      stage.addEventListener("click", onClick);
      intro();

      return {
        key: function (e) {
          if (!running) return;
          var l = LANES.filter(function (x) { return x.key === e.key; })[0];
          var focusedLane = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-lane]");
          if ((e.key === "Enter" || e.key === " ") && focusedLane && !e.target.closest("button")) { e.preventDefault(); route(focusedLane.getAttribute("data-lane")); }
          else if (l && !e.shiftKey) { e.preventDefault(); route(l.id); }
          else if (e.shiftKey && /^Digit[123]$/.test(e.code)) { e.preventDefault(); hire(LANES[+e.code.slice(5) - 1].id); }
          else if (e.key === "p" || e.key === "P") { paused = !paused; api.toast(paused ? "paused (P to resume)" : "resumed"); }
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            var i = S.incoming.indexOf(current()) + (e.key === "ArrowDown" ? 1 : -1);
            if (S.incoming[i]) { S.selected = S.incoming[i]; markSelected(); }
          }
        },
        pause: function () { if (running && !paused) { paused = true; api.toast("paused (P to resume)"); } },
        destroy: function () { running = false; cancelAnimationFrame(raf); stage.removeEventListener("click", onClick); }
      };
    }
  });
})();
