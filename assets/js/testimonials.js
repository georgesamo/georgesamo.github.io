/* Samuka · testimonials on the profile ("kind words")
 * Signed-in visitors can leave one recommendation; it appears only after
 * Samuka approves it in the admin panel. Editing sends it back for review.
 */
(function () {
  "use strict";
  var root = null, mine = null, list = [];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function A() { return window.SamukaAuth; }
  function db() { var a = A(); return a && a.client && !a.mock() ? a.client() : null; }

  async function load() {
    var c = db();
    if (!c) { list = [{ id: 1, name: "A former teammate", relation: "Engineer, worked together on a hospital booking system", body: "Sample testimonial for the local preview. Real ones appear here after Samuka approves them.", approved: true }]; mine = null; return paint(); }
    var r = await c.from("testimonials").select("id, name, relation, body, approved, created_at").eq("approved", true).order("created_at", { ascending: false }).limit(30);
    list = r.error ? [] : (r.data || []);
    mine = null;
    var a = A();
    if (a && a.user()) {
      var m = await c.rpc("my_testimonial");
      if (!m.error && a.role() !== "samuka") mine = m.data || null;
    }
    paint();
  }
  function form(t) {
    var a = A();
    if (!a || !a.enabled) return "";
    if (!a.user()) return '<p class="tm__cta muted">Worked with me? <button class="linkish" type="button" data-tm-signin>sign in</button> to leave a few words.</p>';
    if (a.role() === "samuka") return '<p class="tm__cta muted">New recommendations wait for you in 🛠 admin → testimonials.</p>';
    return '<details class="tm__form"' + (t ? "" : "") + '><summary>' + (t ? (t.approved ? "edit your recommendation" : "your recommendation is waiting for approval · edit") : "✍ leave a recommendation") + "</summary>" +
      '<form data-tm-form><label>your name<input name="name" maxlength="60" required value="' + esc(t ? t.name : "") + '"></label>' +
      '<label>how we worked together<input name="relation" maxlength="80" required placeholder="e.g. Engineering manager at …" value="' + esc(t ? t.relation : "") + '"></label>' +
      '<label>recommendation <small class="muted">20–600 characters</small><textarea name="body" minlength="20" maxlength="600" rows="4" required>' + esc(t ? t.body : "") + "</textarea></label>" +
      '<div class="tm__row"><button class="btn btn--primary" type="submit">' + (t ? "save changes" : "send for approval") + '</button><span class="muted" data-tm-msg role="status"></span></div></form></details>';
  }
  function paint() {
    if (!root) return;
    root.innerHTML = (list.length ? '<div class="tm__list">' + list.map(function (t) {
      return '<figure class="tm reveal is-in"><blockquote>' + esc(t.body) + '</blockquote><figcaption><b>' + esc(t.name) + "</b><span>" + esc(t.relation) + "</span></figcaption></figure>";
    }).join("") + "</div>" : '<p class="muted">No recommendations yet.</p>') + form(mine);
  }
  async function save(f) {
    var c = db(), msg = root.querySelector("[data-tm-msg]");
    var row = { name: f.elements.name.value.trim(), relation: f.elements.relation.value.trim(), body: f.elements.body.value.trim() };
    if (row.body.length < 20) { msg.textContent = "a little longer, please (20+ characters)"; return; }
    if (!c) { msg.textContent = "(local preview: not saved)"; return; }
    var r = mine ? await c.from("testimonials").update(row).eq("id", mine.id) : await c.from("testimonials").insert(row);
    if (r.error) { msg.textContent = /duplicate|unique/.test(r.error.message) ? "you already left one; edit it instead" : r.error.message; return; }
    msg.textContent = "✓ thanks! it appears here once Samuka approves it";
    setTimeout(load, 1200);
  }
  function boot() {
    root = document.querySelector("[data-testimonials]");
    if (!root) return;
    load();
  }
  document.addEventListener("submit", function (e) { if (root && e.target.matches("[data-tm-form]")) { e.preventDefault(); save(e.target); } });
  document.addEventListener("click", function (e) { if (root && e.target.closest("[data-tm-signin]")) { var a = A(); if (a) a.open(); } });
  window.addEventListener("samuka:auth", function () { if (root) load(); });
  window.addEventListener("samuka:page", boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
