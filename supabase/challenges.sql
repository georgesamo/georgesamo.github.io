-- =====================================================================
-- Samuka site · challenge results
--   When someone beats a challenge a signed-in player sent, the sender
--   sees it on their next visit (assets/js/challenge.js).
--   challenges      one row per challenge link a signed-in player shares
--                   (the link carries its id as "i"; the server keeps the
--                   real score, so an edited link can't fake a result)
--   challenge_wins  who beat it, their best score, and whether the sender
--                   has seen it yet
-- Run AFTER schema.sql, features.sql, hub.sql, games.sql and me.sql, in
-- Supabase → SQL Editor → Run. Safe to re-run (keeps existing data).
-- =====================================================================

create table if not exists public.challenges (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{8,24}$'),
  sender     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game       text not null check (game in ('sidekiq', 'gems', 'schema', 'pitwall')),
  seed       text not null check (seed ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  score      int  not null check (score between 1 and 200000),
  length     text check (length in ('sprint', 'full')),
  created_at timestamptz not null default now()
);
create index if not exists challenges_sender on public.challenges (sender);
alter table public.challenges enable row level security;
drop policy if exists "challenges: read own" on public.challenges;
drop policy if exists "challenges: insert own" on public.challenges;
create policy "challenges: read own" on public.challenges for select to authenticated using (sender = auth.uid());
create policy "challenges: insert own" on public.challenges for insert to authenticated with check (sender = auth.uid());
revoke all on public.challenges from anon, authenticated;
grant select on public.challenges to authenticated;
grant insert (id, game, seed, score, length) on public.challenges to authenticated;

-- flood guard: at most 60 challenges per player per hour
create or replace function public.challenges_flood_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.challenges where sender = new.sender and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'slow down';
  end if;
  return new;
end $$;
drop trigger if exists challenges_flood on public.challenges;
create trigger challenges_flood before insert on public.challenges for each row execute function public.challenges_flood_guard();

-- no policies: only the functions below read or write it
create table if not exists public.challenge_wins (
  challenge_id text not null references public.challenges (id) on delete cascade,
  winner       uuid not null references auth.users (id) on delete cascade,
  score        int  not null check (score between 1 and 200000),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz,
  primary key (challenge_id, winner)
);
alter table public.challenge_wins enable row level security;
revoke all on public.challenge_wins from anon, authenticated;

-- ---------- a signed-in player beat a challenge ----------
-- Keeps their best score per challenge. A better score later shows up again as new.
-- Returns true when it counts (the challenge exists, it isn't yours, and the score beats it).
create or replace function public.challenge_beaten(p_id text, p_score int) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c record;
begin
  if me is null then return false; end if;
  select ch.sender, ch.score into c from public.challenges ch where ch.id = p_id;
  if not found or c.sender = me or p_score is null or p_score <= c.score or p_score > 200000 then return false; end if;
  insert into public.challenge_wins as w (challenge_id, winner, score) values (p_id, me, p_score)
  on conflict (challenge_id, winner) do update
    set score = excluded.score, created_at = now(), seen_at = null
    where w.score < excluded.score;
  return true;
end $$;
revoke all on function public.challenge_beaten(text, int) from public, anon;
grant execute on function public.challenge_beaten(text, int) to authenticated;

-- ---------- your challenges someone beat that you haven't seen yet (newest first) ----------
create or replace function public.my_challenge_wins() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.at desc), '[]'::json) from (
    select c.id, c.game, c.seed, c.length, c.score as mine, w.score as theirs,
           public.public_name(w.winner) as name, w.created_at as at
      from public.challenge_wins w join public.challenges c on c.id = w.challenge_id
     where c.sender = auth.uid() and w.seen_at is null
     order by w.created_at desc limit 10
  ) x
$$;
revoke all on function public.my_challenge_wins() from public, anon;
grant execute on function public.my_challenge_wins() to authenticated;

-- ---------- mark them seen (everything up to the newest one shown) ----------
create or replace function public.challenge_wins_seen(p_until timestamptz) returns void
language sql security definer set search_path = public as $$
  update public.challenge_wins w set seen_at = now()
    from public.challenges c
   where c.id = w.challenge_id and c.sender = auth.uid() and w.seen_at is null and w.created_at <= p_until
$$;
revoke all on function public.challenge_wins_seen(timestamptz) from public, anon;
grant execute on function public.challenge_wins_seen(timestamptz) to authenticated;

notify pgrst, 'reload schema';
