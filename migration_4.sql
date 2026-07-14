-- StudyCore — migration 4: Daily Feedback.
-- Run once in the Supabase SQL Editor.
-- Creates: host-authored questions, per-user responses, and a single
-- host-controlled "window" row that decides when the Daily Feedback tab is
-- open to everyone. Only the host email can write questions / open the
-- window / read all responses; everyone signed in can read active questions
-- (while the window is open) and submit their own response.

-- Host email is hard-referenced in the policies below. If you ever change
-- it, update every occurrence of the address.

-- 1. Questions authored by the host.
create table if not exists public.feedback_questions (
  id bigint generated always as identity primary key,
  prompt text not null,
  qtype text not null check (qtype in ('one','many','star','yesno')),
  options jsonb not null default '[]'::jsonb,   -- choice labels for one/many
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.feedback_questions enable row level security;

create policy "Anyone signed in can read active questions"
  on public.feedback_questions for select
  using (auth.role() = 'authenticated');

create policy "Only host can insert questions"
  on public.feedback_questions for insert
  with check (auth.jwt()->>'email' = 'wajid.khan24120@gmail.com');
create policy "Only host can update questions"
  on public.feedback_questions for update
  using (auth.jwt()->>'email' = 'wajid.khan24120@gmail.com');
create policy "Only host can delete questions"
  on public.feedback_questions for delete
  using (auth.jwt()->>'email' = 'wajid.khan24120@gmail.com');

-- 2. One response row per user per question (upsert to change an answer).
create table if not exists public.feedback_responses (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.feedback_questions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  answer jsonb not null,          -- number | string | array, per qtype
  updated_at timestamptz not null default now(),
  unique (question_id, user_id)
);
alter table public.feedback_responses enable row level security;

create policy "Users manage their own responses (insert)"
  on public.feedback_responses for insert
  with check (auth.uid() = user_id);
create policy "Users manage their own responses (update)"
  on public.feedback_responses for update
  using (auth.uid() = user_id);
-- A user can read their own response; the host can read ALL responses (stats).
create policy "Read own responses or host reads all"
  on public.feedback_responses for select
  using (
    auth.uid() = user_id
    or auth.jwt()->>'email' = 'wajid.khan24120@gmail.com'
  );

-- 3. Single-row window config controlling when the tab is open.
create table if not exists public.feedback_window (
  id int primary key default 1,
  open boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
alter table public.feedback_window enable row level security;
insert into public.feedback_window (id, open) values (1, false)
  on conflict (id) do nothing;

create policy "Anyone signed in can read the window"
  on public.feedback_window for select
  using (auth.role() = 'authenticated');
create policy "Only host can change the window"
  on public.feedback_window for update
  using (auth.jwt()->>'email' = 'wajid.khan24120@gmail.com');
