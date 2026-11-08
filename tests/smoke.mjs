// Smoke test of the BUILT, optimized site (after scripts/optimize.mjs): every page loads its
// minified scripts without an uncaught error and the main modules are alive. Gates the deploy.
//   usage: node tests/smoke.mjs http://127.0.0.1:4200
import { chromium } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:4200").replace(/\/$/, "");
const PAGES = ["/", "/games/", "/leaderboards/", "/events/", "/samuka/", "/blog/", "/u/", "/soundtrack/"];
const MODULES = ["Samuka", "SamukaAuth", "SamukaAccountCore", "SamukaMe", "SamukaPalette", "SamukaArcade", "SamukaScores", "SamukaGlitch", "SamukaTextGlitch", "SamukaLoadGlitch", "SamukaNav"];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
try {
  for (const p of PAGES) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(base + p, { waitUntil: "load" });
    await page.waitForTimeout(800);   // deferred scripts, auth boot, load glitch
    const missing = await page.evaluate((mods) => mods.filter((m) => !window[m]), MODULES);
    const minified = await page.evaluate(() => [...document.scripts].filter((s) => /\/assets\/js\//.test(s.src)).every((s) => /\?v=[0-9a-f]{10}$/.test(s.src)));
    const ok = res && res.ok() && !errors.length && !missing.length && minified;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${p}` + (errors.length ? `\n     errors: ${errors.join(" | ")}` : "") + (missing.length ? `\n     missing: ${missing.join(", ")}` : "") + (minified ? "" : "\n     assets are not content-hashed"));
    await page.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
