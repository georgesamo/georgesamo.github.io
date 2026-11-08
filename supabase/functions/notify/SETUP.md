# Email alerts setup (about 10 minutes, all in the Supabase dashboard)

You get an email when someone signs the wall, leaves a recommendation or creates an account,
plus a weekly digest every Monday. Contact-form messages already reach you through FormSubmit.

## 1. A Google app password for sending
Use a **new** app password for this (don't reuse the one in Auth → SMTP).
Create it at https://myaccount.google.com/apppasswords. It is 16 letters; remove the spaces.

## 2. Secrets
Supabase → **Edge Functions → Secrets** → add:

| name | value |
|---|---|
| `GMAIL_USER` | your Gmail address |
| `GMAIL_APP_PASSWORD` | the 16-letter app password |
| `NOTIFY_TO` | where alerts should go (can be the same Gmail) |
| `NOTIFY_TOKEN` | any long random string, e.g. 40 random letters and digits |

Never paste these into a chat, an issue or the repository.

## 3. The function
Supabase → **Edge Functions → Deploy a new function → Via editor**
- name: `notify`
- paste the whole of `supabase/functions/notify/index.ts`
- **Deploy**
- In the function's **Details**, turn **off** "Enforce JWT verification" (it checks `x-notify-token` instead).

## 4. Database webhooks (instant alerts)
Supabase → **Database → Webhooks → Create a new hook**, three times:

| name | table | events |
|---|---|---|
| `notify_wall` | `wall` | Insert |
| `notify_testimonials` | `testimonials` | Insert |
| `notify_players` | `profiles` | Insert |

For each: type **Supabase Edge Functions**, function `notify`, method POST,
and add an HTTP header `x-notify-token` = your `NOTIFY_TOKEN`.

## 5. Weekly digest (optional)
Supabase → **Database → Extensions** → enable `pg_cron` and `pg_net`. Then in the SQL editor
(replace the two placeholders; this stays in your database, not in the repo):

```sql
select cron.schedule('samuka-weekly-digest', '0 7 * * 1', $$
  select net.http_post(
    url := 'https://qgxboopayhgppckvwmhr.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-notify-token": "PASTE_NOTIFY_TOKEN"}'::jsonb,
    body := '{"digest": true}'::jsonb
  );
$$);
```

Runs Mondays 07:00 UTC (11:00 in Tbilisi). Remove it with `select cron.unschedule('samuka-weekly-digest');`

## Test
Leave a commit on the wall from a second account: the email should arrive within a few seconds.
If not: Edge Functions → `notify` → **Logs**. "forbidden" means the header token doesn't match;
"535 Username and Password not accepted" means the app password is wrong.
