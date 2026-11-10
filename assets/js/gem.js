/* Samuka · wireframe ruby with orbiting skills (canvas 2D, no deps) */
(function () {
  "use strict";
  var canvas = document.getElementById("gem-canvas");
  if (!canvas || !canvas.getContext || canvas.__gem) return;
  canvas.__gem = true;
  var ctx = canvas.getContext("2d");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- geometry: a brilliant-cut gem, y up ---- */
  var N = 8, V = [], E = [], F = [];
  var TAU = Math.PI * 2;
  function v(x, y, z) { V.push([x, y, z]); return V.length - 1; }
  var T = [], G = [], P = [];
  for (var i = 0; i < N; i++) {
    var a = (i / N) * TAU;
    T.push(v(Math.cos(a) * 0.5, 0.46, Math.sin(a) * 0.5));
  }
  for (i = 0; i < N * 2; i++) {
    var b = (i / (N * 2)) * TAU + TAU / (N * 4);
    G.push(v(Math.cos(b) * 1.0, 0.1, Math.sin(b) * 1.0));
  }
  for (i = 0; i < N; i++) {
    var c = (i / N) * TAU + TAU / (N * 2);
    P.push(v(Math.cos(c) * 0.42, -0.5, Math.sin(c) * 0.42));
  }
  var C = v(0, -1.08, 0);
  function edge(a, b) { E.push([a, b]); }
  for (i = 0; i < N; i++) {
    var t0 = T[i], t1 = T[(i + 1) % N];
    var g0 = G[i * 2], g1 = G[i * 2 + 1], g2 = G[(i * 2 + 2) % (N * 2)];
    edge(t0, t1);                // table
    edge(t0, g0); edge(t0, g1); edge(t1, g1); // crown
    edge(g0, g1); edge(g1, g2);  // girdle
    F.push([t0, t1, g1], [t0, g1, g0]);
    var p0 = P[i];
    edge(g1, p0); edge(p0, C); edge(g0, p0); edge(g2, p0);
    F.push([g0, g1, p0], [g1, g2, p0], [p0, C, g2]);
  }
  F.push(T.slice()); // table face

  /* ---- skills orbiting ---- */
  var data = (window.Samuka && window.Samuka.data) || {};
  try { if (!data.skills) data = JSON.parse(document.getElementById("resume-data").textContent); } catch (e) {}
  var pick = ["Ruby", "Ruby on Rails", "PostgreSQL", "Sidekiq", "Redis", "HL7 FHIR", "REST API", "ActiveRecord", "RSpec", "Elasticsearch", "Docker", "Microsoft SQL Server", "Service-oriented architecture", "AI-assisted coding (Claude)"];
  var allOrbit = pick.map(function (name, k) {
    return { name: name, phase: (k / pick.length) * TAU * 3, r: 1.55 + (k % 3) * 0.2, tilt: ((k % 5) - 2) * 0.22, y: ((k * 5) % 9 - 4) * 0.2, speed: 0.85 + (k % 4) * 0.09 };
  });
  var orbit = allOrbit;

  /* ---- state ---- */
  var W = 0, H = 0, DPR = 1, scale = 1;
  var rotY = 0.4, rotX = -0.42, velY = reduced ? 0 : 0.28, dragging = false, lastX = 0, lastY = 0, moved = 0, pointerTilt = 0, pointerTiltT = 0;
  var orbitAngle = 0;
  var shatter = { t: 1, dur: 1.7, dirs: [] }; // t: 0 → 1 (1 = at rest)
  var sparks = [];
  var colors = {};
  var running = false, visible = true, last = 0, lastDraw = 0;
  var calmMs = window.matchMedia("(pointer: coarse)").matches ? 48 : 30;   // the calm spin: ~20 fps on a phone (battery), ~30 on a desktop

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.ruby = cs.getPropertyValue("--accent").trim() || "#3ad08f";
    colors.ruby2 = cs.getPropertyValue("--accent-2").trim() || "#8ff0c2";
    colors.text = cs.getPropertyValue("--text-2").trim() || "#aab1bf";
    colors.muted = cs.getPropertyValue("--muted").trim() || "#6b7386";
    colors.blue = cs.getPropertyValue("--gold").trim() || "#e3bf62";
    colors.light = document.documentElement.dataset.theme === "light";
    colors.hl = cs.getPropertyValue("--hl").trim() || "#d9b45a"; // gold in dark mode
  }
  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (x) { return x + x; }).join("");
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    // a phone screen is dense enough that 1.5x looks as sharp for thin lines, and it is ~45% fewer pixels to paint
    DPR = Math.min(window.devicePixelRatio || 1, window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scale = Math.min(W * 0.2, H * 0.27);
    orbit = W < 520 ? allOrbit.filter(function (o, i) { return i % 2 === 0 || o.name.indexOf("Claude") > -1; }) : allOrbit; // fewer labels on phones
    paintGlow();
    if (!running) draw(0);
  }
  // the glow behind the gem never moves: a CSS background, painted once, instead of a canvas-wide fill every frame
  function paintGlow() {
    canvas.style.backgroundImage = "radial-gradient(circle " + Math.round(scale * 2.1) + "px at 50% 47%, " + rgba(colors.ruby, colors.light ? 0.10 : 0.16) + ", " + rgba(colors.ruby, 0) + ")";
    canvas.style.backgroundRepeat = "no-repeat";
  }

  function rot(p, ry, rx) {
    var x = p[0], y = p[1], z = p[2];
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    return [x1, y2, z2];
  }
  function proj(p) {
    var d = 4.2, f = d / (d - p[2]);
    return [W / 2 + p[0] * f * scale, H * 0.47 - p[1] * f * scale, p[2], f];
  }

  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function shatterK() {
    var t = shatter.t;
    if (t >= 1) return 0;
    if (t < 0.28) return ease(t / 0.28);
    var u = (t - 0.28) / 0.72;
    return 1 - (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  }
  function triggerShatter(fromAssembled) {
    shatter.t = fromAssembled === false ? 0.28 : 0;
    shatter.dirs = E.map(function () {
      return [(Math.random() - 0.5) * 2.4, (Math.random() - 0.3) * 2.4, (Math.random() - 0.5) * 2.4];
    });
    if (fromAssembled !== false) {
      for (var i = 0; i < 46; i++) {
        var a = Math.random() * TAU, s = 60 + Math.random() * 220;
        sparks.push({ x: W / 2, y: H * 0.47, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 1, r: 0.6 + Math.random() * 1.8 });
      }
    }
    wake();
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    var ry = rotY, rx = rotX + pointerTilt;
    var k = shatterK();

    // orbit labels (split into back / front)
    var labels = orbit.map(function (o) {
      var a = orbitAngle * o.speed + o.phase;
      var p = [Math.cos(a) * o.r, o.y + Math.sin(a) * o.tilt, Math.sin(a) * o.r];
      var q = proj(rot(p, 0, rotX * 0.6));
      return { o: o, q: q };
    }).sort(function (a, b) { return a.q[2] - b.q[2]; });
    function drawLabel(l) {
      var depth = (l.q[2] + 2) / 4; // 0 back .. 1 front
      var alpha = 0.18 + depth * 0.72;
      var size = 10 + depth * 3.2;
      ctx.font = "500 " + size.toFixed(1) + "px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      var tw = ctx.measureText(l.o.name).width;
      var x = Math.max(tw / 2 + 14, Math.min(W - tw / 2 - 4, l.q[0])); // keep labels inside the canvas
      ctx.fillStyle = rgba(l.o.name.indexOf("Claude") > -1 ? colors.ruby : colors.hl, alpha * 0.9);
      ctx.beginPath(); ctx.arc(x - tw / 2 - 7, l.q[1] - size * 0.32, 1.6 + depth * 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(colors.text, alpha);
      ctx.fillText(l.o.name, x, l.q[1]);
    }
    labels.forEach(function (l) { if (l.q[2] < 0) drawLabel(l); });

    // gem
    var R = V.map(function (p) { return rot(p, ry, rx); });
    var Pp = R.map(proj);
    // faces (painter's order)
    var light = [-0.4, 0.75, 0.55];
    var faces = k > 0.02 ? [] : F.map(function (f) {
      var a = R[f[0]], b = R[f[1]], c = R[f[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var nl = Math.hypot(nx, ny, nz) || 1;
      var shade = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / nl);
      var z = f.reduce(function (s, i) { return s + R[i][2]; }, 0) / f.length;
      return { f: f, z: z, shade: shade };
    }).sort(function (a, b) { return a.z - b.z; });
    faces.forEach(function (fc) {
      ctx.beginPath();
      fc.f.forEach(function (i, j) { var q = Pp[i]; j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fillStyle = rgba(colors.ruby, (colors.light ? 0.04 : 0.03) + fc.shade * (colors.light ? 0.16 : 0.2));
      ctx.fill();
    });
    // edges
    ctx.lineCap = "round";
    E.forEach(function (e, idx) {
      var a = R[e[0]], b = R[e[1]];
      if (k > 0) {
        var d = shatter.dirs[idx] || [0, 0, 0];
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
        var ox = (mx * 1.3 + d[0]) * k, oy = (my * 1.3 + d[1]) * k, oz = (mz * 1.3 + d[2]) * k;
        var spin = k * (idx % 2 ? 1.6 : -1.6);
        var cs = Math.cos(spin), sn = Math.sin(spin);
        var ax = a[0] - mx, ay = a[1] - my, bx = b[0] - mx, by = b[1] - my;
        a = [mx + ox + ax * cs - ay * sn, my + oy + ax * sn + ay * cs, a[2] + oz];
        b = [mx + ox + bx * cs - by * sn, my + oy + bx * sn + by * cs, b[2] + oz];
      }
      var pa = proj(a), pb = proj(b);
      var depth = ((a[2] + b[2]) / 2 + 1.2) / 2.4;
      ctx.strokeStyle = rgba(colors.ruby, 0.22 + Math.max(0, Math.min(1, depth)) * 0.78 * (1 - k * 0.35));
      ctx.lineWidth = 0.8 + depth * 1.1;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    });
    // vertices sparkle
    if (k < 0.05) {
      Pp.forEach(function (q, i) {
        if (q[2] < 0.15) return;
        var tw = 0.5 + 0.5 * Math.sin(orbitAngle * 6 + i * 1.7);
        ctx.fillStyle = rgba(i % 3 ? colors.hl : colors.ruby2, 0.25 + tw * 0.55);
        ctx.beginPath(); ctx.arc(q[0], q[1], 1.1 + tw * 1.1, 0, TAU); ctx.fill();
      });
    }
    // sparks
    sparks = sparks.filter(function (s) {
      s.life -= dt * 0.9; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.vx *= 0.985;
      if (s.life <= 0) return false;
      ctx.fillStyle = rgba(sparks.indexOf(s) % 2 ? colors.hl : colors.ruby2, s.life);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      return true;
    });
    labels.forEach(function (l) { if (l.q[2] >= 0) drawLabel(l); });
  }

  function frame(ts) {
    if (!running) return;
    var dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    if (!dragging) {
      var base = reduced ? 0 : 0.28;
      velY += (base - velY) * Math.min(1, dt * 1.5);
    }
    rotY += velY * dt;
    orbitAngle += dt * (reduced ? 0 : 0.22);
    pointerTilt += (pointerTiltT - pointerTilt) * Math.min(1, dt * 4);
    if (shatter.t < 1) shatter.t = Math.min(1, shatter.t + dt / shatter.dur);
    // a slow spin reads as smooth at 30 fps: draw every other frame unless something is moving fast
    var calm = !dragging && shatter.t >= 1 && !sparks.length && Math.abs(velY - (reduced ? 0 : 0.28)) < 0.02;
    if (!calm || ts - lastDraw >= calmMs) { draw(calm ? (ts - lastDraw) / 1000 : dt); lastDraw = ts; }
    var idle = reduced && !dragging && shatter.t >= 1 && !sparks.length && Math.abs(velY) < 0.001;
    if (!visible || idle || !canvas.isConnected) { running = false; return; }   // stops when the page was switched away
    requestAnimationFrame(frame);
  }
  function wake() {
    if (running || !visible) return;
    running = true; last = 0;
    requestAnimationFrame(frame);
  }

  /* ---- input ---- */
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    wake();
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    pointerTiltT = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
    if (!dragging) { wake(); return; }
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    rotY += dx * 0.012;
    rotX = Math.max(-1.1, Math.min(0.4, rotX + dy * 0.006));
    velY = dx * 0.6;
  });
  function release() {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (moved < 6) triggerShatter();
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", function () { dragging = false; canvas.classList.remove("is-dragging"); });
  canvas.addEventListener("pointerleave", function () { pointerTiltT = 0; });

  /* ---- lifecycle ---- */
  // app.js runs this file again for each new home page (seamless navigation swaps the canvas), so every
  // listener here belongs to this canvas and goes away with it - or each visit would leave a set behind
  var ac = window.AbortController ? new AbortController() : null, own = ac ? { signal: ac.signal } : false, io = null;
  readColors();
  resize();
  window.addEventListener("resize", resize, own);
  window.addEventListener("samuka:theme", function () { readColors(); paintGlow(); if (!running) draw(0); }, own);
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) wake(); });
    io.observe(canvas);
  }
  document.addEventListener("visibilitychange", function () { visible = !document.hidden; if (visible) wake(); }, own);
  window.addEventListener("samuka:page", function () {
    if (canvas.isConnected) return;
    visible = false; if (io) io.disconnect(); if (ac) ac.abort();
  }, own);

  function intro() {
    if (!reduced) triggerShatter(false); // assemble from fragments
    wake();
  }
  if (window.__samukaReady) intro(); else window.addEventListener("samuka:ready", intro, ac ? { once: true, signal: ac.signal } : { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!running) draw(0); });
  window.SamukaGem = { shatter: triggerShatter };
})();
