/* Samuka · live presence (Supabase Realtime)
 * "● N online" in the tab bar, and other visitors' cursors drifting by as faint
 * ghost cursors (Samuka's is a tiny bat, Nino's a bunny). Positions are sent
 * relative to the section under the pointer, so they line up across screen sizes.
 * Nothing is stored. Visitors can switch cursors off (account window / `cursors off`).
 */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var channel = null, me = null, peers = {}, ghosts = {}, layer = null, badge = null, count = 1, lastSend = 0, lastXY = null, joinedFor = null;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ICON = {
    arrow: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1l13 10.5-6 .6 3.6 6.4-2.4 1.3-3.6-6.4L1 17.5z"/></svg>',
    samuka: '<svg viewBox="0 0 34 17" aria-hidden="true"><path d="M0 10C4 4 8 3 12 6c1-3 3-4 4-2l1-3 1 3c1-2 3-1 4 2 4-3 8-2 12 4-4-2-7-1-9 2-2-2-5-1-6 2l-2 2-2-2c-1-3-4-4-6-2-2-3-5-4-9-2z"/></svg>',
    nino: '<svg viewBox="0 0 26 30" aria-hidden="true"><ellipse cx="8.5" cy="8" rx="3.2" ry="8"/><ellipse cx="17.5" cy="8" rx="3.2" ry="8"/><circle cx="13" cy="20" r="9"/></svg>'
  };
  function cursorsOn() { return store.get("samuka-cursors") !== "off"; }
  function tabId() {
    var id = store.sget("samuka-tab");
    if (!id) { id = Math.random().toString(36).slice(2, 10); store.sset("samuka-tab", id); }
    return id;
  }
  function client() { var A = window.SamukaAuth; return A && A.client && !A.mock() ? A.client() : null; }
  function identity() {
    var A = window.SamukaAuth, role = A && A.user() ? A.role() : "guest";
    return { id: tabId(), name: role === "guest" ? "guest" : A.publicName(), role: role };
  }

  /* ---------- badge ---------- */
  function paintBadge() {
    if (!badge) {
      var host = document.querySelector(".tabs__actions"); if (!host) return;
      badge = document.createElement("span");
      badge.className = "online";
      badge.setAttribute("role", "status");
      host.insertBefore(badge, host.firstChild);
    }
    var names = Object.keys(peers).map(function (k) { return peers[k].name; });
    badge.title = count > 1 ? "Here now: you, " + names.join(", ") : "Just you right now";
    badge.innerHTML = '<i aria-hidden="true"></i>' + count + '<span class="online__txt"> online</span>';
    badge.classList.toggle("is-crowd", count > 1);
  }

  /* ---------- positions ---------- */
  function anchorAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var sec = el && el.closest && el.closest("section[id], footer, header");
    return sec || document.querySelector("main") || document.body;
  }
  function encode(e) {
    var sec = anchorAt(e.clientX, e.clientY), r = sec.getBoundingClientRect();
    var main = (document.querySelector("main") || document.body).getBoundingClientRect();
    return {
      s: sec.id || sec.tagName.toLowerCase(),
      fy: +((e.clientY - r.top) / Math.max(1, r.height)).toFixed(4),
      fx: +((e.clientX - main.left) / Math.max(1, main.width)).toFixed(4)
    };
  }
  function decode(p) {
    var sec = (p.s && (document.getElementById(p.s) || document.querySelector(p.s))) || document.querySelector("main");
    if (!sec) return null;
    var r = sec.getBoundingClientRect(), main = (document.querySelector("main") || document.body).getBoundingClientRect();
    return { x: main.left + p.fx * main.width + scrollX, y: r.top + scrollY + p.fy * r.height };
  }
  function ghost(id) {
    if (ghosts[id]) return ghosts[id];
    var peer = peers[id] || { name: "guest", role: "guest" };
    var el = document.createElement("div");
    el.className = "ghost ghost--" + (peer.role === "samuka" || peer.role === "nino" ? peer.role : "dev");
    el.innerHTML = '<span class="ghost__icon">' + (ICON[peer.role] || ICON.arrow) + '</span><span class="ghost__name">' + esc(peer.name) + "</span>";
    layer.appendChild(el);
    ghosts[id] = { el: el, idle: 0 };
    return ghosts[id];
  }
  function dropGhost(id) { var g = ghosts[id]; if (g) { g.el.remove(); clearTimeout(g.idle); delete ghosts[id]; } }
  function onCursor(msg) {
    var p = msg.payload; if (!p || !p.id || p.id === tabId() || !cursorsOn() || !peers[p.id]) return;
    var pos = decode(p); if (!pos) return;
    var g = ghost(p.id);
    g.el.style.transform = "translate(" + pos.x.toFixed(0) + "px," + pos.y.toFixed(0) + "px)";
    g.el.classList.add("is-on");
    clearTimeout(g.idle);
    g.idle = setTimeout(function () { g.el.classList.remove("is-on"); }, 5000);
  }
  function onMove(e) {
    if (!channel || count < 2 || !cursorsOn() || e.pointerType === "touch") return;
    var now = performance.now();
    if (now - lastSend < 120) return;
    if (lastXY && Math.abs(lastXY[0] - e.clientX) + Math.abs(lastXY[1] - e.clientY) < 6) return;
    lastSend = now; lastXY = [e.clientX, e.clientY];
    var p = encode(e); p.id = tabId();
    channel.send({ type: "broadcast", event: "cursor", payload: p });
  }

  /* ---------- channel ---------- */
  function join() {
    var c = client(); if (!c) { count = 1; paintBadge(); return; }
    var who = identity(), sig = who.name + "|" + who.role;
    if (channel && joinedFor === sig) return;
    leave();
    joinedFor = sig; me = who;
    channel = c.channel("site-presence", { config: { presence: { key: who.id }, broadcast: { self: false } } });
    channel.on("presence", { event: "sync" }, function () {
      var st = channel.presenceState(); peers = {};
      Object.keys(st).forEach(function (k) { if (k !== who.id && st[k][0]) peers[k] = st[k][0]; });
      Object.keys(ghosts).forEach(function (id) { if (!peers[id]) dropGhost(id); });
      count = Object.keys(peers).length + 1;
      paintBadge();
      if (count > 1 && window.SamukaAch) window.SamukaAch.unlock("crowd");
    });
    channel.on("broadcast", { event: "cursor" }, onCursor);
    channel.subscribe(function (status) {
      if (status === "SUBSCRIBED") channel.track({ name: who.name, role: who.role });
    });
  }
  function leave() {
    if (channel) { try { channel.unsubscribe(); } catch (e) {} channel = null; }
    Object.keys(ghosts).forEach(dropGhost); peers = {}; count = 1;
  }

  function boot() {
    layer = document.createElement("div");
    layer.className = "ghosts" + (reduced ? " ghosts--still" : "");
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    paintBadge();
    if (finePointer) window.addEventListener("pointermove", onMove, { passive: true });
    var A = window.SamukaAuth;
    if (A && A.extend) A.extend(function (state) {
      if (!state.user) return "";
      return '<label class="acct__toggle"><input type="checkbox" data-cursors' + (cursorsOn() ? " checked" : "") + "><span>Show live cursors of other visitors</span></label>";
    });
    document.addEventListener("change", function (e) {
      if (e.target.matches && e.target.matches("[data-cursors]")) setCursors(e.target.checked);
    });
    // join once auth has settled (guests join too, as "guest")
    setTimeout(function () { if (!channel) join(); }, 2500);
  }
  function setCursors(on) {
    store.set("samuka-cursors", on ? null : "off");
    layer.hidden = !on;
    if (!on) Object.keys(ghosts).forEach(dropGhost);
  }
  window.addEventListener("samuka:auth", function (e) { if (e.detail && "user" in e.detail) setTimeout(join, 50); });
  document.addEventListener("visibilitychange", function () {
    if (!channel) return;
    if (document.hidden) channel.untrack(); else channel.track({ name: me.name, role: me.role });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.SamukaPresence = {
    count: function () { return count; },
    peers: function () { return Object.keys(peers).map(function (k) { return peers[k]; }); },
    cursors: function (on) { if (on != null) setCursors(!!on); return cursorsOn(); }
  };
})();
