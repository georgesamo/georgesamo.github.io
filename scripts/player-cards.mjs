// Link previews for player cards (runs in CI after optimize.mjs, every build, so every 3 hours).
// Chat apps don't run JavaScript, and /u/?n=<name> is one static page for everyone, so for each
// player on the all-time boards this writes:
//   _site/u/<name>/index.html   preview tags (title, description, 1200x630 image), then sends people on to /u/?n=<name>
//   _site/u/<name>/card.jpg     the card, drawn by player.js's own drawCard() in headless Chrome
//   _site/u/cards.json          who has a page (player.js uses it to pick the short share link)
//   _site/assets/og/challenge-<game>.jpg   the preview image of /c/<game>/ (the link a challenge is shared as)
// Names outside [A-Za-z0-9._-] keep the query link. A failure only warns: the site still deploys.
//
// usage: node scripts/player-cards.mjs [_site]      (needs Chrome; PW_CHANNEL=chromium for Playwright's own)
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const site = path.resolve(process.argv[2] || "_site");
const HOST = "georgesamo.github.io", ORIGIN = "https://" + HOST;
const GAMES = ["gems", "sidekiq", "schema", "pitwall"];
const MAX = 60;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const safe = (n) => /^[A-Za-z0-9._-]{1,24}$/.test(n || "");

/* ---------- a tiny static server for the built site ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".xml": "application/xml" };
function serve(root) {
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(root, p);
      if (!file.startsWith(root)) throw new Error("outside");
      const st = await stat(file).catch(() => null);
      const f = st && st.isDirectory() ? path.join(file, "index.html") : file;
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      res.end(await readFile(f));
    } catch { res.writeHead(404); res.end("not found"); }
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

/* ---------- data: the public leaderboard + player_card RPCs (anon key, like the site) ---------- */
async function supabase() {
  let url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const cfg = await readFile(path.resolve("_config.yml"), "utf8");
    url = url || (cfg.match(/^\s+url:\s*"(https:\/\/[^"]+supabase\.co)"/m) || [])[1];
    key = key || (cfg.match(/^\s+anon_key:\s*"([^"]+)"/m) || [])[1];
  }
  if (!url || !key) throw new Error("no Supabase url/anon_key in _config.yml");
  return async (fn, body) => {
    const r = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(fn + ": HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    return r.json();
  };
}

/* ---------- the preview page ---------- */
function page(card) {
  const name = card.name, best = card.best || {};
  const top = Object.entries(card.ranks || {}).sort((a, b) => a[1].rank - b[1].rank)[0];
  const GN = { gems: "Gem Match", sidekiq: "Sidekiq Rush", schema: "Schema Stack", pitwall: "Pit Wall" };
  const bits = [];
  if (top) bits.push("#" + top[1].rank + " in " + GN[top[0]]);
  const hi = Object.entries(best).sort((a, b) => b[1] - a[1])[0];
  if (hi) bits.push("best " + fmt(hi[1]) + " in " + GN[hi[0]]);
  bits.push((card.achievements || []).length + " badges");
  const title = name + "'s player card · Samuka's Arcade";
  const desc = bits.join(" · ") + ". Small games about the Rails stack: play right away in your browser.";
  const card_url = "/u/?n=" + encodeURIComponent(name);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}/u/${esc(name)}/">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="Samuka's Arcade">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}/u/${esc(name)}/">
<meta property="og:image" content="${ORIGIN}/u/${esc(name)}/card.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(name)}'s player card: best scores and badges">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ORIGIN}/u/${esc(name)}/card.jpg">
<meta name="robots" content="noindex">
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#07110c;color:#e4efe8;font:15px system-ui,sans-serif}a{color:#d9b45a}</style>
<script>location.replace(${JSON.stringify(card_url)} + location.hash);</script>
</head><body><p>Opening <a href="${esc(card_url)}">${esc(name)}'s player card</a>…</p></body></html>
`;
}

async function players() {
  const rpc = await supabase();
  const names = [];
  for (const g of GAMES) {
    const rows = await rpc("leaderboard", { p_game: g, p_period: "all", p_limit: 25 });
    for (const r of rows) if (safe(r.name) && !names.includes(r.name)) names.push(r.name);
  }
  const cards = [];
  for (const n of names.slice(0, MAX)) {
    const c = await rpc("player_card", { p_name: n }).catch((e) => { console.warn("  skip " + n + ": " + e.message); return null; });
    if (c && c.name) cards.push(c);
  }
  return cards;
}

async function challenges(pg, base) {
  await pg.goto(base + "/", { waitUntil: "load" });
  await pg.waitForFunction(() => document.getElementById("home-games"));
  await pg.evaluate(() => document.fonts.ready);
  const out = path.join(site, "assets", "og");
  await mkdir(out, { recursive: true });
  const games = await pg.evaluate(() => JSON.parse(document.getElementById("home-games").textContent));
  for (const g of games) {
    const data = await pg.evaluate(drawChallenge, { g, host: HOST });
    await writeFile(path.join(out, "challenge-" + g.id + ".jpg"), Buffer.from(data.split(",")[1], "base64"));
  }
  console.log("challenge previews: " + games.map((g) => g.id).join(", "));
}

async function playerPreviews(pg, base) {
  const cards = await players();
  await pg.goto(base + "/u/", { waitUntil: "load" });
  await pg.waitForFunction(() => window.SamukaPlayer && window.SamukaAch && window.SamukaAch.list && window.SamukaAch.list.length);
  await pg.evaluate(() => document.fonts.ready);
  const done = [];
  for (const c of cards) {
    const data = await pg.evaluate(({ c, host }) => window.SamukaPlayer.draw(c, { og: true, host }).toDataURL("image/jpeg", 0.86), { c, host: HOST });
    const dir = path.join(site, "u", c.name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "card.jpg"), Buffer.from(data.split(",")[1], "base64"));
    await writeFile(path.join(dir, "index.html"), page(c));
    done.push(c.name);
  }
  await writeFile(path.join(site, "u", "cards.json"), JSON.stringify(done));
  console.log("player previews: " + done.length + (done.length ? " (" + done.slice(0, 8).join(", ") + (done.length > 8 ? ", …" : "") + ")" : ""));
}

async function main() {
  const srv = await serve(site), base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  try {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.addInitScript(() => { try { localStorage.setItem("samuka-theme", "dark"); localStorage.setItem("samuka-calm", "on"); localStorage.setItem("samuka-tour", "done"); sessionStorage.setItem("samuka-booted", "1"); } catch (e) {} });
    // each half on its own: no Supabase still gives the challenge images
    await challenges(pg, base).catch((e) => console.log("::warning::challenge previews skipped: " + e.message));
    await playerPreviews(pg, base).catch((e) => console.log("::warning::player previews skipped: " + e.message));
  } finally {
    await browser.close();
    srv.close();
  }
}

// drawn in the page (its fonts and theme colours): "<game> challenge" card for /c/<game>/
function drawChallenge({ g, host }) {
  const W = 1200, H = 630, cv = document.createElement("canvas"), x = cv.getContext("2d");
  cv.width = W; cv.height = H;
  const cs = getComputedStyle(document.documentElement), v = (k, d) => (cs.getPropertyValue(k) || d).trim() || d;
  const bg = v("--bg", "#07110c"), elev = v("--bg-elev", "#0b1912"), soft = v("--bg-soft", "#0f2119"), hl = v("--hl", "#d9b45a"), accent = v("--accent", "#3ad08f"), text = v("--text", "#e4efe8"), muted = v("--muted", "#6c857a");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const grd = x.createLinearGradient(0, 0, W, H); grd.addColorStop(0, elev); grd.addColorStop(1, soft);
  x.fillStyle = grd; x.fillRect(80, 35, 1040, 560);
  x.strokeStyle = hl; x.lineWidth = 4; x.strokeRect(82, 37, 1036, 556);
  x.textBaseline = "alphabetic";
  x.fillStyle = accent; x.font = "24px 'JetBrains Mono', monospace"; x.fillText("$ rails arcade:challenge", 140, 120);
  x.font = "120px sans-serif"; x.fillText(g.icon, 140, 290);
  x.fillStyle = muted; x.font = "28px 'JetBrains Mono', monospace"; x.fillText("YOU'VE BEEN CHALLENGED AT", 310, 205);
  x.fillStyle = text; x.font = "800 84px Inter, sans-serif"; x.fillText(g.name, 306, 292);
  // the tagline on one line: 30px, a little smaller if it wouldn't fit the card (920px)
  x.fillStyle = v("--text-2", "#b6c8bd"); x.font = "30px Inter, sans-serif";
  const tag = String(g.tagline || ""), wide = x.measureText(tag).width;
  if (wide > 920) x.font = Math.floor(30 * 920 / wide) + "px Inter, sans-serif";
  x.fillText(tag, 140, 385);
  x.fillStyle = hl; x.font = "700 30px Inter, sans-serif"; x.fillText("Same board. One try to beat their score.", 140, 490);
  x.fillStyle = muted; x.font = "22px 'JetBrains Mono', monospace"; x.fillText(host, 140, 552);
  x.textAlign = "right"; x.fillStyle = hl; x.fillText("Samuka's Arcade", 1060, 552);
  return cv.toDataURL("image/jpeg", 0.86);
}

main().catch((e) => {
  console.log("::warning::player card previews skipped: " + e.message);
  process.exitCode = 0;   // previews are a nice-to-have; never block a deploy
});
