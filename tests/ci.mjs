// Runs tests/index.html in headless Chrome and fails the job on any failing test.
// Used by .github/workflows/pages.yml (the site only deploys when this passes).
//   usage: node tests/ci.mjs http://127.0.0.1:4100/tests/
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:4100/tests/";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__testResults && window.__testResults.done, null, { timeout: 180000 });
  const r = await page.evaluate(() => window.__testResults);
  console.log(`${r.passed} passed · ${r.failed} failed · ${r.skipped} skipped`);
  r.failures.forEach((f) => console.log("  ✗ " + f));
  if (errors.length) console.log("page errors:\n  " + errors.join("\n  "));
  // integration tests skip themselves off localhost; in CI that would hide real failures
  process.exitCode = r.failed || r.skipped || !r.passed ? 1 : 0;
} catch (e) {
  console.error("test run failed:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
