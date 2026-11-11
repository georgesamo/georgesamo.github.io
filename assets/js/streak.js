/* Samuka · daily streak reminder.
 * Signed-in players with a streak who haven't played today's daily get a note on the daily
 * cards (Home, Today) and a dot on the Today links. The streak comes from the player card
 * (supabase/me.sql: consecutive UTC days with a daily played), "played today" from scores.js.
 * Dismissed for the rest of the UTC day with ×; switched off in Settings (samuka-streak-remind).
 */
(function () {
  "use strict";
  var OFF_KEY = "samuka-streak-remind", HIDE_KEY = "samuka-streak-hide";
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function utcDay(now) { return new Date(now).toISOString().slice(0, 10); }
  function minsLeft(now) {
    var d = new Date(now), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    return Math.max(1, Math.ceil((next - d.getTime()) / 6e4));
  }
  function fmtLeft(m) { return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; }

  /* pure: what to show. c: { signedIn, streak: {current,best}|null, done, on, hiddenDay, now } */
  function state(c) {
    var cur = c.streak && c.streak.current | 0;
    if (!c.signedIn || !c.on || !cur) return { show: false };
    // no count here: the cached card may still show yesterday's number right after playing
    if (c.done) return { show: true, kind: "kept", text: "✓ Today's daily is done. Your streak is safe until tomorrow." };
    if (c.hiddenDay === utcDay(c.now)) return { show: false, dot: true };
    var m = minsLeft(c.now);
    return { show: true, dot: true, kind: m <= 180 ? "urgent" : "risk", mins: m,
      text: "🔥 Your " + cur + "-day streak ends in " + fmtLeft(m) + ". Play today's daily to keep it." };
  }

  /* ---------- page ---------- */
  var card, cardFor = null, timer = null;
  function signedIn() { var A = window.SamukaAuth; return !!(A && A.user && A.user()); }
  function enabled() { return get(OFF_KEY) !== "off"; }
  function current() {
    var S = window.SamukaScores;
    return state({ signedIn: signedIn(), streak: card && card.streak, done: !!(S && S.dailyDone && S.dailyDone("gems")),
      on: enabled(), hiddenDay: get(HIDE_KEY), now: Date.now() });
  }
  function paint() {
    var st = current();
    document.querySelectorAll("[data-streak]").forEach(function (el) {
      if (!st.show) { el.hidden = true; el.innerHTML = ""; return; }
      el.hidden = false;
      el.className = "streak-note streak-note--" + st.kind;
      el.innerHTML = '<span data-streak-text>' + st.text + "</span>" +
        (st.kind === "kept" ? "" : '<button type="button" class="streak-note__x" data-streak-hide aria-label="Hide the streak reminder for today">×</button>');
    });
    document.querySelectorAll('a[href="/events/"]').forEach(function (a) {
      if (a.closest(".tree, .mnav")) a.classList.toggle("has-streak-dot", !!st.dot && st.kind !== "kept");
    });
    var need = st.show && st.kind !== "kept" && document.querySelector("[data-streak]");
    if (need && !timer) timer = setInterval(function () { if (!document.hidden) paint(); }, 60000);
    if (!need && timer) { clearInterval(timer); timer = null; }
  }
  function load() {
    var A = window.SamukaAuth, M = window.SamukaMe;
    if (!signedIn() || !M || !M.fetchCard || !enabled()) { card = null; cardFor = null; return paint(); }
    var name = A.publicName();
    if (cardFor !== name) { card = null; cardFor = name; }
    M.fetchCard(name).then(function (c) { if (cardFor === name) { card = c; paint(); } });
    paint();
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("[data-streak-hide]")) return;
    set(HIDE_KEY, utcDay(Date.now()));
    paint();
  });
  window.addEventListener("samuka:page", paint);
  window.addEventListener("samuka:auth", load);
  window.addEventListener("samuka:scored", function () { setTimeout(paint, 50); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();

  window.SamukaStreak = {
    state: state, fmtLeft: fmtLeft, paint: paint, refresh: load,
    enabled: enabled,
    setEnabled: function (on) { set(OFF_KEY, on ? null : "off"); load(); }
  };
})();
