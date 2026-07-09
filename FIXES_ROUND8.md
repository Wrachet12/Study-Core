# Round 8 — Mind map connections, take 3

I stopped guessing this time and actually simulated the full click-to-
connect flow in a test harness (build two bubbles, click both in Connect
mode, inspect exactly what would get sent to the database). That
confirmed the core connect/save logic itself is correct — so the previous
two fixes were real bugs worth fixing, but not the whole story. Digging
further found two more concrete issues:

## 1. Switching mind map subjects never cleared the in-progress connection
Each of the 5 subject boards has its own bubble ids starting from 1. If you
clicked a bubble to start a connection, then switched to a different
subject board before clicking a second bubble, that half-made connection
silently carried over — attaching to whatever bubble happened to share
that same id number in the new subject (or just failing silently if no
such id existed there). Now switching subjects always resets that
in-progress state.

## 2. Connections relied on the same delayed save as everything else
Adding a connection scheduled a save 900ms later, same as most actions.
But connecting bubbles and then quickly switching subjects/tabs (very
natural — you make a connection, then move to a different board) could
beat that delay. Connections now save immediately, not on a timer.

Between this and the two fixes from the last two rounds (the migration
that kept reverting the board, and the timing race on first login), I've
now covered every mechanism I can find through direct code simulation, not
just reading. If it's still happening after this, the most useful thing
you could do is open the browser's developer console (F12 → Console tab)
right after making a connection and reloading — if Supabase is silently
rejecting the save for some reason on your specific project, an error
would show up there that I can't see or reproduce from my end.
