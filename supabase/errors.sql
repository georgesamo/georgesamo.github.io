-- =====================================================================
-- Samuka site · client error reports
--   JavaScript errors from players' browsers (assets/js/errors.js), so the
--   owner sees what breaks on real devices. Anyone may add a report; only
--   the samuka role can read or clear them (admin panel → errors tab).
--   Stored: message, site file + line/col, page path, a short browser label
--   ("Chrome 131 · Android"), build id, a trimmed stack and a random per-page id.
--   No account ids, nicknames, emails, IPs or cookies.
-- Run AFTER schema.sql, features.sql, hub.sql, games.sql and me.sql, in
-- Supabase → SQL Editor → Run. Safe to re-run (keeps existing data).
-- =====================================================================

create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('error', 'rejection')),
  message    text not null check (char_length(message) between 1 and 300),
  source     text check (char_length(source) <= 160),
  line       int  check (line > 0),
  col        int  check (col > 0),
  path       text not null check (char_length(path) <= 120),
  ua         text check (char_length(ua) <= 60),
  build      text check (char_length(build) <= 40),
  stack      text check (char_length(stack) <= 600),
  sid        text not null check (sid ~ '^[a-z0-9]{4,16}$'),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_time on public.client_errors (created_at);
alter table public.client_errors enable row level security;
drop policy if exists "client errors: anyone can add" on public.client_errors;
create policy "client errors: anyone can add" on public.client_errors for insert to anon, authenticated with check (true);
revoke all on public.client_errors from anon, authenticated;
grant insert (kind, message, source, line, col, path, ua, build, stack, sid) on public.client_errors to anon, authenticated;

-- drop floods silently: 10 per page load per minute, 300 site-wide per 10 minutes
create or replace function public.client_errors_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.client_errors where sid = new.sid and created_at > now() - interval '1 minute') >= 10
     or (select count(*) from public.client_errors where created_at > now() - interval '10 minutes') >= 300 then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists client_errors_flood on public.client_errors;
create trigger client_errors_flood before insert on public.client_errors for each row execute function public.client_errors_flood_guard();

-- owner: the same error grouped, newest first
create or replace function public.client_error_summary(p_days int default 7) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 90));
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  return (select coalesce(json_agg(g order by g.last_seen desc), '[]') from (
    select kind, message, source, line, col,
           count(*) as hits, count(distinct sid) as loads,
           min(created_at) as first_seen, max(created_at) as last_seen,
           (array_agg(distinct path))[1:5] as paths,
           (array_agg(distinct ua))[1:5] as browsers,
           (array_agg(build order by created_at desc))[1] as build,
           (array_agg(stack order by created_at desc))[1] as stack
      from public.client_errors where created_at >= since
     group by kind, message, source, line, col
     order by max(created_at) desc limit 100) g);
end $$;
revoke all on function public.client_error_summary(int) from public, anon;
grant execute on function public.client_error_summary(int) to authenticated;

-- owner: forget every report (after fixing things)
create or replace function public.client_errors_clear() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  delete from public.client_errors where true;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.client_errors_clear() from public, anon;
grant execute on function public.client_errors_clear() to authenticated;

-- old reports go away on their own: anything older than 90 days is dropped on the next insert
create or replace function public.client_errors_prune() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.client_errors where created_at < now() - interval '90 days';
  return null;
end $$;
drop trigger if exists client_errors_prune on public.client_errors;
create trigger client_errors_prune after insert on public.client_errors for each statement execute function public.client_errors_prune();
