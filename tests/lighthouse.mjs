// Lighthouse check of the BUILT, optimized site (the same github-pages artifact deep.mjs tests).
//   usage: node tests/lighthouse.mjs <site-dir> <mobile|desktop>
//
// Serves <site-dir> on 127.0.0.1 with gzip (like GitHub Pages does; tests/serve.py doesn't compress,
// which would make every page look 3-4x heavier than it is), runs Lighthouse RUNS times per page and
// takes the median of each number, then checks it against tests/lighthouse-budgets.json:
//   below "warn"  -> ::warning:: annotation, job stays green
//   below "fail"  -> ::error::, job fails, the deploy is blocked
// The fail lines sit well outside the run-to-run noise measured on CI (see the budgets file), so only
// a clear regression blocks; a small dip only warns.
//
// Writes lighthouse-report/<preset>-<page>.html (the median-performance run), all-runs.json and the
// job summary table.
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.argv[2] || "_site";
const PRESET = process.argv[3] || "mobile";
const OUT = process.env.LH_OUT || "lighthouse-report";
const BUDGETS = JSON.parse(readFileSync(new URL("./lighthouse-budgets.json", import.meta.url), "utf8"));
const RUNS = Number(process.env.LH_RUNS || BUDGETS.runs || 5);
const PAGES = BUDGETS.pages;
mkdirSync(OUT, { recursive: true });

// ---- static server: Jekyll pretty URLs, 404.html, gzip for text (what Pages serves) ----
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg", ".pdf": "application/pdf" };
const COMPRESS = /^(text\/|application\/(json|manifest\+json|xml)|image\/svg)/;
const gzCache = new Map();
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(ROOT, normalize(path).replace(/^([/\\])+/, ""));
  let status = 200;
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith("/")) { res.writeHead(301, { Location: path + "/" }); return res.end(); }
    file = join(file, "index.html");
  } else if (!existsSync(file) && existsSync(file + ".html")) file += ".html";
  if (!existsSync(file)) { file = join(ROOT, "404.html"); status = 404; }
  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
  const headers = { "Content-Type": type, "Cache-Control": "max-age=600" };   // Pages' own cache header
  let body = readFileSync(file);
  if (COMPRESS.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    if (!gzCache.has(file)) gzCache.set(file, gzipSync(body, { level: 9 }));
    body = gzCache.get(file);
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
  }
  headers["Content-Length"] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- the numbers we track ----
// dir: +1 = higher is better (scores), -1 = lower is better
const METRICS = [
  { key: "performance", label: "Perf", dir: 1, fmt: (v) => Math.round(v) },
  { key: "accessibility", label: "A11y", dir: 1, fmt: (v) => Math.round(v) },
  { key: "best-practices", label: "Best pr.", dir: 1, fmt: (v) => Math.round(v) },
  { key: "seo", label: "SEO", dir: 1, fmt: (v) => Math.round(v) },
  { key: "lcp", label: "LCP", dir: -1, fmt: (v) => (v / 1000).toFixed(2) + " s" },
  { key: "cls", label: "CLS", dir: -1, fmt: (v) => v.toFixed(3) },
  { key: "jsKB", label: "JS", dir: -1, fmt: (v) => Math.round(v) + " KB" },
  { key: "cssKB", label: "CSS", dir: -1, fmt: (v) => Math.round(v) + " KB" }
];

function numbers(lhr) {
  const cat = (k) => (lhr.categories[k]?.score ?? 0) * 100;
  const reqs = lhr.audits["network-requests"]?.details?.items || [];
  const bytes = (type) => reqs.filter((r) => r.resourceType === type).reduce((s, r) => s + (r.transferSize || 0), 0) / 1024;
  return {
    performance: cat("performance"), accessibility: cat("accessibility"), "best-practices": cat("best-practices"), seo: cat("seo"),
    lcp: lhr.audits["largest-contentful-paint"]?.numericValue ?? NaN,
    cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? NaN,
    jsKB: bytes("Script"), cssKB: bytes("Stylesheet")
  };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const slug = (p) => p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

// ---- run ----
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
const flags = { port: chrome.port, output: "html", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] };
const config = PRESET === "desktop" ? desktopConfig : undefined;
const all = {};
const rows = [];
let fails = 0, warns = 0;
try {
  for (const page of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await lighthouse(BASE + page, flags, config);
      if (!r?.lhr || r.lhr.runtimeError) { console.log(`::warning::${PRESET} ${page} run ${i + 1}: ${r?.lhr?.runtimeError?.message || "no result"}`); continue; }
      runs.push({ n: numbers(r.lhr), report: r.report });
      console.log(`${PRESET} ${page} run ${i + 1}/${RUNS}: perf ${Math.round(runs.at(-1).n.performance)}, LCP ${Math.round(runs.at(-1).n.lcp)} ms`);
    }
    if (!runs.length) { fails++; rows.push({ page, missing: true }); console.log(`::error::${PRESET} ${page}: Lighthouse produced no result`); continue; }
    const med = {};
    for (const m of METRICS) med[m.key] = median(runs.map((r) => r.n[m.key]));
    // keep the report of the run whose performance score is closest to the median
    const pick = runs.reduce((a, b) => (Math.abs(b.n.performance - med.performance) < Math.abs(a.n.performance - med.performance) ? b : a));
    writeFileSync(`${OUT}/${PRESET}-${slug(page)}.html`, pick.report);
    all[page] = { median: med, runs: runs.map((r) => r.n) };

    const budget = BUDGETS.budgets?.[PRESET]?.[page] || {};
    const cells = {};
    for (const m of METRICS) {
      const v = med[m.key], b = budget[m.key];
      let mark = "";
      if (b) {
        const worse = (lim) => (m.dir > 0 ? v < lim : v > lim);
        if (b.fail != null && worse(b.fail)) { mark = " ❌"; fails++; console.log(`::error::${PRESET} ${page}: ${m.label} ${m.fmt(v)} is past the blocking budget ${m.fmt(b.fail)} (median of ${runs.length})`); }
        else if (b.warn != null && worse(b.warn)) { mark = " ⚠️"; warns++; console.log(`::warning::${PRESET} ${page}: ${m.label} ${m.fmt(v)} is past the warning budget ${m.fmt(b.warn)} (median of ${runs.length})`); }
      }
      cells[m.key] = m.fmt(v) + mark;
    }
    const perfs = runs.map((r) => Math.round(r.n.performance));
    rows.push({ page, cells, range: `${Math.min(...perfs)}–${Math.max(...perfs)}`, n: runs.length });
  }
} finally {
  await chrome.kill();
  server.close();
}

writeFileSync(`${OUT}/${PRESET}-all-runs.json`, JSON.stringify(all, null, 2));
const head = `| page | ${METRICS.map((m) => m.label).join(" | ")} | perf range |\n|---|${METRICS.map(() => "---:").join("|")}|---:|\n`;
const body = rows.map((r) => r.missing ? `| \`${r.page}\` | ${METRICS.map(() => "–").join(" | ")} | no result ❌ |`
  : `| \`${r.page}\` | ${METRICS.map((m) => r.cells[m.key]).join(" | ")} | ${r.range} (${r.n} runs) |`).join("\n");
const verdict = fails ? `❌ ${fails} blocking budget miss(es)` : warns ? `⚠️ ${warns} warning(s), nothing blocking` : "✅ all within budget";
const md = `### Lighthouse — ${PRESET} (median of ${RUNS} runs)\n\n${verdict}\n\n${head}${body}\n\n` +
  `Bytes are gzip transfer sizes. ⚠️ = past the warning budget (doesn't block), ❌ = past the blocking budget. ` +
  `Budgets: \`tests/lighthouse-budgets.json\`. HTML reports: the \`lighthouse-${PRESET}\` artifact.\n`;
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
process.exit(fails ? 1 : 0);
