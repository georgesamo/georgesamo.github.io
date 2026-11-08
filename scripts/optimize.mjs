// Post-build optimizer for the Jekyll output (runs in CI after `jekyll build`, before deploy).
//   1. minifies every JS and CSS file under _site/assets with esbuild (same file names)
//   2. replaces the per-deploy cache-buster (?v=<build time>) in every page with a content hash,
//      so a deploy only invalidates the files that actually changed; browsers and the service
//      worker keep everything else
// usage: node scripts/optimize.mjs [_site]
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { transform } from "esbuild";

const site = path.resolve(process.argv[2] || "_site");

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const urlOf = (file) => "/" + path.relative(site, file).split(path.sep).join("/");

const files = await walk(site);
const assets = files.filter((f) => /[\\/]assets[\\/].*\.(js|css)$/.test(f) && !/\.min\.(js|css)$/.test(f));
const hashes = new Map();
let before = 0, after = 0;

for (const file of assets) {
  const src = await readFile(file, "utf8");
  const loader = file.endsWith(".css") ? "css" : "js";
  // no target: keep the syntax as written, only strip whitespace/comments and shorten names.
  // Scripts stay classic scripts (no format), so top-level globals keep their names.
  const { code, warnings } = await transform(src, { loader, minify: true, legalComments: "none", charset: "utf8", sourcefile: urlOf(file) });
  for (const w of warnings) console.warn(`warning ${urlOf(file)}: ${w.text}`);
  await writeFile(file, code);
  before += Buffer.byteLength(src); after += Buffer.byteLength(code);
  hashes.set(urlOf(file), createHash("sha256").update(code).digest("hex").slice(0, 10));
}

// pages (and anything else that links assets with the build-time cache-buster)
let rewritten = 0, misses = new Set();
for (const file of files.filter((f) => /\.(html|xml|json|webmanifest)$/.test(f))) {
  const html = await readFile(file, "utf8");
  const next = html.replace(/(\/assets\/[^"'?\s>]+\.(?:js|css))\?v=\d+/g, (m, url) => {
    const h = hashes.get(url);
    if (!h) { misses.add(url); return m; }
    rewritten++;
    return `${url}?v=${h}`;
  });
  if (next !== html) await writeFile(file, next);
}

console.log(`minified ${assets.length} files: ${kb(before)} -> ${kb(after)} (${Math.round((1 - after / before) * 100)}% smaller)`);
console.log(`content-hashed ${rewritten} asset links`);
if (misses.size) { console.error("asset links with no file:", [...misses].join(", ")); process.exitCode = 1; }
