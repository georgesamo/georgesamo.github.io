/* Samuka · #lobby chat inside the terminal (`chat`)
 * Messages live in public.chat_messages (last 40 shown, 200 chars, 6 a minute)
 * and arrive live through Supabase Realtime. Anyone can read; signed-in
 * visitors can talk; Samuka (owner) can delete with /del <id>.
 */
(function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sub = null, out = null, seen = {}, joined = false;
  function A() { return window.SamukaAuth; }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }
  function owner() { var a = A(); return !!(a && a.user() && a.role() === "samuka"); }
  function hhmm(t) { var d = new Date(t); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function line(m) {
    if (seen[m.id]) return; seen[m.id] = 1;
    var cls = m.role === "samuka" ? "chat__name--samuka" : m.role === "nino" ? "chat__name--nino" : "";
    out.print('<span class="dim">' + hhmm(m.created_at) + "</span> " + (owner() ? '<span class="dim">#' + m.id + "</span> " : "") +
      '<span class="chat__name ' + cls + '">' + esc(m.author) + '</span><span class="dim">:</span> ' + esc(m.body), "chat__line");
  }
  async function enter(o) {
    out = o; seen = {}; joined = true;
    var c = db();
    if (!c) { out.print('<span class="dim">(local test session: chat needs the live site)</span>'); return; }
    var r = await c.from("chat_messages").select("id, author, role, body, created_at").order("created_at", { ascending: false }).limit(40);
    if (r.error) { out.print('<span class="warn">chat is offline: ' + esc(r.error.message) + "</span>"); return; }
    (r.data || []).reverse().forEach(line);
    if (!(r.data || []).length) out.print('<span class="dim">no messages yet · say hi</span>');
    if (!sub) sub = c.channel("chat-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, function (p) { if (joined && out) line(p.new); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, function (p) { if (joined && out && p.old) out.print('<span class="dim">· message #' + p.old.id + " was removed</span>"); })
      .subscribe();
  }
  function leave() {
    joined = false;
    if (sub) { try { sub.unsubscribe(); } catch (e) {} sub = null; }
  }
  async function send(text) {
    var a = A(), c = db();
    if (!a || !a.user()) return '<span class="warn">read-only</span> · <span class="b">login</span> to talk';
    if (!c) return '<span class="dim">(local test session)</span>';
    var body = text.trim().slice(0, 200);
    if (!body) return null;
    var r = await c.from("chat_messages").insert({ author: a.publicName(), body: body }).select("id, author, role, body, created_at").single();
    if (r.error) { out.print('<span class="warn">' + (/minute/.test(r.error.message) ? "slow down: 6 messages a minute" : esc(r.error.message)) + "</span>"); return null; }
    line(r.data);
    if (window.SamukaAch) window.SamukaAch.unlock("chatty");
    return null;
  }
  async function del(id) {
    var c = db(); if (!c || !owner()) return '<span class="warn">403</span>';
    var r = await c.from("chat_messages").delete().eq("id", id);
    out.print(r.error ? '<span class="warn">' + esc(r.error.message) + "</span>" : '<span class="ok">deleted #' + id + "</span>");
    return null;
  }
  // returns html to print (or null); async results print themselves
  function input(raw) {
    var s = raw.trim();
    if (s === "/exit" || s === "/quit" || s === "exit") { leave(); return { leave: true, html: '<span class="dim">left #lobby</span>' }; }
    var P = window.SamukaPresence, seeWho = !!(P && P.visible && P.visible());
    if (s === "/help") return { html: (seeWho ? '<span class="b">/who</span> online now · ' : "") + '<span class="b">/exit</span> leave' + (owner() ? ' · <span class="b">/del &lt;id&gt;</span> remove a message' : "") };
    if (s === "/who" && seeWho) {
      var peers = P.peers();
      return { html: "online: you" + (peers.length ? ", " + peers.map(function (p) { return esc(p.name); }).join(", ") : "") };
    }
    var m = /^\/del\s+(\d+)$/.exec(s);
    if (m) { del(+m[1]); return { html: null }; }
    if (s.charAt(0) === "/") return { html: "unknown command · <span class=\"b\">/help</span>" };
    send(s).then(function (h) { if (h) out.print(h); });
    return { html: null };
  }
  window.SamukaChat = { enter: enter, leave: leave, input: input };
})();
