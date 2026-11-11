// Deep test of the BUILT, optimized site: the automated half of the /deep-test skill
// (.claude/skills/deep-test). Runs after the unit tests and the smoke test, and gates the deploy.
//   usage: node tests/deep.mjs http://127.0.0.1:4200 [--strict]
//
// Every page × {desktop, phone}: page errors, failed same-origin requests, missing modules,
// horizontal overflow, broken links/images, duplicated singletons, plus the visual probe
// (icons off-centre in their buttons, colour emoji mixed with flat icons, clipped text).
// Then flows: seamless navigation + back/forward, theme toggle, every arcade game open/play/close,
// command palette, phone "more" sheet, mock roles (?as=, works because CI serves 127.0.0.1),
// and the music dock.
//
// Errors fail the job. Warnings (visual, a11y, touch-target size) are reported in the job
// summary and the deep-report artifact but only fail with --strict / DEEP_STRICT=1, because CI
// fonts aren't the fonts on a real phone.
import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";

const base = (process.argv[2] || "http://127.0.0.1:4200").replace(/\/$/, "");
const origin = new URL(base).origin;
const STRICT = process.argv.includes("--strict") || process.env.DEEP_STRICT === "1";
const OUT = process.env.DEEP_OUT || "deep-report";
mkdirSync(OUT, { recursive: true });
const PAGE_PROBE = readFileSync(new URL("./probes/page.js", import.meta.url), "utf8");
const VISUAL_PROBE = readFileSync(new URL("./probes/visual.js", import.meta.url), "utf8");

// pages on the shell layout get the module check; the rest only the generic ones
const SHELL_PAGES = ["/", "/games/", "/leaderboards/", "/events/", "/news/", "/watch/", "/samuka/", "/blog/", "/settings/", "/u/", "/nino/", "/soundtrack/", "/offline/"];
const OTHER_PAGES = ["/404.html"];
const VIEWPORTS = [
  { name: "desktop", opts: { viewport: { width: 1280, height: 800 } } },
  { name: "phone", opts: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["Pixel 7"].userAgent } }
];

const findings = [];
let shots = 0;
const add = (level, where, check, detail) => findings.push({ level, where, check, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";

async function snap(page, name, clip) {
  if (shots >= 60) return null;   // keep the artifact small
  const file = `${OUT}/${String(++shots).padStart(2, "0")}-${slug(name)}.png`;
  try { await page.screenshot({ path: file, clip, fullPage: !clip }); return file; } catch (e) { return null; }
}

// a page with its own error collectors
async function openPage(context, path, label) {
  const page = await context.newPage();
  const errors = [], failed = [], consoleErrors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("response", (r) => {
    try { const u = new URL(r.url()); if (u.origin === origin && r.status() >= 400) failed.push(`${r.status()} ${u.pathname}${u.search}`); } catch (e) {}
  });
  const res = await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(900);   // deferred scripts, auth boot, load glitch
  const done = async () => {
    if (errors.length) add("error", label, "page errors", errors.join(" | "));
    if (failed.length) add("error", label, "failed same-origin requests", [...new Set(failed)].join(", "));
    if (consoleErrors.length) add("warn", label, "console errors", [...new Set(consoleErrors)].slice(0, 5).join(" | "));
    if (errors.length || failed.length) await snap(page, label);
    await page.close();
  };
  return { page, res, done };
}

async function pageChecks(context, vp, path, shell) {
  const label = `${vp.name} ${path}`;
  const { page, res, done } = await openPage(context, path, label);
  if (!res || !res.ok()) add("error", label, "http", `status ${res ? res.status() : "none"}`);
  const p = await page.evaluate(PAGE_PROBE);
  if (shell && p.missingModules.length) add("error", label, "missing modules", p.missingModules.join(", "));
  if (p.pageOverflowPx > 0) { add("error", label, "horizontal overflow", `${p.pageOverflowPx}px: ${p.overflowing.join(", ")}`); await snap(page, label + " overflow"); }
  if (p.brokenLinks.length) add("error", label, "broken links", p.brokenLinks.join(", "));
  if (p.brokenImages.length) add("error", label, "broken images", p.brokenImages.join(", "));
  if (p.duplicatedSingletons.length) add("error", label, "duplicated singletons", p.duplicatedSingletons.join(", "));
  if (p.deadAnchors.length) add("warn", label, "dead #anchors", p.deadAnchors.join(", "));
  if (p.duplicateIds.length) add("warn", label, "duplicate ids", p.duplicateIds.join(", "));
  if (p.unnamedControls.length) add("warn", label, "controls without a name", p.unnamedControls.join(", "));
  if (p.imgsWithoutAlt.length) add("warn", label, "images without alt", p.imgsWithoutAlt.join(", "));
  if (shell && p.visibleH1s !== 1) add("warn", label, "visible h1 count", String(p.visibleH1s));
  if (vp.name === "phone" && p.smallTouchTargets.length > 3) add("warn", label, "small touch targets (<32px)", p.smallTouchTargets.slice(0, 8).join(", "));
  await visual(page, label);
  await done();
}

async function visual(page, label, scope) {
  await page.evaluate((s) => { if (s) window.__vtRoot = s; else delete window.__vtRoot; }, scope || null);
  const v = await page.evaluate(VISUAL_PROBE);
  for (const m of v.misaligned) {
    const [x0, y0, x1, y1] = m.zoom;
    const file = await snap(page, `${label} icon ${m.el}`, { x: Math.max(0, x0), y: Math.max(0, y0), width: Math.max(1, x1 - Math.max(0, x0)), height: Math.max(1, y1 - Math.max(0, y0)) });
    add("warn", label + (scope ? ` ${scope}` : ""), "icon off-centre", `${m.el} "${m.name}" ${m.box} ${m.icon} off x=${m.offPx.x} y=${m.offPx.y}${m.inkSpillsOut ? " (spills out)" : ""}${file ? " → " + file : ""}`);
  }
  for (const m of v.mixedIconStyles) add("warn", label + (scope ? ` ${scope}` : ""), "mixed icon styles", m);
  if (v.clippedText.length) add("warn", label + (scope ? ` ${scope}` : ""), "clipped text", v.clippedText.slice(0, 6).join(", "));
}

/* ---------- flows ---------- */

// seamless navigation: no full reloads, title/URL follow, back/forward work, nothing doubles
async function navFlow(context, vp) {
  const label = `${vp.name} flow:nav`;
  const { page, done } = await openPage(context, "/", label);
  await page.evaluate(() => { window.__deepMarker = 1; });
  const route = ["/games/", "/leaderboards/", "/events/", "/samuka/", "/"];
  for (const p of route) {
    const link = page.locator(`a[href="${p}"]:visible`).first();
    if (!(await link.count())) { add("error", label, "nav link missing", `no visible link to ${p}`); continue; }
    await link.click();
    try { await page.waitForURL(base + p, { timeout: 5000 }); } catch (e) { add("error", label, "nav", `clicking ${p} didn't change the URL`); continue; }
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({ marker: window.__deepMarker, title: document.title, current: [...document.querySelectorAll('[aria-current="page"]')].some((a) => a.pathname === location.pathname) }));
    if (st.marker !== 1) { add("error", label, "seamless nav", `${p} did a full page load (music would stop)`); await page.evaluate(() => { window.__deepMarker = 1; }); }
    if (!st.title) add("error", label, "nav", `${p} has no title`);
    if (!st.current) add("warn", label, "nav highlight", `no aria-current link for ${p}`);
  }
  await page.goBack(); await page.waitForTimeout(500);
  if (!page.url().endsWith("/samuka/")) add("error", label, "back button", `back from / went to ${page.url()}`);
  await page.goForward(); await page.waitForTimeout(500);
  if (new URL(page.url()).pathname !== "/") add("error", label, "forward button", `forward went to ${page.url()}`);
  // rapid swaps: modules re-init on samuka:page, and must not pile up
  await page.evaluate(async () => { for (const p of ["/games/", "/events/", "/", "/leaderboards/", "/samuka/", "/games/", "/", "/events/", "/leaderboards/", "/"]) { window.SamukaNav.go(p); await new Promise((r) => setTimeout(r, 120)); } });
  await page.waitForTimeout(1200);
  const p = await page.evaluate(PAGE_PROBE);
  if (p.duplicatedSingletons.length) add("error", label, "duplicated after 10 swaps", p.duplicatedSingletons.join(", "));
  if (p.missingModules.length) add("error", label, "modules lost after swaps", p.missingModules.join(", "));
  await done();
}

// dark/light toggle flips, persists over a reload, and updates theme-color
async function themeFlow(context, vp) {
  const label = `${vp.name} flow:theme`;
  const { page, done } = await openPage(context, "/", label);
  const before = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, meta: document.querySelector('meta[name="theme-color"]')?.content }));
  const btn = page.locator("[data-toggle-theme]:visible").first();
  if (!(await btn.count())) { add("error", label, "theme toggle", "no visible [data-toggle-theme]"); return done(); }
  await btn.click(); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, meta: document.querySelector('meta[name="theme-color"]')?.content }));
  if (after.t === before.t) add("error", label, "theme toggle", `data-theme stayed ${before.t}`);
  if (after.meta === before.meta) add("warn", label, "theme-color", "meta theme-color didn't change");
  await visual(page, label + " " + after.t);
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(600);
  const reloaded = await page.evaluate(() => document.documentElement.dataset.theme);
  if (reloaded !== after.t) add("error", label, "theme persistence", `reload went back to ${reloaded}`);
  await done();
}

// every arcade game: opens, takes input, stays on screen, closes with Esc, reopens clean
async function gamesFlow(context, vp) {
  const label = `${vp.name} flow:games`;
  const { page, done } = await openPage(context, "/", label);
  const games = await page.evaluate(() => (window.SamukaArcade ? window.SamukaArcade.list().map((g) => g.id) : []));
  if (!games.length) add("error", label, "arcade", "SamukaArcade.list() is empty");
  await page.evaluate(() => { window.__deepEvents = []; window.addEventListener("samuka:game", (e) => window.__deepEvents.push((e.detail || {}).game + ":" + (e.detail || {}).name)); });
  for (const id of games) {
    for (let round = 0; round < 2; round++) {
      await page.evaluate((g) => window.SamukaArcade.open(g), id);
      await page.waitForTimeout(600);
      const st = await page.evaluate(() => {
        const s = document.querySelector(".arcade__stage"), r = s && s.getBoundingClientRect();
        return { open: window.SamukaArcade.isOpen(), cur: window.SamukaArcade.current(), modals: document.querySelectorAll(".arcade").length,
          rect: r && { l: r.left, t: r.top, r: r.right, b: r.bottom }, vw: document.documentElement.clientWidth, vh: innerHeight };
      });
      if (!st.open || st.cur !== id) { add("error", label, "game open", `${id} didn't open (current=${st.cur})`); break; }
      if (st.modals > 1) add("error", label, "game modal", `${st.modals} .arcade modals`);
      if (st.rect && (st.rect.l < -1 || st.rect.r > st.vw + 1 || st.rect.t < -1 || st.rect.b > st.vh + 1)) { add("warn", label, "game fit", `${id} stage ${JSON.stringify(st.rect)} vs ${st.vw}x${st.vh}`); await snap(page, `${label} ${id} fit`); }
      if (round === 0) {
        // a few generic inputs; games start on any of these
        for (const k of ["Space", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "1", "2"]) { await page.keyboard.press(k); await page.waitForTimeout(80); }
        if (vp.name === "phone") { const box = await page.locator(".arcade__stage").boundingBox(); if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); }
        await page.waitForTimeout(700);
        await visual(page, `${label} ${id}`, ".arcade");
      }
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
      if (await page.evaluate(() => window.SamukaArcade.isOpen())) {   // first Esc may close an overlay (pause / game over)
        await page.keyboard.press("Escape"); await page.waitForTimeout(400);
        if (await page.evaluate(() => window.SamukaArcade.isOpen())) { add("error", label, "game close", `${id} didn't close with Esc`); await page.evaluate(() => window.SamukaArcade.close()); }
      }
    }
  }
  const ev = await page.evaluate(() => window.__deepEvents);
  for (const id of games) if (!ev.includes(id + ":closed")) add("warn", label, "game events", `no samuka:game closed for ${id} (${ev.join(", ")})`);
  await done();
}

// Ctrl+P palette opens, filters, closes with Esc
async function paletteFlow(context, vp) {
  const label = `${vp.name} flow:palette`;
  const { page, done } = await openPage(context, "/", label);
  await page.keyboard.press("Control+KeyP"); await page.waitForTimeout(300);
  const open = await page.evaluate(() => { const p = document.querySelector(".pal"); return !!p && !p.hidden; });
  if (!open) { add("error", label, "palette", "Ctrl+P didn't open the palette"); return done(); }
  await page.keyboard.type("games"); await page.waitForTimeout(200);
  await visual(page, label, ".pal");
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  if (await page.evaluate(() => { const p = document.querySelector(".pal"); return !!p && !p.hidden; })) add("error", label, "palette", "Esc didn't close the palette");
  await done();
}

// phone bottom bar: "more" opens the sheet, the backdrop closes it
async function sheetFlow(context, vp) {
  const label = `${vp.name} flow:more-sheet`;
  const { page, done } = await openPage(context, "/", label);
  const more = page.locator("[data-mnav-more]:visible").first();
  if (!(await more.count())) { add("error", label, "phone nav", "no visible 'more' button in .mnav"); return done(); }
  await more.click(); await page.waitForTimeout(400);
  if (await page.evaluate(() => document.getElementById("msheet").hidden)) { add("error", label, "more sheet", "didn't open"); return done(); }
  await visual(page, label, "#msheet");
  await page.locator(".msheet__backdrop").click({ position: { x: 10, y: 10 } }); await page.waitForTimeout(400);
  if (!(await page.evaluate(() => document.getElementById("msheet").hidden))) add("error", label, "more sheet", "backdrop didn't close it");
  await done();
}

// local mock sessions: role lands on <html>, team-only links show only for the team
async function rolesFlow(browser, vp) {
  for (const role of ["user", "samuka", "nino"]) {
    const context = await browser.newContext(vp.opts);
    const label = `${vp.name} flow:role-${role}`;
    const { page, done } = await openPage(context, "/?as=" + role, label);
    const st = await page.evaluate(() => ({ role: document.documentElement.dataset.role, team: [...document.querySelectorAll("[data-team-only]")].some((el) => !el.hidden) }));
    if (st.role !== role) add("error", label, "mock role", `data-role is ${st.role}`);
    if (st.team !== (role !== "user")) add("error", label, "team-only links", `${st.team ? "visible" : "hidden"} for ${role}`);
    await visual(page, label);
    await page.goto(base + "/?as=out"); await page.waitForTimeout(600);
    const out = await page.evaluate(() => document.documentElement.dataset.role);
    if (out !== "guest") add("error", label, "sign out (?as=out)", `role stayed ${out}`);
    await done();
    await context.close();
  }
}

// music dock opens from ♪, renders, closes; music stopped again
async function musicFlow(context, vp) {
  const label = `${vp.name} flow:music`;
  const { page, done } = await openPage(context, "/", label);
  const btn = page.locator(".lofi-btn:visible").first();
  if (!(await btn.count())) { add("warn", label, "music", "no ♪ button (no Web Audio in this browser?)"); return done(); }
  await btn.click(); await page.waitForTimeout(1500);
  const open = await page.evaluate(() => { const d = document.querySelector(".mdock"); return !!d && !d.hidden; });
  if (!open) add("error", label, "music dock", "♪ didn't open the dock");
  else await visual(page, label, ".mdock");
  await page.evaluate(() => window.SamukaLofi && window.SamukaLofi.stop());
  await done();
}

/* ---------- run ---------- */
const started = Date.now();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext(vp.opts);
    for (const p of SHELL_PAGES) await pageChecks(context, vp, p, true).catch((e) => add("error", `${vp.name} ${p}`, "crashed", e.message));
    for (const p of OTHER_PAGES) await pageChecks(context, vp, p, false).catch((e) => add("error", `${vp.name} ${p}`, "crashed", e.message));
    const flows = [navFlow, themeFlow, gamesFlow, musicFlow, vp.name === "desktop" ? paletteFlow : sheetFlow];
    for (const f of flows) {
      const c = await browser.newContext(vp.opts);   // fresh storage per flow
      await f(c, vp).catch((e) => add("error", `${vp.name} ${f.name}`, "crashed", e.message.split("\n")[0]));
      await c.close();
    }
    await rolesFlow(browser, vp).catch((e) => add("error", `${vp.name} rolesFlow`, "crashed", e.message.split("\n")[0]));
    await context.close();
  }
} finally {
  await browser.close();
}

/* ---------- report ---------- */
const errors = findings.filter((f) => f.level === "error"), warns = findings.filter((f) => f.level === "warn");
const secs = Math.round((Date.now() - started) / 1000);
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = [
  `## Deep test: ${errors.length ? "❌" : "✅"} ${errors.length} error(s), ${warns.length} warning(s)${STRICT ? " (strict)" : ""}`,
  `${SHELL_PAGES.length + OTHER_PAGES.length} pages × ${VIEWPORTS.length} viewports + nav/theme/games/music/palette/sheet/role flows, ${secs}s. Screenshots are in the **deep-report** artifact.`,
  "",
  ...(findings.length ? ["| level | where | check | detail |", "|---|---|---|---|", ...[...errors, ...warns].map((f) => `| ${f.level} | ${esc(f.where)} | ${esc(f.check)} | ${esc(f.detail).slice(0, 400)} |`)] : ["Nothing found."])
].join("\n");
writeFileSync(`${OUT}/report.json`, JSON.stringify({ base, strict: STRICT, seconds: secs, findings }, null, 2));
writeFileSync(`${OUT}/summary.md`, md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
for (const f of [...errors, ...warns]) console.log(`${f.level === "error" ? "FAIL" : "warn"} ${f.where} · ${f.check}: ${f.detail}`);
console.log(`\n${errors.length} error(s), ${warns.length} warning(s) in ${secs}s`);
process.exitCode = errors.length || (STRICT && warns.length) ? 1 : 0;
