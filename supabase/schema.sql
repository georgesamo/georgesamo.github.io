-- =====================================================================
-- Samuka site · accounts, roles and per-user preferences (Supabase)
-- Run once in: Supabase dashboard → SQL Editor → New query → Run.
-- Safe to re-run: drops and recreates its own objects.
--
-- Roles
--   user    every new sign-up (guest + minigames)
--   samuka  site owner (Knight theme + glitches)
--   nino    Nino (Golden theme + glitches)
--
-- Special roles are granted by email through public.role_grants, which no
-- browser can read. Add rows yourself in the SQL editor (see the bottom);
-- emails are never stored in the public repository.
-- =====================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.profiles cascade;
drop table if exists public.role_grants cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.apply_role_grant() cascade;
drop function if exists public.guard_profile() cascade;
drop type if exists public.app_role cascade;

create type public.app_role as enum ('user', 'samuka', 'nino');

-- private: which email gets which special role
create table public.role_grants (
  email text primary key,
  role  public.app_role not null
);
alter table public.role_grants enable row level security;   -- no policies = invisible to the site
revoke all on public.role_grants from anon, authenticated;

-- one row per account
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.app_role not null default 'user',
  theme        text not null default 'auto' check (theme in ('auto', 'dark', 'light', 'knight', 'golden')),
  glitches     boolean not null default true,
  display_name text check (char_length(display_name) <= 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own"   on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- clients may only touch their preferences, never their role
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (theme, glitches, display_name) on public.profiles to authenticated;

-- special themes belong to their role; keep updated_at fresh
create function public.guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.theme = 'knight' and new.role <> 'samuka' then raise exception 'theme "knight" is reserved'; end if;
  if new.theme = 'golden' and new.role <> 'nino'   then raise exception 'theme "golden" is reserved'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.guard_profile();

-- create the profile on sign-up, with any granted role
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce((select g.role from public.role_grants g where lower(g.email) = lower(new.email)), 'user'),
    left(split_part(coalesce(new.email, 'friend'), '@', 1), 40)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- granting a role later also upgrades an existing account
create function public.apply_role_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p
     set role = new.role,
         theme = case when p.theme in ('knight', 'golden') then 'auto' else p.theme end
    from auth.users u
   where u.id = p.id and lower(u.email) = lower(new.email);
  return new;
end $$;
create trigger on_role_grant after insert or update on public.role_grants
  for each row execute function public.apply_role_grant();

-- accounts created before this script ran get a profile too
insert into public.profiles (id, role, display_name)
select u.id, 'user', left(split_part(coalesce(u.email, 'friend'), '@', 1), 40)
  from auth.users u
on conflict (id) do nothing;

-- make the API see the new tables right away
notify pgrst, 'reload schema';

-- =====================================================================
-- After running the above, grant the special roles (edit the emails):
--
--   insert into public.role_grants (email, role) values
--     ('you@example.com',  'samuka'),
--     ('nino@example.com', 'nino')
--   on conflict (email) do update set role = excluded.role;
--
-- Check who has which role:
--   select u.email, p.role, p.theme from public.profiles p join auth.users u on u.id = p.id;
-- =====================================================================
