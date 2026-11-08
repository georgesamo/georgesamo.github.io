-- =====================================================================
-- Samuka site · new games on the leaderboards (Schema Stack, Pit Wall; older ids kept for past scores)
-- Run in Supabase → SQL Editor → Run. Safe to re-run.
-- =====================================================================

-- allow the new game ids in public.scores (replaces whichever check constraint limits `game`)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.scores'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%game%'
  loop
    execute format('alter table public.scores drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.scores add constraint scores_game_check check (game in ('sidekiq', 'gems', 'schema', 'regex', 'merge', 'pitwall'));

notify pgrst, 'reload schema';
