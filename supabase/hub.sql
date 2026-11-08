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
