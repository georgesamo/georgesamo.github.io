-- =====================================================================
-- Samuka site · Dependency Hell (game id 'deps'): scores and challenges
-- Run AFTER the other files (schema, features, hub, games, me, errors,
-- challenges, analytics-uses), in Supabase → SQL Editor → Run.
-- Safe to re-run: it only swaps check constraints, no data changes.
--
-- scores:     games.sql already replaced the fixed list of game ids with a
--             format check; this re-applies it in case games.sql never ran.
-- challenges: challenges.sql still listed the four old ids, so a challenge
--             link for 'deps' couldn't be registered. It gets the same
--             format check, so the next game needs no SQL change either.
-- =====================================================================

do $$
declare c record;
begin
  -- scores: whichever check limits `game`
  for c in
    select conname from pg_constraint
     where conrelid = 'public.scores'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%game%'
  loop
    execute format('alter table public.scores drop constraint %I', c.conname);
  end loop;
  -- challenges: same (the table exists once challenges.sql has run)
  if to_regclass('public.challenges') is not null then
    for c in
      select conname from pg_constraint
       where conrelid = 'public.challenges'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%game%'
    loop
      execute format('alter table public.challenges drop constraint %I', c.conname);
    end loop;
    alter table public.challenges add constraint challenges_game_check check (game ~ '^[a-z][a-z0-9_]{1,23}$');
  end if;
end $$;
alter table public.scores add constraint scores_game_check check (game ~ '^[a-z][a-z0-9_]{1,23}$');

notify pgrst, 'reload schema';
