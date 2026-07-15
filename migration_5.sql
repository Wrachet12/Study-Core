-- StudyCore — migration 5: content reporting / moderation.
-- Run once in the Supabase SQL Editor.
-- Lets any signed-in user report a shared deck or a display name, and lets
-- the host review every report. This is the safety net behind the automatic
-- filters in the app (which catch obvious cases but can always be worked
-- around by someone determined).

create table if not exists public.content_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('shared_deck','display_name','other')),
  target_ref text,              -- share_code, reported user id, etc.
  target_owner_name text,       -- who made it, for host context
  details text,                 -- what the reporter typed
  snapshot jsonb,               -- copy of the offending content at report time
  status text not null default 'open' check (status in ('open','reviewed','removed')),
  created_at timestamptz not null default now()
);
alter table public.content_reports enable row level security;

-- Anyone signed in can file a report (as themselves).
create policy "Users can file reports"
  on public.content_reports for insert
  with check (auth.uid() = reporter_id);

-- Reporters can see their own reports; the host sees everything.
create policy "Read own reports or host reads all"
  on public.content_reports for select
  using (
    auth.uid() = reporter_id
    or auth.jwt()->>'email' = 'wajid.khan24120@gmail.com'
  );

-- Only the host can triage.
create policy "Only host can update reports"
  on public.content_reports for update
  using (auth.jwt()->>'email' = 'wajid.khan24120@gmail.com');

-- Let the host delete any shared deck (users could already delete their own).
create policy "Host can delete any shared deck"
  on public.shared_decks for delete
  using (auth.jwt()->>'email' = 'wajid.khan24120@gmail.com');
