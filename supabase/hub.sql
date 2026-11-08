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
