-- =====================================================================
-- Samuka site · arcade scores: allow every game id, roomier flood guard
-- Run in Supabase → SQL Editor → Run. Safe to re-run.
-- Without this, Schema Stack and Pit Wall scores are rejected by the old
-- check constraint (only 'sidekiq' and 'gems' were allowed) and never save.
-- =====================================================================

-- replace whichever check constraint limits `game` with a format check,
-- so new games never need another SQL change
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
alter table public.scores add constraint scores_game_check check (game ~ '^[a-z][a-z0-9_]{1,23}$');

-- flood guard: at most 120 scores per user per hour (40 was easy to hit in short Sidekiq runs)
create or replace function public.scores_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.scores where user_id = new.user_id and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'slow down';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
