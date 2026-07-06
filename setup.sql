-- StudyCore database setup for Supabase.
-- Run this once in your project's SQL Editor (Supabase dashboard → SQL Editor → New query).

-- 1. One row per user, holding their profile name and all app data as JSON.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  app_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Lock the table down: a user can only ever read or write their own row.
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Automatically create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, app_data)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    '{}'::jsonb
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
