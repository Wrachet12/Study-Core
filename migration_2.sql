-- Stud Desk — migration 2: usernames, leaderboard, friends, sharing.
-- Run this AFTER setup.sql, once, in Supabase SQL Editor → New query → Run.
-- Safe to run on a project that already has the profiles table from setup.sql.

-- 1. Add columns needed for usernames + leaderboard.
alter table public.profiles add column if not exists username text unique;
alter table public.profiles add column if not exists xp int not null default 0;
alter table public.profiles add column if not exists level int not null default 1;
alter table public.profiles add column if not exists streak int not null default 0;

-- 2. Back-fill a username for any existing accounts that don't have one yet.
update public.profiles
set username = lower(split_part(coalesce(name, 'student'), ' ', 1)) || floor(random()*100000)::text
where username is null;

-- 3. Update the signup trigger so new accounts get a starter username too.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]', '', 'g'));
  insert into public.profiles (id, name, username, app_data)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    base_username || floor(random()*100000)::text,
    '{}'::jsonb
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. A safe public view exposing only what's needed for leaderboards/friend search —
--    never the private app_data column. This view is owned by the table owner and
--    bypasses row-level security on the base table, which is what makes it visible
--    to everyone while the underlying profiles table itself stays locked down.
create or replace view public.leaderboard as
  select id, username, name, xp, level, streak
  from public.profiles;

grant select on public.leaderboard to authenticated;

-- 5. Friends — simple one-row-per-relationship model with a pending/accepted status.
create table if not exists public.friends (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  unique(user_id, friend_id)
);
alter table public.friends enable row level security;

create policy "See requests involving me"
  on public.friends for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Send a friend request"
  on public.friends for insert
  with check (auth.uid() = user_id);

create policy "Respond to or cancel a request involving me"
  on public.friends for update
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Remove a request/friendship involving me"
  on public.friends for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- 6. Shared decks — flashcard stacks or practice tests shared via a short code.
create table if not exists public.shared_decks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users on delete cascade,
  owner_name text,
  title text not null,
  kind text not null check (kind in ('flashcards','practice_test')),
  payload jsonb not null,
  share_code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.shared_decks enable row level security;

create policy "Anyone signed in can browse shared decks"
  on public.shared_decks for select
  using (auth.role() = 'authenticated');

create policy "Owners can share their own decks"
  on public.shared_decks for insert
  with check (auth.uid() = owner_id);

create policy "Owners can delete their own shared decks"
  on public.shared_decks for delete
  using (auth.uid() = owner_id);
