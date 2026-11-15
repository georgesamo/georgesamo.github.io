-- =====================================================================
-- Samuka site · weekly tournament
--   One seeded board per game per ISO week (UTC). Everyone plays the same
--   board (assets/js/tournament.js seeds it with "<game>-tournament-<week>"),
--   as often as they like; their best run of the week counts.
--   tournament_runs         one row per finished signed-in run
--   tournament_standings()  this week's (or any week's) top players per game
--   tournament_winners()    the winners of the last finished weeks
--   tournament_trophies()   one player's wins (the 🏆 badges on player cards
--                           and the account window)
--   Winners are worked out when they are read, from the runs of a finished
--   week: no cron job, nothing to award. Ties go to whoever got there first.
-- Run AFTER schema.sql, features.sql, hub.sql, games.sql, me.sql, errors.sql,
-- challenges.sql and analytics-uses.sql, in Supabase → SQL Editor → Run.
-- Safe to re-run (keeps existing data).
-- Until it runs, tournament runs fail to save (quietly) and the standings
-- say the tournament is being set up; nothing else on the site changes.
-- =====================================================================

-- the current ISO week, the same key the browser computes: '2026-W46'
create or replace function public.tournament_week() returns text
language sql stable set search_path = public as $$
  select to_char(now() at time zone 'utc', 'IYYY-"W"IW')
$$;
grant execute on function public.tournament_week() to anon, authenticated;

create table if not exists public.tournament_runs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game       text not null check (game ~ '^[a-z][a-z0-9_]{1,23}$'),   -- any arcade game, like scores (games.sql)
  week       text not null default public.tournament_week() check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  score      int  not null check (score between 1 and 200000),
  created_at timestamptz not null default now()
);
create index if not exists tournament_runs_week on public.tournament_runs (week, game, score desc, created_at);
create index if not exists tournament_runs_user on public.tournament_runs (user_id);
alter table public.tournament_runs enable row level security;
drop policy if exists "tournament: read own" on public.tournament_runs;
drop policy if exists "tournament: insert own" on public.tournament_runs;
create policy "tournament: read own" on public.tournament_runs for select to authenticated using (user_id = auth.uid());
-- your own runs, and only for the week that's on now (a finished week can't be changed)
create policy "tournament: insert own" on public.tournament_runs for insert to authenticated
  with check (user_id = auth.uid() and week = public.tournament_week());
revoke all on public.tournament_runs from anon, authenticated;
grant select on public.tournament_runs to authenticated;
grant insert (game, week, score) on public.tournament_runs to authenticated;

-- flood guard: at most 60 runs per player per hour, same as challenges
create or replace function public.tournament_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.tournament_runs where user_id = new.user_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'slow down';
  end if;
  return new;
end $$;
drop trigger if exists tournament_flood on public.tournament_runs;
create trigger tournament_flood before insert on public.tournament_runs for each row execute function public.tournament_flood_guard();

-- ---------- standings ----------
-- p_week null = this week. Returns
--   { week, current, players, games: { <game>: [{ rank, name, role, score, me }] }, mine: { <game>: { rank, score, of } } }
-- Each player's best run per game; ties share a rank, and the earlier run is listed first.
create or replace function public.tournament_standings(p_week text default null, p_limit int default 10) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  w text := coalesce(nullif(trim(p_week), ''), public.tournament_week());
  lim int := least(greatest(coalesce(p_limit, 10), 1), 50);
  result json;
begin
  if w !~ '^[0-9]{4}-W[0-9]{2}$' then raise exception 'bad week'; end if;
  with best as (
    select distinct on (r.game, r.user_id) r.game, r.user_id, r.score, r.created_at
      from public.tournament_runs r
     where r.week = w
     order by r.game, r.user_id, r.score desc, r.created_at
  ), ranked as (
    select b.*, rank() over (partition by b.game order by b.score desc) as rank,
           row_number() over (partition by b.game order by b.score desc, b.created_at) as pos,
           count(*) over (partition by b.game) as total
      from best b
  )
  select json_build_object(
    'week', w,
    'current', w = public.tournament_week(),
    'players', (select count(distinct user_id) from best),
    'games', coalesce((select json_object_agg(g.game, g.rows) from (
        select r.game, json_agg(json_build_object('rank', r.rank, 'name', public.public_name(r.user_id), 'role', p.role, 'score', r.score, 'me', r.user_id = auth.uid()) order by r.pos) as rows
          from ranked r join public.profiles p on p.id = r.user_id
         where r.pos <= lim
         group by r.game) g), '{}'::json),
    'mine', coalesce((select json_object_agg(r.game, json_build_object('rank', r.rank, 'score', r.score, 'of', r.total))
        from ranked r where r.user_id = auth.uid()), '{}'::json)
  ) into result;
  return result;
end $$;
revoke all on function public.tournament_standings(text, int) from public;
grant execute on function public.tournament_standings(text, int) to anon, authenticated;

-- ---------- winners: one per game per finished week, newest week first ----------
-- p_weeks = how many of the last finished weeks (1 = last week)
create or replace function public.tournament_winners(p_weeks int default 1)
returns table (week text, game text, name text, role public.app_role, score int, players bigint, me boolean)
language sql stable security definer set search_path = public as $$
  with weeks as (
    select distinct r.week from public.tournament_runs r
     where r.week < public.tournament_week()
     order by r.week desc
     limit least(greatest(coalesce(p_weeks, 1), 1), 12)
  ), firsts as (
    select distinct on (r.week, r.game) r.week, r.game, r.user_id, r.score
      from public.tournament_runs r join weeks on weeks.week = r.week
     order by r.week, r.game, r.score desc, r.created_at, r.id
  ), counts as (
    select r.week, r.game, count(distinct r.user_id) as players
      from public.tournament_runs r join weeks on weeks.week = r.week
     group by r.week, r.game
  )
  select f.week, f.game, public.public_name(f.user_id), p.role, f.score, c.players, f.user_id = auth.uid()
    from firsts f
    join counts c on c.week = f.week and c.game = f.game
    join public.profiles p on p.id = f.user_id
   order by f.week desc, f.game
$$;
revoke all on function public.tournament_winners(int) from public;
grant execute on function public.tournament_winners(int) to anon, authenticated;

-- ---------- one player's trophies (looked up like player_card: nickname or dev-xxxx) ----------
-- [{ week, game, score, players }], newest first
create or replace function public.tournament_trophies(p_name text) returns json
language sql stable security definer set search_path = public as $$
  with u as (
    select p.id from public.profiles p
     where lower(coalesce(nullif(p.nickname, ''), 'dev-' || substr(md5(p.id::text), 1, 4))) = lower(trim(p_name))
     limit 1
  ), mine as (   -- only the weeks and games this player took part in
    select distinct r.week, r.game from public.tournament_runs r join u on u.id = r.user_id
     where r.week < public.tournament_week()
  ), firsts as (
    select distinct on (r.week, r.game) r.week, r.game, r.user_id, r.score
      from public.tournament_runs r join mine m on m.week = r.week and m.game = r.game
     order by r.week, r.game, r.score desc, r.created_at, r.id
  )
  select coalesce(json_agg(json_build_object('week', f.week, 'game', f.game, 'score', f.score,
           'players', (select count(distinct r.user_id) from public.tournament_runs r where r.week = f.week and r.game = f.game))
           order by f.week desc, f.game), '[]'::json)
    from firsts f join u on u.id = f.user_id
$$;
revoke all on function public.tournament_trophies(text) from public;
grant execute on function public.tournament_trophies(text) to anon, authenticated;

notify pgrst, 'reload schema';
