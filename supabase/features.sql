-- =====================================================================
-- Samuka site · feature pack 1
--   leaderboards + daily Gem Match, achievements, commit wall,
--   Samuka & Nino board, admin tools, public nicknames, CRT skin
-- Run AFTER schema.sql, in: Supabase → SQL Editor → New query → Run.
-- Safe to re-run (keeps existing data).
-- =====================================================================

-- ---------- profiles: public nickname + the CRT skin (unlocked by a secret) ----------
alter table public.profiles add column if not exists nickname text;
alter table public.profiles drop constraint if exists profiles_nickname_check;
alter table public.profiles add constraint profiles_nickname_check
  check (nickname is null or (char_length(nickname) between 2 and 24 and nickname ~ '^[[:alnum:] ._\-]+$'));
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check
  check (theme in ('auto', 'dark', 'light', 'knight', 'golden', 'crt'));
grant update (theme, glitches, display_name, nickname) on public.profiles to authenticated;

-- the caller's role, usable inside policies (security definer: profiles RLS is self-only)
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
grant execute on function public.my_role() to anon, authenticated;

-- public label for a user: their nickname, else an anonymous handle (emails are never shown)
create or replace function public.public_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.nickname, ''), 'dev-' || substr(md5(p_id::text), 1, 4))
    from public.profiles p where p.id = p_id
$$;
revoke all on function public.public_name(uuid) from public, anon, authenticated;

-- ---------- scores ----------
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game       text not null check (game in ('sidekiq', 'gems')),
  mode       text not null default 'free' check (mode in ('free', 'daily', 'race')),
  day        date,
  score      int  not null check (score between 0 and 200000),
  created_at timestamptz not null default now()
);
create unique index if not exists scores_daily_once on public.scores (user_id, game, day) where mode = 'daily';
create index if not exists scores_game_score on public.scores (game, score desc);
alter table public.scores enable row level security;
drop policy if exists "scores: read own" on public.scores;
drop policy if exists "scores: insert own" on public.scores;
create policy "scores: read own" on public.scores for select to authenticated using (user_id = auth.uid());
create policy "scores: insert own" on public.scores for insert to authenticated
  with check (user_id = auth.uid() and (mode <> 'daily' or day = (now() at time zone 'utc')::date));
revoke all on public.scores from anon, authenticated;
grant select on public.scores to authenticated;
grant insert (game, mode, day, score) on public.scores to authenticated;

-- flood guard: at most 40 scores per user per hour
create or replace function public.scores_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.scores where user_id = new.user_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'slow down';
  end if;
  return new;
end $$;
drop trigger if exists scores_flood on public.scores;
create trigger scores_flood before insert on public.scores for each row execute function public.scores_flood_guard();

-- leaderboard: p_period = 'all' | 'week' | 'daily'
create or replace function public.leaderboard(p_game text, p_period text default 'all', p_limit int default 10)
returns table (rank bigint, name text, role public.app_role, score int, me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select s.user_id, max(s.score) as score
      from public.scores s
     where s.game = p_game
       and case p_period
             when 'daily' then s.mode = 'daily' and s.day = (now() at time zone 'utc')::date
             when 'week'  then s.mode <> 'daily' and s.created_at >= date_trunc('week', now())
             else s.mode <> 'daily'
           end
     group by s.user_id
  )
  select rank() over (order by b.score desc), public.public_name(b.user_id), p.role, b.score,
         b.user_id = auth.uid()
    from best b join public.profiles p on p.id = b.user_id
   order by b.score desc
   limit least(greatest(p_limit, 1), 50)
$$;
grant execute on function public.leaderboard(text, text, int) to anon, authenticated;

-- ---------- achievements ----------
create table if not exists public.achievements (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,32}$'),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.achievements enable row level security;
drop policy if exists "achievements: read own" on public.achievements;
drop policy if exists "achievements: insert own" on public.achievements;
create policy "achievements: read own" on public.achievements for select to authenticated using (user_id = auth.uid());
create policy "achievements: insert own" on public.achievements for insert to authenticated with check (user_id = auth.uid());
revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;
grant insert (key) on public.achievements to authenticated;

-- ---------- commit wall (guestbook) ----------
create table if not exists public.wall (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  author     text not null check (char_length(author) between 2 and 24),
  message    text not null check (char_length(message) between 1 and 72),
  sha        text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 7),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.wall enable row level security;
drop policy if exists "wall: read" on public.wall;
drop policy if exists "wall: post own" on public.wall;
drop policy if exists "wall: moderate" on public.wall;
drop policy if exists "wall: remove" on public.wall;
create policy "wall: read" on public.wall for select to anon, authenticated
  using (not hidden or public.my_role() = 'samuka');
create policy "wall: post own" on public.wall for insert to authenticated
  with check (user_id = auth.uid() and not hidden);
create policy "wall: moderate" on public.wall for update to authenticated
  using (public.my_role() = 'samuka') with check (public.my_role() = 'samuka');
create policy "wall: remove" on public.wall for delete to authenticated
  using (public.my_role() = 'samuka' or user_id = auth.uid());
revoke all on public.wall from anon, authenticated;
grant select (id, author, message, sha, hidden, created_at) on public.wall to anon, authenticated;
grant insert (author, message) on public.wall to authenticated;
grant update (hidden) on public.wall to authenticated;
grant delete on public.wall to authenticated;

create or replace function public.wall_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.wall where user_id = new.user_id and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'three commits an hour, please';
  end if;
  return new;
end $$;
drop trigger if exists wall_flood on public.wall;
create trigger wall_flood before insert on public.wall for each row execute function public.wall_flood_guard();

-- ---------- Samuka & Nino board ----------
create table if not exists public.board_tasks (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 1 and 120),
  status     text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  purple     boolean not null default false,
  position   double precision not null default extract(epoch from now()),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.board_tasks enable row level security;
drop policy if exists "board: team only" on public.board_tasks;
create policy "board: team only" on public.board_tasks for all to authenticated
  using (public.my_role() in ('samuka', 'nino')) with check (public.my_role() in ('samuka', 'nino'));
revoke all on public.board_tasks from anon, authenticated;
grant select, delete on public.board_tasks to authenticated;
grant insert (title, status, purple, position) on public.board_tasks to authenticated;
grant update (title, status, purple, position, updated_at) on public.board_tasks to authenticated;

-- live updates for the board and the wall
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'board_tasks') then
    alter publication supabase_realtime add table public.board_tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wall') then
    alter publication supabase_realtime add table public.wall;
  end if;
end $$;

-- ---------- admin tools (samuka role only) ----------
create or replace function public.admin_users()
returns table (id uuid, email text, role public.app_role, nickname text, glitches boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  return query
    select u.id, u.email::text, p.role, p.nickname, p.glitches, u.created_at, u.last_sign_in_at
      from auth.users u join public.profiles p on p.id = u.id
     order by u.created_at desc;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  if p_user = auth.uid() and p_role <> 'samuka' then raise exception 'you cannot demote yourself'; end if;
  select lower(email) into v_email from auth.users where id = p_user;
  update public.profiles
     set role = p_role,
         theme = case when theme in ('knight', 'golden') then 'auto' else theme end
   where id = p_user;
  -- keep the private grant list in sync so the role survives a fresh sign-up
  if p_role = 'user' then
    delete from public.role_grants where lower(email) = v_email;
  elsif v_email is not null then
    insert into public.role_grants (email, role) values (v_email, p_role)
    on conflict (email) do update set role = excluded.role;
  end if;
end $$;

create or replace function public.admin_set_glitches(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'samuka' then raise exception 'not allowed'; end if;
  update public.profiles set glitches = p_on where id = p_user;
end $$;

revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_set_role(uuid, public.app_role) from public, anon;
revoke all on function public.admin_set_glitches(uuid, boolean) from public, anon;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_glitches(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
