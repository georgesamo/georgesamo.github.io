-- =====================================================================
-- Samuka site · arcade hub pack
--   player cards, unique nicknames, weekly events, live chat moderation,
--   Gem Match versus results, visitor analytics, testimonials,
--   email alerts queue, Nino's corner
-- Run AFTER schema.sql and features.sql, in Supabase → SQL Editor → Run.
-- Safe to re-run (keeps existing data).
-- =====================================================================

-- ---------- nicknames are unique (case-insensitive) ----------
create unique index if not exists profiles_nickname_unique on public.profiles (lower(nickname)) where nickname is not null;

-- ---------- player cards: public, looked up by nickname or anonymous handle ----------
create or replace function public.player_card(p_name text) returns json
language sql stable security definer set search_path = public as $$
  with u as (
    select p.id, p.role, p.created_at
      from public.profiles p
     where lower(coalesce(nullif(p.nickname, ''), 'dev-' || substr(md5(p.id::text), 1, 4))) = lower(trim(p_name))
     limit 1
  )
  select json_build_object(
    'name', public.public_name(u.id),
    'role', u.role,
    'joined', u.created_at,
    'achievements', coalesce((select json_agg(a.key order by a.unlocked_at) from public.achievements a where a.user_id = u.id), '[]'::json),
    'best', coalesce((select json_object_agg(x.game, x.best) from (select s.game, max(s.score) as best from public.scores s where s.user_id = u.id and s.mode <> 'daily' group by s.game) x), '{}'::json),
    'games', (select count(*) from public.scores s where s.user_id = u.id),
    'me', u.id = auth.uid()
  ) from u
$$;
grant execute on function public.player_card(text) to anon, authenticated;

-- ---------- weekly challenges ----------
create table if not exists public.event_completions (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week        text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  challenge   text not null check (challenge ~ '^[a-z_]{2,32}$'),
  finished_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.event_completions enable row level security;
drop policy if exists "events: read own" on public.event_completions;
drop policy if exists "events: insert own" on public.event_completions;
create policy "events: read own" on public.event_completions for select to authenticated using (user_id = auth.uid());
create policy "events: insert own" on public.event_completions for insert to authenticated with check (user_id = auth.uid());
revoke all on public.event_completions from anon, authenticated;
grant select on public.event_completions to authenticated;
grant insert (week, challenge) on public.event_completions to authenticated;

create or replace function public.event_finishers(p_week text)
returns table (name text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select public.public_name(e.user_id), e.finished_at
    from public.event_completions e
   where e.week = p_week
   order by e.finished_at
   limit 50
$$;
grant execute on function public.event_finishers(text) to anon, authenticated;

-- ---------- #lobby chat (terminal) ----------
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  author     text not null check (char_length(author) between 2 and 24),
  role       public.app_role not null default 'user',
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;
drop policy if exists "chat: read" on public.chat_messages;
drop policy if exists "chat: post own" on public.chat_messages;
drop policy if exists "chat: moderate" on public.chat_messages;
create policy "chat: read" on public.chat_messages for select to anon, authenticated using (true);
create policy "chat: post own" on public.chat_messages for insert to authenticated with check (user_id = auth.uid());
create policy "chat: moderate" on public.chat_messages for delete to authenticated using (public.my_role() = 'samuka' or user_id = auth.uid());
revoke all on public.chat_messages from anon, authenticated;
grant select (id, author, role, body, created_at) on public.chat_messages to anon, authenticated;
grant insert (author, body) on public.chat_messages to authenticated;
grant delete on public.chat_messages to authenticated;

-- the role badge comes from the server, never from the browser; 6 messages a minute
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.role := coalesce(public.my_role(), 'user');
  if (select count(*) from public.chat_messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'six messages a minute, please';
  end if;
  return new;
end $$;
drop trigger if exists chat_guard on public.chat_messages;
create trigger chat_guard before insert on public.chat_messages for each row execute function public.chat_guard();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ---------- visitor analytics (no cookies, no IPs, no user ids) ----------
-- the browser sends: page path, referrer host, a random per-tab id, and what happened
create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('view', 'section', 'play')),
  path       text not null check (char_length(path) <= 120),
  detail     text check (char_length(detail) <= 60),
  referrer   text check (char_length(referrer) <= 80),
  sid        text not null check (sid ~ '^[a-z0-9]{6,16}$'),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_time on public.analytics_events (created_at);
alter table public.analytics_events enable row level security;
drop policy if exists "analytics: anyone can add" on public.analytics_events;
create policy "analytics: anyone can add" on public.analytics_events for insert to anon, authenticated with check (true);
revoke all on public.analytics_events from anon, authenticated;
grant insert (kind, path, detail, referrer, sid) on public.analytics_events to anon, authenticated;

create or replace function public.analytics_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.analytics_events where sid = new.sid and created_at > now() - interval '1 minute') >= 40 then
    return null;   -- silently drop floods
  end if;
  return new;
end $$;
drop trigger if exists analytics_flood on public.analytics_events;
create trigger analytics_flood before insert on public.analytics_events for each row execute function public.analytics_flood_guard();

-- summary for the owner's admin panel
create or replace function public.analytics_summary(p_days int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  return json_build_object(
    'days', (select coalesce(json_agg(d order by d.day), '[]') from (
        select date_trunc('day', created_at)::date as day, count(*) filter (where kind = 'view') as views, count(distinct sid) as visitors
          from public.analytics_events where created_at >= since group by 1) d),
    'pages', (select coalesce(json_agg(p), '[]') from (
        select path, count(*) as views from public.analytics_events where kind = 'view' and created_at >= since group by path order by 2 desc limit 10) p),
    'sections', (select coalesce(json_agg(s), '[]') from (
        select detail as name, count(*) as reads from public.analytics_events where kind = 'section' and created_at >= since group by detail order by 2 desc limit 12) s),
    'referrers', (select coalesce(json_agg(r), '[]') from (
        select coalesce(nullif(referrer, ''), 'direct') as host, count(distinct sid) as visitors from public.analytics_events where kind = 'view' and created_at >= since group by 1 order by 2 desc limit 10) r),
    'plays', (select coalesce(json_agg(g), '[]') from (
        select detail as game, count(*) as plays from public.analytics_events where kind = 'play' and created_at >= since group by detail order by 2 desc) g),
    'totals', (select json_build_object('views', count(*) filter (where kind = 'view'), 'visitors', count(distinct sid)) from public.analytics_events where created_at >= since)
  );
end $$;
revoke all on function public.analytics_summary(int) from public, anon;
grant execute on function public.analytics_summary(int) to authenticated;

-- ---------- testimonials (shown only after Samuka approves them) ----------
create table if not exists public.testimonials (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade unique,
  name       text not null check (char_length(name) between 2 and 60),
  relation   text not null check (char_length(relation) between 2 and 80),
  body       text not null check (char_length(body) between 20 and 600),
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.testimonials enable row level security;
drop policy if exists "testimonials: read approved" on public.testimonials;
drop policy if exists "testimonials: read own" on public.testimonials;
drop policy if exists "testimonials: owner reads all" on public.testimonials;
drop policy if exists "testimonials: write own" on public.testimonials;
drop policy if exists "testimonials: edit own" on public.testimonials;
drop policy if exists "testimonials: owner moderates" on public.testimonials;
drop policy if exists "testimonials: delete" on public.testimonials;
create policy "testimonials: read approved" on public.testimonials for select to anon, authenticated using (approved);
create policy "testimonials: read own" on public.testimonials for select to authenticated using (user_id = auth.uid());
create policy "testimonials: owner reads all" on public.testimonials for select to authenticated using (public.my_role() = 'samuka');
create policy "testimonials: write own" on public.testimonials for insert to authenticated with check (user_id = auth.uid() and not approved);
create policy "testimonials: edit own" on public.testimonials for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "testimonials: owner moderates" on public.testimonials for update to authenticated using (public.my_role() = 'samuka') with check (public.my_role() = 'samuka');
create policy "testimonials: delete" on public.testimonials for delete to authenticated using (user_id = auth.uid() or public.my_role() = 'samuka');
revoke all on public.testimonials from anon, authenticated;
grant select (id, name, relation, body, approved, created_at) on public.testimonials to anon, authenticated;
grant insert (name, relation, body) on public.testimonials to authenticated;
grant update (name, relation, body, approved) on public.testimonials to authenticated;
grant delete on public.testimonials to authenticated;

-- editing your own testimonial sends it back for approval; only the owner can approve
create or replace function public.testimonial_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'samuka' then
    new.approved := case when tg_op = 'UPDATE' and new.body = old.body and new.name = old.name and new.relation = old.relation then old.approved else false end;
  end if;
  return new;
end $$;
drop trigger if exists testimonial_guard on public.testimonials;
create trigger testimonial_guard before insert or update on public.testimonials for each row execute function public.testimonial_guard();

create or replace function public.my_testimonial() returns json
language sql stable security definer set search_path = public as $$
  select row_to_json(t) from (select id, name, relation, body, approved from public.testimonials where user_id = auth.uid()) t
$$;
grant execute on function public.my_testimonial() to authenticated;

-- ---------- Nino's corner: dates to count down to (team only) ----------
create table if not exists public.nino_dates (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 1 and 80),
  day        date not null,
  emoji      text not null default '💜' check (char_length(emoji) <= 8),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.nino_dates enable row level security;
drop policy if exists "nino dates: team only" on public.nino_dates;
create policy "nino dates: team only" on public.nino_dates for all to authenticated
  using (public.my_role() in ('samuka', 'nino')) with check (public.my_role() in ('samuka', 'nino'));
revoke all on public.nino_dates from anon, authenticated;
grant select, delete on public.nino_dates to authenticated;
grant insert (title, day, emoji) on public.nino_dates to authenticated;

notify pgrst, 'reload schema';
