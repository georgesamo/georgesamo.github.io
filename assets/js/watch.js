/* Samuka · /watch/: official trailers + video reviews
 * The grid is rendered by Jekyll from _data/videos.json (scripts/fetch_news.rb). This adds:
 *   - trailers / reviews tabs and a grep box (the tab can come from the URL: /watch/#reviews)
 *   - a theater: YouTube's privacy-enhanced embed in a <dialog>, with prev / next
 *   - the soundtrack steps aside: playing a video pauses the music, closing the theater resumes it
 *     (only if we were the ones who paused it); starting the music pauses the video
 * Listeners are delegated and registered once, so page swaps never stack them.
 */
(function () {
  "use strict";
  var TAB = "samuka-watch-tab", YT = "https://www.youtube-nocookie.com";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var state = { kind: "", q: "" }, dlg = null, cur = null, playing = false, musicPausedByUs = false;

  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    var d = Math.round(s / 86400); return d === 1 ? "yesterday" : d + " days ago";
  }
  function views(n) {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K views";
    return n + " views";
  }
  function root() { return document.querySelector("[data-watch]"); }
  function visibleLinks() {
    var r = root(); if (!r) return [];
    return Array.prototype.filter.call(r.querySelectorAll(".vid"), function (li) { return !li.hidden; })
      .map(function (li) { return li.querySelector("[data-vid]"); });
  }

  /* ---------- grid ---------- */
  function apply() {
    var r = root(); if (!r) return;
    var q = state.q.trim().toLowerCase(), shown = 0;
    r.querySelectorAll(".vid").forEach(function (li) {
      var ok = (!state.kind || li.dataset.kind === state.kind) && (!q || li.textContent.toLowerCase().indexOf(q) > -1);
      li.hidden = !ok; if (ok) shown++;
    });
    r.querySelectorAll("[data-watch-filter]").forEach(function (b) {
      var on = b.dataset.watchFilter === state.kind;
      b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on));
    });
    var none = r.querySelector("[data-watch-none]"); if (none) none.hidden = shown > 0;
  }
  function boot() {
    var r = root(); if (!r) { closeTheater(); return; }
    var h = (location.hash || "").slice(1), saved = store.get(TAB) || "";
    var k = /^(trailers|reviews)$/.test(h) ? h : saved;
    state = { kind: /^(trailers|reviews)$/.test(k) ? k : "", q: "" };
    var input = r.querySelector("[data-watch-q]"); if (input) input.value = "";
    r.querySelectorAll("[data-vid]").forEach(function (a) {
      var t = a.querySelector("time"), at = Date.parse(a.dataset.at);
      if (t && at) { t.textContent = ago(at); t.title = new Date(at).toLocaleString(); }
      var v = a.querySelector("[data-views]"); if (v) v.textContent = views(v.dataset.views);
    });
    var g = r.querySelector("[data-watch-ago]"); if (g) { var gt = Date.parse(g.getAttribute("datetime")); if (gt) g.textContent = ago(gt); }
    apply();
  }

  /* ---------- the soundtrack steps aside ---------- */
  function lofi() { return window.SamukaLofi || null; }
  function hushMusic() {
    var L = lofi();
    if (L && L.isOn() && !L.isPaused()) { musicPausedByUs = true; L.pause(); }
  }
  function bringBackMusic() {
    var L = lofi();
    if (musicPausedByUs && L && L.isOn() && L.isPaused()) L.resume();
    musicPausedByUs = false;
  }
  function ytSend(msg) {
    var f = dlg && dlg.querySelector("iframe");
    if (f && f.contentWindow) try { f.contentWindow.postMessage(JSON.stringify(msg), YT); } catch (e) {}
  }

  /* ---------- theater ---------- */
  function theater() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "theater";
    dlg.setAttribute("aria-label", "Video player");
    dlg.innerHTML =
      '<div class="theater__win">' +
        '<div class="theater__bar"><p class="theater__title" data-th-title></p>' +
        '<button type="button" class="theater__btn" data-th-close aria-label="Close video">✕</button></div>' +
        '<div class="theater__screen" data-th-screen></div>' +
        '<div class="theater__foot"><span class="theater__meta" data-th-meta></span><span class="theater__nav">' +
          '<button type="button" class="theater__btn" data-th-step="-1" aria-label="Previous video">◂ prev</button>' +
          '<button type="button" class="theater__btn" data-th-step="1" aria-label="Next video">next ▸</button>' +
          '<a class="theater__btn" data-th-yt target="_blank" rel="noopener external">YouTube ↗</a>' +
        "</span></div>" +
      "</div>";
    document.body.appendChild(dlg);
    // closing always goes through closeTheater (Esc included): some browsers never fire "close"
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeTheater(); });
    dlg.addEventListener("close", cleanup);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) closeTheater(); });   // the backdrop
    return dlg;
  }
  function play(a) {
    if (!a) return;
    var d = theater(), id = a.dataset.vid;
    cur = a; playing = true;
    hushMusic();
    var src = YT + "/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
    d.querySelector("[data-th-screen]").innerHTML = '<iframe src="' + esc(src) + '" title="' + esc(a.querySelector(".vid__title").textContent) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    var f = d.querySelector("iframe");
    f.addEventListener("load", function () { ytSend({ event: "listening", id: 1, channel: "widget" }); });
    d.querySelector("[data-th-title]").textContent = a.querySelector(".vid__title").textContent;
    var li = a.closest(".vid");
    d.querySelector("[data-th-meta]").innerHTML = '<span class="vid__kind vid__kind--' + esc(li.dataset.kind) + '">' + (li.dataset.kind === "reviews" ? "review" : "trailer") + "</span> " + esc(a.dataset.channel) + " · " + esc(a.querySelector("time") ? a.querySelector("time").textContent : "");
    d.querySelector("[data-th-yt]").href = a.href;
    var list = visibleLinks(), i = list.indexOf(a);
    d.querySelector('[data-th-step="-1"]').disabled = i <= 0;
    d.querySelector('[data-th-step="1"]').disabled = i < 0 || i >= list.length - 1;
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    d.querySelector("[data-th-close]").focus();
  }
  function stopVideo() {
    playing = false; cur = null;
    if (dlg) { var s = dlg.querySelector("[data-th-screen]"); if (s) s.innerHTML = ""; }
  }
  function cleanup() { stopVideo(); bringBackMusic(); }   // safe to run twice
  function closeTheater() {
    if (!dlg) return;
    if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
    cleanup();
  }
  function step(d) {
    var list = visibleLinks(), i = list.indexOf(cur);
    if (i > -1 && list[i + d]) play(list[i + d]);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target;
    if (!t) return;
    var f = t.closest("[data-watch-filter]");
    if (f) { state.kind = f.dataset.watchFilter; store.set(TAB, state.kind || null); apply(); return; }
    var a = t.closest("[data-vid]");
    if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button)) { e.preventDefault(); play(a); return; }
    if (t.closest("[data-th-close]")) { closeTheater(); return; }
    var s = t.closest("[data-th-step]"); if (s) step(+s.dataset.thStep);
  });
  document.addEventListener("input", function (e) {
    if (e.target.matches && e.target.matches("[data-watch-q]")) { state.q = e.target.value; apply(); }
  });
  document.addEventListener("keydown", function (e) {
    if (!dlg || !dlg.open || e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight" && e.shiftKey) step(1);
    if (e.key === "ArrowLeft" && e.shiftKey) step(-1);
  });
  // the player tells us when it's playing (after the "listening" handshake): hush the music again if
  // someone turned it back on, then pressed play on the video
  window.addEventListener("message", function (e) {
    if (!dlg || !dlg.open || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    var d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    if (!d) return;
    var st = d.event === "onStateChange" ? d.info : d.event === "infoDelivery" && d.info ? d.info.playerState : null;
    if (st === 1) { playing = true; hushMusic(); }
    else if (st === 0 || st === 2) playing = false;
    if (st === 0) step(1);   // a trailer ended: roll the next one
  });
  // music started while a video plays: the video pauses, and the music is the visitor's call now
  window.addEventListener("samuka:lofi", function (e) {
    var s = e.detail || {};
    if (!dlg || !dlg.open || !s.on || s.paused) return;
    if (playing) { ytSend({ event: "command", func: "pauseVideo", args: [] }); playing = false; }
    musicPausedByUs = false;
  });
  window.addEventListener("hashchange", function () { if (root()) boot(); });
  window.addEventListener("samuka:page", boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.SamukaWatch = { play: function (id) { var a = document.querySelector('[data-vid="' + CSS.escape(id) + '"]'); if (a) play(a); }, close: closeTheater };
})();
