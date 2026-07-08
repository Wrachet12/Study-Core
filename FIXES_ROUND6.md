# Round 6

## Streak bug — root cause found
The app was computing "today" using UTC time instead of your local time.
For US timezones, that means any evening use after ~6–7pm local gets
stamped with tomorrow's UTC date, so the app's sense of "today" drifted
depending on what time of day you used it — causing the constant reset to
"Day 1." Fixed everywhere dates are generated (streak, task due dates,
activity log, calendar).

## Mind map connections not saving
Found the real bug: the one-time migration that moved your old single mind
map into the new "Subject 1" board had no guard against re-running. Since
the legacy fields it reads from never get cleaned up, it was silently
re-running on every single login and reverting Subject 1 back to its
frozen original snapshot — wiping out anything added since, including
connections (and any new bubbles on that specific board). Now runs once.

## Achievements — close button + retroactive credit
- Added a persistent × in the corner of both the Achievements and Weekly
  Recap modals, not just the Close button at the bottom.
- Since achievements launched after some accounts (like level 90!) were
  already deep into using StudyCore, a fresh "0 lifetime stats" counter
  would unfairly lock out things clearly already earned. Added a one-time
  backfill that estimates real lifetime counts from what already exists —
  current flashcard count, Leitner box depth, notebook pages written,
  tasks completed, practice tests created — and re-checks achievements
  against those estimates immediately.

## Mind map bubble text in dark mode
Bubbles never set their own text color, so in dark mode they inherited the
page's light text color — nearly invisible against the bubbles' always-
light pastel backgrounds. Pinned dark regardless of theme.

## Bell schedule — full redesign
Periods and bells used to be two disconnected lists — periods had no real
times at all, bells were single instant points instead of actual passing-
period durations. Rebuilt as one unified timeline: add a period (name +
start + end time) or add a bell/passing period (just start + end, no name)
in the order your day actually runs, up to 10 periods and 9 bells. The
next block's start time auto-fills from the previous one's end time to
speed up entry. Status text only ever updates quietly on-screen — never an
OS notification/popup, since nobody's on their laptop during class anyway.

## Timer sound
There was never an actual sound — only a silent browser Notification call
that needs permission and often makes no audible sound depending on OS
settings. Added a real generated two-tone chime (Web Audio API, no files/
cost) that now plays at the end of every Focus/Break/Long break segment.
