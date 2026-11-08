// Samuka site · email alerts (Supabase Edge Function "notify")
//
// Sends you an email when something happens on the site, plus a weekly digest.
//  - Database Webhooks call it on INSERT into: wall, testimonials, profiles (new player)
//  - pg_cron calls it every Monday with {"digest": true}
//
// Secrets (Supabase → Edge Functions → Secrets), never in the repo:
//   GMAIL_USER          your Gmail address (the sender)
//   GMAIL_APP_PASSWORD  a Google app password (16 letters, no spaces)
//   NOTIFY_TO           where alerts go (can be the same address)
//   NOTIFY_TOKEN        any long random string; callers must send it as x-notify-token
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const env = (k: string) => Deno.env.get(k) ?? "";
const SITE = "https://georgesamo.github.io";

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function page(title: string, rows: string) {
  return `<div style="font-family:ui-monospace,Menlo,Consolas,monospace;background:#07110c;color:#e4efe8;padding:24px;border-radius:12px">
    <p style="color:#d9b45a;margin:0 0 8px"># Samuka's Arcade</p>
    <h2 style="margin:0 0 16px;font-family:Inter,Arial,sans-serif">${esc(title)}</h2>${rows}
    <p style="margin-top:20px"><a style="color:#8ff0c2" href="${SITE}">${SITE}</a></p></div>`;
}
async function send(subject: string, html: string) {
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: env("GMAIL_USER"), password: env("GMAIL_APP_PASSWORD") } },
  });
  try {
    await client.send({ from: `Samuka's Arcade <${env("GMAIL_USER")}>`, to: env("NOTIFY_TO") || env("GMAIL_USER"), subject, html });
  } finally {
    await client.close();
  }
}

async function digest() {
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const count = async (table: string, extra?: (q: any) => any) => {
    let q = db.from(table).select("*", { count: "exact", head: true }).gte("created_at", since);
    if (extra) q = extra(q);
    const { count } = await q;
    return count ?? 0;
  };
  const [players, wall, scores, views, pending] = await Promise.all([
    count("profiles"), count("wall"), count("scores"),
    count("analytics_events", (q) => q.eq("kind", "view")),
    db.from("testimonials").select("*", { count: "exact", head: true }).eq("approved", false).then((r) => r.count ?? 0),
  ]);
  const row = (k: string, v: number) => `<p style="margin:4px 0"><span style="color:#6c857a">${k}</span> <b style="color:#3ad08f">${v}</b></p>`;
  await send("Your week on Samuka's Arcade", page("Last 7 days", row("new players", players) + row("wall commits", wall) + row("games finished", scores) + row("page views", views) + row("testimonials waiting", pending)));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!env("NOTIFY_TOKEN") || req.headers.get("x-notify-token") !== env("NOTIFY_TOKEN")) return new Response("forbidden", { status: 403 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  try {
    if (body.digest) { await digest(); return new Response("digest sent"); }
    const r = body.record ?? {};
    if (body.type !== "INSERT") return new Response("ignored");
    if (body.table === "wall") {
      await send(`New commit on the wall: ${String(r.message ?? "").slice(0, 60)}`, page("Someone signed the wall", `<p><span style="color:#d9b45a">${esc(r.sha)}</span> ${esc(r.message)}</p><p style="color:#6c857a">by ${esc(r.author)}</p><p><a style="color:#8ff0c2" href="${SITE}/#wall">moderate on the site →</a></p>`));
    } else if (body.table === "testimonials") {
      await send(`New recommendation from ${String(r.name ?? "someone")}`, page("A recommendation is waiting for approval", `<p><b>${esc(r.name)}</b> <span style="color:#6c857a">· ${esc(r.relation)}</span></p><blockquote style="border-left:3px solid #d9b45a;margin:8px 0;padding-left:12px">${esc(r.body)}</blockquote><p>Approve it in 🛠 admin → testimonials.</p>`));
    } else if (body.table === "profiles") {
      await send("A new player joined", page("New player", `<p>Someone just created an account (role: ${esc(r.role)}).</p>`));
    } else return new Response("ignored");
    return new Response("sent");
  } catch (e) {
    console.error(e);
    return new Response("mail failed: " + (e as Error).message, { status: 500 });
  }
});
