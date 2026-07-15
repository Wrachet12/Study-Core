# StudyCore

A student time-management web app (planner, Pomodoro timer, spaced-repetition
Leitner boxes, notes, flashcards, question bank / practice tests, grade
tracker, friends & leaderboard, calendar, and a host-run daily feedback tab).
Plain HTML/CSS/JS frontend backed by Supabase for auth and data.

---

## Deploying

1. Upload every file in this folder to the GitHub repo root (overwrite
   existing files). Vercel redeploys automatically.
2. Each CSS/JS reference carries a `?v=NN` cache-busting version so browsers
   fetch fresh files. When files change, that number is bumped — if you ever
   still see an old version, hard-refresh once (Ctrl+Shift+R, or close and
   reopen the tab on mobile).
3. Framework preset in Vercel should be **"Other"** with no build command and
   no output directory — this is a static site with no build step.

## Supabase setup / migrations

Run these once each in the Supabase SQL Editor, in order, if you haven't:

- `setup.sql` — base tables + row-level security.
- `migration_2.sql` — usernames, leaderboard view, friends table, sharing.
- `migration_3.sql` — Friend IDs (adds `friend_code`, backfills all
  accounts, rebuilds the leaderboard view). If the view step errors, use the
  drop-and-recreate variant.
- `migration_5.sql` — content reports (moderation backstop; also lets the
  host delete any shared deck).
- `migration_4.sql` — Daily Feedback (questions, responses, window config).
  Only the host email can author questions / open the window / read all
  responses. Host email is hard-referenced inside the file — if it changes,
  edit every occurrence and re-run.

`config.js` holds the Supabase URL + public anon key (safe to be client-side;
row-level security is what protects data).

---

## Design

Current theme is the **"Dark Artboard"** system (Framer design analysis):
near-black canvas, white display type with negative letter-spacing, white
pill CTAs, charcoal surface-lift cards, one blue accent (#0099ff) reserved
for links/focus/selection, and a scarce gradient family used only as
atmosphere. Inter is the typeface throughout. All emojis were replaced with
monochrome retro glyphs.

Theme accents: dark mode uses a dark galactic-purple for the bubbles, Leitner
boxes, subject tabs, and the Weekly Recap / Achievements / Account / Log out
controls; the optional light mode recolors those (and the brand dot, XP bar,
and timer digits) in blue.

**Light mode** is optional via Settings (a cream / blue / white theme); dark
is the default. The design is dark-first by spec.

---

## Feature notes

**Mind map** — 5 renameable subject boards, each a large scrollable canvas.
Connect mode links bubbles; a bubble stays selected so you can fan out
several links at once. Connections and bubbles both persist. (Lines are drawn
from element measurements, so they're redrawn when the Study tab becomes
visible — hidden panels measure as zero.)

**Question log / practice tests** — build tests from a subject's term. On a
retake, answering a question correctly auto-resolves its open mistake-log
entry; missing the same question again updates the existing entry instead of
duplicating it.

**Mistake log** — each entry has "Done" (marks resolved, dims it, drops it
from Home counts) and Delete.

**Friends** — add by Friend ID (an 8-char code shown in the Friends tab with
a copy button), not by display name. Requires `migration_3.sql`.

**Daily Feedback** — host-only builder + live stats, plus a time-limited
window that controls when the tab is visible to everyone. Requires
`migration_4.sql`. Host: window control (open/close now or scheduled),
question builder (pick one / pick several / star 1–5 / yes-no), and live
results. Users see the tab only while the window is open and can change their
answers any time it's open. Tab visibility updates on login / window change
(a reload shows it appearing or disappearing); stats are a snapshot on open
or Refresh, not a live stream.

**Data backup** — Account settings → "Download my data" exports everything
as JSON; "Restore from backup" replaces the account contents from that file
(confirmation required, cannot be undone). There is no automatic backup —
downloading periodically is the only safety net against a database mistake.

**Content safety** — layered, and worth understanding honestly:
- Display names are filtered at signup and in settings (normalizes leetspeak
  and spacing, so `sh1t` and `f u c k` are caught).
- Anything shared (flashcard decks, practice tests) is scanned before it goes
  out AND again on the way in, so decks shared before the filters existed are
  still caught. **All links are blocked in shared content** — that's the main
  vector for "innocent-looking deck that points somewhere bad."
- A Report button files a report to the host (`content_reports` table).
- **The filter is not the real protection.** A client-side wordlist catches
  careless and obvious cases; anyone determined can work around it. The real
  backstop is reports + the host being able to delete any shared deck. If the
  app grows beyond a friend group, this needs revisiting.

**Onboarding** — first-time users get a 6-step walkthrough that jumps through
Planner → Timer → Study → Question Log → Grades. Replayable from Account
settings.

**Mobile** — the app is laptop-first by design, but the layout now adapts:
the top bar wraps, tabs scroll horizontally, everything goes single-column,
tap targets hit 44px, inputs use 16px text to stop iOS zooming on focus, and
wide tables scroll instead of squashing.

**Privacy** — contact email hello-studycore-help@gmail.com.

---

## Changelog

**Design v2 — Dark Artboard** — full visual replacement (canvas, type,
pills, single blue accent, gradient atmosphere, dark-first with optional
cream/blue/white light mode). Emojis replaced with retro glyphs. Galactic-
purple / blue theme accents across bubbles, Leitner boxes, subject tabs, and
the recap/achievement/account/logout controls.

**Design v1 — Console Chrome** — earlier Nintendo-2001-style theme (since
replaced).

**Pre-launch hardening:** mobile/responsive layout pass; data export +
restore; display-name and shared-content filtering (including link blocking);
content reporting with host review; first-login walkthrough.

**Fixes across rounds:**
- Timezone bug: dates were computed in UTC, drifting "today" and breaking
  streaks; now local-calendar throughout (streak, due dates, activity log,
  calendar).
- Mind map: migration that reverted a board on every login (now runs once);
  connection lines not drawn after reload because the panel was hidden at
  load (now redrawn on tab open); connect-state reset when switching
  subjects; connections save immediately.
- Dark/light preference and settings save immediately (were lost when the tab
  closed before a debounced save fired).
- Achievements: added a close button and a one-time backfill so already-
  active accounts aren't locked out; lifetime stats sync so the leaderboard
  isn't stuck at zero.
- Leaderboard/friends: query the safe public view instead of RLS-blocked
  profile rows; friends rewired onto the proper tables.
- Sharing: instant modal + fast DB-backed codes; practice-test import fixed;
  separate Import buttons; empty-deck guards.
- Search: covers every tab/section and named items (flashcard stacks,
  notebook subjects, practice tests, mind map subjects), results clickable.
- Bell schedule: rebuilt as one unified timeline (period or passing-block,
  each with start/end); passive on-screen status only, never notifications.
- Timer: real audible chime at each segment end (previously silent).
- Ambient sound: fixed clipping/harshness, added fade-in, added custom
  uploaded-audio option.
- Mistake log: working Delete (function was missing), Done/Resolved state,
  correct-retake auto-resolve, no duplicate entries.
