/* Samuka · Nino's corner (/nino/): only for the samuka and nino roles.
 * Countdowns she can edit (public.nino_dates), sprint stats from the shared
 * board, an original line of the day, quick actions. Nothing here is copied
 * from songs; the bunny is an original drawing.
 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var root = null, dates = [], tasks = [];
  var LINES = [
    "Ship small, ship often, stay purple 💜",
    "Today's standup: you're doing great.",
    "Every blocker is just a ticket that hasn't met you yet.",
    "Scope is a suggestion. Kindness is a requirement.",
    "The roadmap looks better with you on it.",
    "Retro note: more snacks, fewer meetings.",
    "A good PM is a plot twist the bugs never see coming.",
    "Golden hour is any hour you close a sprint.",
    "Breathe. Prioritise. Then press deploy together.",
    "Somewhere a backlog just got shorter because of you."
  ];
  var BUNNY = '<svg viewBox="0 0 140 176" aria-hidden="true"><ellipse cx="44" cy="44" rx="15" ry="40" transform="rotate(-12 44 44)" fill="#f7f1ff"/><ellipse cx="44" cy="48" rx="7" ry="29" transform="rotate(-12 44 48)" fill="#ffb3d4"/><ellipse cx="96" cy="44" rx="15" ry="40" transform="rotate(12 96 44)" fill="#f7f1ff"/><ellipse cx="96" cy="48" rx="7" ry="29" transform="rotate(12 96 48)" fill="#ffb3d4"/><ellipse cx="70" cy="108" rx="50" ry="44" fill="#f7f1ff"/><path d="M46 102q7-8 14 0M80 102q7-8 14 0" fill="none" stroke="#2a1a45" stroke-width="4" stroke-linecap="round"/><ellipse cx="42" cy="118" rx="9" ry="6" fill="#ffb3d4" opacity=".8"/><ellipse cx="98" cy="118" rx="9" ry="6" fill="#ffb3d4" opacity=".8"/><path d="M66 114h8l-4 5z" fill="#ff8fbf"/><path d="M62 123q4 5 8 0q4 5 8 0" fill="none" stroke="#2a1a45" stroke-width="3" stroke-linecap="round"/><path d="M70 174c-7-6-16-11-16-19a8 8 0 0116-3 8 8 0 0116 3c0 8-9 13-16 19z" fill="#b98cff"/></svg>';
  function A() { return window.SamukaAuth; }
  function team() { var a = A(); return !!(a && a.user() && (a.role() === "samuka" || a.role() === "nino")); }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function daysTo(d) { var t = new Date(d + "T00:00:00"), n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); }
  function lineOfDay() { var d = new Date(); return LINES[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % LINES.length]; }
  function saveMock() { try { sessionStorage.setItem("samuka-mock-dates", JSON.stringify(dates)); } catch (e) {} }

  async function load() {
    if (!team()) return paint();
    var c = db();
    if (c) {
      var r1 = await c.from("nino_dates").select("id, title, day, emoji").order("day");
      dates = r1.error ? [] : r1.data || [];
      var r2 = await c.from("board_tasks").select("status, purple, updated_at");
      tasks = r2.error ? [] : r2.data || [];
    } else {
      try { dates = JSON.parse(sessionStorage.getItem("samuka-mock-dates") || "null") || [{ id: 1, title: "Sprint demo", day: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), emoji: "🚀" }]; } catch (e) { dates = []; }
      try { tasks = JSON.parse(sessionStorage.getItem("samuka-mock-board") || "[]"); } catch (e) { tasks = []; }
    }
    paint();
  }
  function datesHtml(list) {
    return '<ul class="corner__dates">' + list.map(function (d) {
      var n = daysTo(d.day);
      return '<li><span class="corner__emoji">' + esc(d.emoji) + "</span><b>" + esc(d.title) + '</b><span class="corner__days">' + (n === 0 ? "today!" : n === 1 ? "tomorrow" : n + " days") + "</span><small>" + esc(d.day) + '</small><button class="wall__mod" type="button" data-date-del="' + d.id + '" aria-label="Remove ' + esc(d.title) + '">✕</button></li>';
    }).join("") + "</ul>";
  }
  function paint() {
    if (!root) return;
    var a = A();
    if (!team()) {
      root.innerHTML = '<div class="corner__closed"><p class="arcade__kicker">$ cat team/ninos-corner.md</p><h1 class="corner__closed-title">404 · nothing to see here</h1><p class="muted">This corner is for the team. Back to the <a href="/">arcade</a>?</p></div>';
      return;
    }
    var who = a.role() === "nino" ? "Nino" : "Samuka (visiting)";
    var upcoming = dates.filter(function (d) { return daysTo(d.day) >= 0; }), past = dates.filter(function (d) { return daysTo(d.day) < 0; });
    var c = { todo: 0, doing: 0, done: 0, purple: 0, week: 0 }, wk = Date.now() - 7 * 864e5;
    tasks.forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; if (t.purple) c.purple++; if (t.status === "done" && (!t.updated_at || new Date(t.updated_at) > wk)) c.week++; });
    var total = c.todo + c.doing + c.done, pct = total ? Math.round(c.done / total * 100) : 0;
    root.innerHTML =
      '<div class="corner__hero"><span class="corner__bunny">' + BUNNY + '</span><div><p class="arcade__kicker">team/ninos-corner.md</p><h1 class="corner__title">annyeong, ' + esc(who) + ' <span class="corner__heart">💜</span></h1><p class="corner__line">' + esc(lineOfDay()) + "</p></div></div>" +
      '<div class="corner__grid">' +
        '<article class="ev-card"><p class="ev-kicker">counting down</p>' +
          (upcoming.length ? datesHtml(upcoming) : '<p class="muted">Add concerts, releases, birthdays, launch days…</p>') +
          '<form class="corner__add" data-date-form><input name="emoji" maxlength="4" value="💜" aria-label="Emoji"><input name="title" maxlength="80" required placeholder="what is happening?" aria-label="Title"><input name="day" type="date" required aria-label="Date"><button class="btn btn--primary" type="submit">+ add</button></form>' +
          (past.length ? '<details class="corner__past"><summary>' + past.length + " past</summary>" + datesHtml(past) + "</details>" : "") +
        "</article>" +
        '<article class="ev-card"><p class="ev-kicker">sprint stats · our board</p>' +
          '<div class="corner__ring" style="--p:' + pct + '"><b>' + pct + "%</b><span>shipped</span></div>" +
          '<dl class="pcard__stats"><div><b>' + c.todo + "</b><span>to do</span></div><div><b>" + c.doing + "</b><span>in progress</span></div><div><b>" + c.week + "</b><span>shipped this week</span></div></dl>" +
          '<p class="muted">💜 tagged: ' + c.purple + '</p><button class="btn" type="button" data-open-board>📋 open the board</button>' +
        "</article>" +
        '<article class="ev-card corner__quick"><p class="ev-kicker">quick</p>' +
          (a.role() === "nino" ? '<button class="btn btn--primary" type="button" data-corner-golden>✨ golden theme</button>' : "") +
          '<button class="btn" type="button" data-race>🤝 co-op Gem Match</button><button class="btn" type="button" data-daily>📅 daily puzzle</button>' +
          '<button class="btn" type="button" data-corner-glitch>⚡ glitch me</button></article>' +
      "</div>";
  }
  async function addDate(f) {
    var row = { title: f.elements.title.value.trim(), day: f.elements.day.value, emoji: (f.elements.emoji.value || "💜").trim().slice(0, 8) };
    if (!row.title || !row.day) return;
    var c = db();
    if (c) { var r = await c.from("nino_dates").insert(row); if (r.error) { alert(r.error.message); return; } }
    else { row.id = Date.now(); dates.push(row); saveMock(); }
    load();
  }
  async function delDate(id) {
    var c = db();
    if (c) { var r = await c.from("nino_dates").delete().eq("id", id); if (r.error) { alert(r.error.message); return; } }
    else { dates = dates.filter(function (d) { return d.id !== id; }); saveMock(); }
    load();
  }
  document.addEventListener("submit", function (e) { if (root && e.target.matches("[data-date-form]")) { e.preventDefault(); addDate(e.target); } });
  document.addEventListener("click", function (e) {
    if (!root || !root.contains(e.target)) return;
    var d = e.target.closest("[data-date-del]"); if (d) delDate(+d.getAttribute("data-date-del"));
    if (e.target.closest("[data-corner-golden]") && window.Samuka) window.Samuka.setSkin("golden", { user: true });
    if (e.target.closest("[data-corner-glitch]") && window.SamukaGlitch) window.SamukaGlitch.fire(true);
  });
  function boot() { root = document.querySelector("[data-corner]"); if (root) load(); }
  window.addEventListener("samuka:auth", function () { if (root) load(); });
  window.addEventListener("samuka:page", boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
