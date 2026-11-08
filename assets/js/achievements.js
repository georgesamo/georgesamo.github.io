/* Samuka · achievements (signed-in visitors)
 * SamukaAch.unlock(key) from anywhere; stored in Supabase (public.achievements)
 * and cached per account in localStorage. Shown in the account window and by
 * the terminal command `achievements`.
 */
(function () {
  "use strict";
  var LIST = [
    { key: "hello_world", icon: "👋", title: "Hello, world", how: "Sign in for the first time" },
    { key: "first_game", icon: "🕹", title: "bundle exec play", how: "Finish a game in the arcade" },
    { key: "retry_100", icon: "♻", title: "Retried 100 jobs", how: "Watch Sidekiq retry 100 jobs (all runs)" },
    { key: "queue_150", icon: "📬", title: "Queue whisperer", how: "Process 150 jobs in one Sidekiq Rush run" },
    { key: "pipeline", icon: "⇶", title: "Force-pushed a full row", how: "Fire a Pipeline in Gem Match" },
    { key: "bundle", icon: "✦", title: "bundle install", how: "Create a Bundle (match 5)" },
    { key: "db_reset", icon: "💣", title: "rails db:reset", how: "Swap two Bundles together" },
    { key: "gems_4000", icon: "💎", title: "Gemfile.lock: perfection", how: "Score 4000+ in Gem Match" },
    { key: "daily", icon: "📅", title: "Daily standup", how: "Finish the daily Gem Match" },
    { key: "podium", icon: "🏆", title: "Podium", how: "Reach the top 3 of a leaderboard" },
    { key: "race_win", icon: "🏁", title: "Race condition", how: "Win a live 1v1 Sidekiq Rush" },
    { key: "gems_duel", icon: "⚔", title: "Merge conflict resolved", how: "Win a live Gem Match versus" },
    { key: "coop_ship", icon: "🚀", title: "Pair programming, shipped", how: "Reach the co-op target in Gem Match" },
    { key: "weekly", icon: "🗓", title: "Sprint goal met", how: "Finish a weekly challenge" },
    { key: "chatty", icon: "💬", title: "Standup attended", how: "Say something in the live chat" },
    { key: "wall", icon: "📝", title: "First commit", how: "Leave a commit on the wall" },
    { key: "crowd", icon: "👥", title: "Pair programming", how: "Be here while someone else is online" },
    { key: "lofi", icon: "♪", title: "Beats to debug to", how: "Turn on the generated lo-fi" },
    { key: "night_owl", icon: "🦉", title: "Night owl", how: "Visit between midnight and 5 am", secret: true },
    { key: "glitch", icon: "⚡", title: "Found the glitch", how: "Witness a glitch", secret: true },
    { key: "sudo", icon: "🔐", title: "Not in the sudoers file", how: "Try sudo in the terminal", secret: true },
    { key: "vim", icon: "⌨", title: ":q!", how: "Get stuck in vim", secret: true },
    { key: "rails_c", icon: "💻", title: "irb(main):001>", how: "Open the rails console", secret: true },
    { key: "konami", icon: "🎮", title: "↑↑↓↓←→←→BA", how: "Enter the old code", secret: true }
  ];
  var BY = {}; LIST.forEach(function (a) { BY[a.key] = a; });
  var got = {}, uid = null, queue = [], showing = false;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function cacheKey() { return "samuka-ach-" + uid; }
  function saveCache() { if (uid) store.set(cacheKey(), Object.keys(got).join(",")); }
  function auth() { return window.SamukaAuth; }
  function db() { var A = auth(); return A && !A.mock() && A.client && A.client(); }

  function toast(a) {
    queue.push(a);
    if (showing) return;
    (function next() {
      var x = queue.shift(); if (!x) { showing = false; return; }
      showing = true;
      var el = document.createElement("div");
      el.className = "ach-toast";
      el.setAttribute("role", "status");
      el.innerHTML = '<span class="ach-toast__icon" aria-hidden="true">' + esc(x.icon) + '</span><span><small>achievement unlocked</small><b>' + esc(x.title) + "</b></span>";
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add("is-in"); });
      setTimeout(function () { el.classList.remove("is-in"); }, 3200);
      setTimeout(function () { el.remove(); next(); }, 3700);
    })();
  }

  function unlock(key) {
    var a = BY[key]; if (!a || !uid || got[key]) return false;
    got[key] = Date.now(); saveCache(); toast(a);
    var c = db();
    if (c) c.from("achievements").upsert({ key: key }, { onConflict: "user_id,key", ignoreDuplicates: true }).then(function (r) {
      if (r.error) console.warn("[ach]", r.error.message);
    });
    var A = auth(); if (A && A.refresh) A.refresh();
    window.dispatchEvent(new CustomEvent("samuka:achievement", { detail: { key: key } }));
    return true;
  }

  async function load() {
    got = {};
    (store.get(cacheKey()) || "").split(",").forEach(function (k) { if (k) got[k] = 1; });
    var c = db();
    if (c) {
      var r = await c.from("achievements").select("key");
      if (!r.error && r.data) { r.data.forEach(function (row) { got[row.key] = 1; }); saveCache(); }
    }
    unlock("hello_world");
    var h = new Date().getHours(); if (h < 5) unlock("night_owl");
  }

  window.addEventListener("samuka:auth", function (e) {
    var u = e.detail && e.detail.user;
    var id = u ? u.id : null;
    if (id === uid) return;
    uid = id;
    if (uid) load();
  });

  /* listeners that unlock things */
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name === "over") unlock("first_game");
    if (d.game === "gems") {
      if (d.name === "pipeline") unlock("pipeline");
      if (d.name === "bundle") unlock("bundle");
      if (d.name === "db_reset") unlock("db_reset");
      if (d.name === "over" && d.score >= 4000) unlock("gems_4000");
      if (d.name === "over" && d.mode === "daily") unlock("daily");
    }
    if (d.game === "sidekiq") {
      if (d.name === "retry" && uid) {
        var k = "samuka-retries-" + uid, n = (parseInt(store.get(k) || "0", 10) || 0) + 1;
        store.set(k, String(n)); if (n >= 100) unlock("retry_100");
      }
      if (d.name === "over" && d.done >= 150) unlock("queue_150");
    }
  });
  window.addEventListener("samuka:lofi", function (e) { if (e.detail && e.detail.on) unlock("lofi"); });
  // a glitch is "witnessed" when its overlay appears
  new MutationObserver(function (ms) {
    if (!uid || got.glitch) return;
    for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) {
      var n = ms[i].addedNodes[j];
      if (n.nodeType === 1 && n.classList && (n.classList.contains("glx") || n.classList.contains("tg-ghost"))) { setTimeout(function () { unlock("glitch"); }, 1600); return; }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  function render(compact) {
    var n = Object.keys(got).filter(function (k) { return BY[k]; }).length;
    var html = '<div class="ach-grid' + (compact ? " ach-grid--compact" : "") + '">' + LIST.map(function (a) {
      var on = !!got[a.key], hide = a.secret && !on;
      return '<div class="ach' + (on ? " is-on" : "") + '" title="' + esc(hide ? "secret achievement" : a.how) + '"><span class="ach__icon" aria-hidden="true">' + (hide ? "?" : esc(a.icon)) + '</span><span class="ach__txt"><b>' + esc(hide ? "???" : a.title) + "</b><small>" + esc(hide ? "secret" : a.how) + "</small></span></div>";
    }).join("") + "</div>";
    return { count: n, total: LIST.length, html: html };
  }

  // section in the account window
  function addToAccount() {
    var A = auth(); if (!A || !A.extend) return;
    A.extend(function (state) {
      if (!state.user) return "";
      var r = render(true);
      return '<details class="acct__ach"><summary>achievements <b>' + r.count + "/" + r.total + "</b></summary>" + r.html + "</details>";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addToAccount); else addToAccount();

  window.SamukaAch = {
    unlock: unlock, list: LIST, has: function (k) { return !!got[k]; },
    // plain text for the terminal
    text: function () {
      if (!uid) return null;
      return LIST.map(function (a) {
        var on = !!got[a.key], hide = a.secret && !on;
        return (on ? '<span class="ok">✓</span> ' : '<span class="dim">·</span> ') + (on ? "<b>" + esc(a.title) + "</b>" : '<span class="dim">' + esc(hide ? "??? (secret)" : a.title) + "</span>") + (hide ? "" : ' <span class="dim">— ' + esc(a.how) + "</span>");
      }).join("\n") + '\n\n<span class="dim">' + render().count + " / " + LIST.length + " unlocked</span>";
    }
  };
})();
