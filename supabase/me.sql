-- =====================================================================
-- Samuka site · "me" pack
--   player card v2 (ranks, recent games, daily streak), your public name,
--   download my data, delete my account
-- Run AFTER schema.sql, features.sql, hub.sql and games.sql, in
-- Supabase → SQL Editor → Run. Safe to re-run (keeps existing data).
-- =====================================================================

-- ---------- your public name, exactly as the server computes it ----------
-- (the browser can't reproduce the md5 used for "dev-xxxx" names, so it asks)
create or replace function public.my_public_name() returns text
language sql stable security definer set search_path = public as $$
  select public.public_name(auth.uid())
$$;
revoke all on function public.my_public_name() from public, anon;
grant execute on function public.my_public_name() to authenticated;

-- ---------- player card v2 ----------
--   ranks:  { game: { rank, of, behind } }   all-time board; behind = points to the next place up
--   recent: last 8 games, newest first
--   streak: { current, best } consecutive UTC days with a daily played (current counts if
--           the last one was today or yesterday)
create or replace function public.player_card(p_name text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  u record;
  v_ranks json; v_recent json;
  v_cur int := 0; v_best int := 0; v_last date;
begin
  select p.id, p.role, p.created_at into u
    from public.profiles p
   where lower(coalesce(nullif(p.nickname, ''), 'dev-' || substr(md5(p.id::text), 1, 4))) = lower(trim(p_name))
   limit 1;
  if not found then return null; end if;

  with best as (
    select s.game, s.user_id, max(s.score) as score
      from public.scores s where s.mode <> 'daily' group by s.game, s.user_id
  ), ranked as (
    select b.game, b.user_id, b.score,
           rank() over w as rank,
           count(*) over (partition by b.game) as total,
           lag(b.score) over w as above
      from best b
    window w as (partition by b.game order by b.score desc)
  )
  select coalesce(json_object_agg(r.game, json_build_object('rank', r.rank, 'of', r.total, 'behind', coalesce(r.above - r.score, 0))), '{}'::json)
    into v_ranks
    from ranked r where r.user_id = u.id;

  select coalesce(json_agg(x), '[]'::json) into v_recent from (
    select s.game, s.score, s.mode, s.created_at as at
      from public.scores s where s.user_id = u.id
     order by s.created_at desc limit 8
  ) x;

  -- gaps and islands over the days with a daily score
  with days as (
    select distinct s.day from public.scores s where s.user_id = u.id and s.mode = 'daily' and s.day is not null
  ), runs as (
    select min(d.day) as first_day, max(d.day) as last_day, count(*)::int as len
      from (select day, day - (row_number() over (order by day))::int as grp from days) d
     group by d.grp
  )
  select coalesce(max(len), 0),
         coalesce((select r2.len from runs r2 order by r2.last_day desc limit 1), 0),
         max(last_day)
    into v_best, v_cur, v_last
    from runs;
  if v_last is null or v_last < (now() at time zone 'utc')::date - 1 then v_cur := 0; end if;

  return json_build_object(
    'name', public.public_name(u.id),
    'role', u.role,
    'joined', u.created_at,
    'achievements', coalesce((select json_agg(a.key order by a.unlocked_at) from public.achievements a where a.user_id = u.id), '[]'::json),
    'best', coalesce((select json_object_agg(x.game, x.best) from (select s.game, max(s.score) as best from public.scores s where s.user_id = u.id and s.mode <> 'daily' group by s.game) x), '{}'::json),
    'games', (select count(*) from public.scores s where s.user_id = u.id),
    'ranks', v_ranks,
    'recent', v_recent,
    'streak', json_build_object('current', v_cur, 'best', v_best),
    'me', u.id = auth.uid()
  );
end $$;
grant execute on function public.player_card(text) to anon, authenticated;

-- ---------- download my data ----------
create or replace function public.export_my_data() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'exported_at', now(),
    'account', (select json_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = auth.uid()),
    'profile', (select row_to_json(p) from public.profiles p where p.id = auth.uid()),
    'public_name', public.public_name(auth.uid()),
    'scores', coalesce((select json_agg(json_build_object('game', s.game, 'mode', s.mode, 'day', s.day, 'score', s.score, 'at', s.created_at) order by s.created_at) from public.scores s where s.user_id = auth.uid()), '[]'::json),
    'achievements', coalesce((select json_agg(json_build_object('key', a.key, 'at', a.unlocked_at) order by a.unlocked_at) from public.achievements a where a.user_id = auth.uid()), '[]'::json),
    'weekly_challenges', coalesce((select json_agg(json_build_object('week', e.week, 'challenge', e.challenge, 'at', e.finished_at)) from public.event_completions e where e.user_id = auth.uid()), '[]'::json),
    'wall', coalesce((select json_agg(json_build_object('message', w.message, 'sha', w.sha, 'at', w.created_at)) from public.wall w where w.user_id = auth.uid()), '[]'::json),
    'chat', coalesce((select json_agg(json_build_object('body', c.body, 'at', c.created_at)) from public.chat_messages c where c.user_id = auth.uid()), '[]'::json),
    'testimonial', (select json_build_object('name', t.name, 'relation', t.relation, 'body', t.body, 'approved', t.approved) from public.testimonials t where t.user_id = auth.uid())
  )
  where auth.uid() is not null
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ---------- delete my account ----------
-- Removes the sign-in and everything tied to it. Wall and chat posts are deleted too
-- (their tables only null the user id on their own). The owner account is protected.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if public.my_role() = 'samuka' then raise exception 'the owner account cannot be deleted from the site'; end if;
  delete from public.wall where user_id = me;
  delete from public.chat_messages where user_id = me;
  delete from auth.users where id = me;   -- cascades: profile, scores, achievements, events, testimonial
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
