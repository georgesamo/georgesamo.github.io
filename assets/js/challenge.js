/* Samuka · challenge a friend (no one needs to be online at the same time)
 * Every run has a seed (arcade.js), so a finished run can be sent as a link: /games/?c=<code>,
 * where the code carries the game, the seed, the challenger's name and score (and Pit Wall's race
 * length). Opening it shows "<name> challenges you"; accepting plays that exact board in "challenge"
 * mode, and the result card shows the head-to-head with a link to send back.
 * No server involved, so it works for guests too. The score in a link could be edited by hand,
 * which is fine for a friendly challenge: challenge runs never touch the leaderboards (scores.js).
 */
(function () {
  "use strict";
  var GAMES = { sidekiq: "Sidekiq Rush", gems: "Gem Match", schema: "Schema Stack", pitwall: "Pit Wall" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return (n | 0).toLocaleString("en-US"); };
  var active = null;   // the challenge being played: { game, seed, name, score, length }

  /* ---------- the link ---------- */
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function b64d(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }
  function encode(c) {
    var o = { v: 1, g: c.game, s: c.seed, n: c.name, sc: c.score | 0 };
    if (c.game === "pitwall" && c.length === "sprint") o.l = "sprint";
    return b64e(JSON.stringify(o));
  }
  function decode(code) {
    try {
      var o = JSON.parse(b64d(String(code || "")));
      if (!o || o.v !== 1 || !GAMES[o.g]) return null;
      var seed = String(o.s || "");
      if (!/^[\w.:-]{1,64}$/.test(seed)) return null;
      return {
        game: o.g, seed: seed,
        name: String(o.n || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24) || "a friend",
        score: Math.max(0, Math.min(200000, o.sc | 0)),
        length: o.g === "pitwall" ? (o.l === "sprint" ? "sprint" : "full") : undefined
      };
    } catch (e) { return null; }
  }
  function link(c) { return location.origin + "/games/?c=" + encode(c); }
  function myName() { var A = window.SamukaAuth; return A && A.user && A.user() && A.publicName ? A.publicName() : "a friend"; }

  // a run that can be replayed: scored, seeded, and for Pit Wall a quick race (GP and championship need your picks)
  function canChallenge(r) { return !!(r && r.seed && r.score > 0 && GAMES[r.game] && (r.game !== "pitwall" || r.kind === "quick")); }

  function share(c, btn) {
    var url = link(c);
    var text = (c.name === "a friend" ? "Can you" : c.name + " challenges you to") + " beat " + fmt(c.score) + " in " + GAMES[c.game] + "? Same board, any time.";
    var done = function (label) { if (btn) { var t = btn.innerHTML; btn.innerHTML = label; btn.disabled = true; setTimeout(function () { btn.innerHTML = t; btn.disabled = false; }, 2200); } };
    // phones: the system share sheet (messages, chat apps); desktops: copy the link
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      return navigator.share({ title: "Samuka's Arcade challenge", text: text, url: url }).then(function () { done("✓ sent"); }, function () {});
    }
    var copy = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text + " " + url) : Promise.reject();
    return copy.then(function () { done("✓ link copied"); }, function () { showLink(btn, url); });
  }
  function showLink(btn, url) {   // no clipboard (permissions, old browsers): show the link to copy by hand
    var host = btn && btn.closest(".chal-out") || btn && btn.parentNode;
    if (!host || host.querySelector(".chal-link")) return;
    var input = document.createElement("input");
    input.className = "chal-link"; input.readOnly = true; input.value = url; input.setAttribute("aria-label", "Challenge link");
    host.appendChild(input); input.focus(); input.select();
  }

  /* ---------- accepting: /games/?c=… ---------- */
  function closeInvite() { var d = document.querySelector(".chal"); if (d) d.remove(); }
  function invite(c) {
    closeInvite();
    var d = document.createElement("div");
    d.className = "chal";
    d.innerHTML =
      '<div class="chal__backdrop" data-chal-close></div>' +
      '<div class="chal__card" role="dialog" aria-modal="true" aria-labelledby="chal-t">' +
        '<p class="arcade__kicker">⚔ challenge · ' + esc(GAMES[c.game]) + "</p>" +
        '<h3 id="chal-t">' + (c.name === "a friend" ? "A friend challenges you" : "<b>" + esc(c.name) + "</b> challenges you") + "</h3>" +
        "<p>Beat <b>" + fmt(c.score) + "</b> in <b>" + esc(GAMES[c.game]) + "</b>" + (c.game === "pitwall" ? " (" + (c.length === "sprint" ? "sprint" : "full") + " quick race)" : "") +
        ". Same board they played, as many tries as you like.</p>" +
        '<div class="chal__row"><button class="btn btn--primary" type="button" data-chal-accept><span class="btn__prompt">▶</span> accept</button><button class="btn" type="button" data-chal-close>not now</button></div>' +
        '<p class="chal__fine">Challenge scores stay between you two: they don\'t go on the leaderboards.</p>' +
      "</div>";
    document.body.appendChild(d);
    d.__c = c;
    var b = d.querySelector("[data-chal-accept]"); if (b) setTimeout(function () { b.focus(); }, 30);
  }
  function accept(c) {
    closeInvite();
    var Ar = window.SamukaArcade; if (!Ar) return;
    active = c;
    Ar.open(c.game, { mode: "challenge", seed: c.seed, length: c.length, challenge: c });
  }
  function fromUrl() {
    var q = new URLSearchParams(location.search), code = q.get("c");
    if (!code) return;
    // drop it from the address bar so a reload or a shared screenshot doesn't re-open it
    q.delete("c");
    history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    var c = decode(code);
    if (c) invite(c);
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-chal-accept], [data-chal-close], [data-chal-send]");
    if (!t) return;
    if (t.hasAttribute("data-chal-close")) { closeInvite(); return; }
    if (t.hasAttribute("data-chal-accept")) { var d = t.closest(".chal"); if (d && d.__c) accept(d.__c); return; }
    if (t.hasAttribute("data-chal-send")) {
      var c = decode(t.getAttribute("data-chal-send"));
      if (c) share(c, t);
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.querySelector(".chal")) closeInvite(); });

  /* ---------- the result: head to head ---------- */
  function sendButton(c, label) {
    return '<button class="btn" type="button" data-chal-send="' + esc(encode(c)) + '">' + label + "</button>";
  }
  function resultHtml(c, score, seed) {
    var diff = score - c.score, them = c.name === "a friend" ? "your friend" : esc(c.name);
    var head = diff > 0 ? "🏆 You win by " + fmt(diff) + "!" : diff === 0 ? "🤝 Dead heat." : "So close: " + fmt(-diff) + " short of " + them + ".";
    var back = { game: c.game, seed: seed || c.seed, name: myName(), score: score, length: c.length };
    return '<p class="chal-out__head">' + head + "</p>" +
      '<dl class="chal-out__vs"><dt>you</dt><dd' + (diff >= 0 ? ' class="is-win"' : "") + ">" + fmt(score) + "</dd><dt>" + them + "</dt><dd" + (diff <= 0 ? ' class="is-win"' : "") + ">" + fmt(c.score) + "</dd></dl>" +
      '<div class="chal-out__row">' + (score > 0 ? sendButton(back, diff > 0 ? "⚔ send it back" : "⚔ send your score anyway") : "") +
      '<span class="muted">' + (diff > 0 ? "Same board. Let them try to beat " + fmt(score) + "." : "Same board every try. Go again?") + "</span></div>";
  }
  function attach(selector, html) {
    var tries = 0;
    (function find() {
      var card = document.querySelector(".arcade:not([hidden]) .arcade__overlay .arcade__card");
      if (!card) { if (++tries < 40) setTimeout(find, 100); return; }
      var el = card.querySelector(selector);
      if (!el) { el = document.createElement("div"); el.className = selector.slice(1); card.appendChild(el); }
      el.innerHTML = html;
    })();
  }
  window.addEventListener("samuka:game", function (e) {
    var d = e.detail || {};
    if (d.name === "closed") { active = null; return; }
    if (d.name === "over" && d.mode === "challenge" && active && active.game === d.game) attach(".chal-out", resultHtml(active, d.score | 0, d.seed));
  });

  /* ---------- free play: offer to send this run (nextsteps.js draws the button) ---------- */
  function offerButton(r) {
    if (!canChallenge(r)) return "";
    return sendButton({ game: r.game, seed: r.seed, name: myName(), score: r.score, length: r.length }, "⚔ challenge a friend");
  }

  window.addEventListener("samuka:page", fromUrl);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fromUrl); else fromUrl();

  window.SamukaChallenge = { encode: encode, decode: decode, link: link, canChallenge: canChallenge, offerButton: offerButton, accept: accept, _active: function () { return active; } };
})();
