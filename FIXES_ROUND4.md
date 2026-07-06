# Round 4 — Home screen name + Mind map upgrade

## "Stud Desk" still showing on Home screen
Checked every file — there's no leftover "Stud Desk" text anywhere in the
code anymore (already fully renamed to StudyCore last round). This is
almost certainly your phone's "Add to Home Screen" shortcut icon, which
caches the name at the moment you added it, separate from the live page.
Try removing that shortcut and re-adding it (or a hard refresh in the
browser) once the new files are deployed — it should pick up "StudyCore."

## Mind map: 5 subjects instead of 1
The mind map now works exactly like flashcards/notebooks — 5 separate
boards, each with its own bubbles and connections, and a rename field
above the board (defaults to "Subject 1"–"Subject 5"). Switch boards with
the subject tabs; each keeps its own content completely separate.

If you already had bubbles on your one existing board, they're
automatically carried over into "Subject 1" the next time you log in —
nothing is lost.

## Mind map: much bigger board + scrolling
The canvas used to be a small fixed box that clipped anything dragged near
the edge. It's now a 2400×1400px board inside a scrollable viewport — you
can scroll both directions to explore way more space than fits on screen
at once, and bubbles can be placed/dragged anywhere across that whole
area, not just the visible portion. "+ Add bubble" now drops the new
bubble near wherever you're currently scrolled to, instead of always in
the top-left corner.

Search bar was also updated to search across all 5 mind map subjects (and
match subject names too), jumping straight to the right board when you
click a result.
