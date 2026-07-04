# Round 3 — search bar becomes a real navigation search

Typing now matches against every tab/section by name, so e.g. typing
"Feynman" or "Leaderboard" jumps straight there even before any content
matches. Specifically added:

- **Go-to entries** for: Today, Study, Mind map, Leitner box, Flashcards,
  Planner, Add assignment, Timer, Notes, Basic notes, Formal notes, Feynman,
  Question log, Question bank, Practice test, Mistake log, Friends,
  Leaderboard, Calendar.
- **Named-item search**: flashcard stacks by name, basic-note subjects by
  name, formal-note subjects by name, and practice tests by test name —
  each jumps straight to that specific stack/subject/test.
- Content search (note text, flashcard front/back, question prompts, tasks,
  mind-map bubbles) is still there from before, but every result is now
  properly clickable.

## Bonus fix: results were never clickable
There was no click handler wired to the results list at all — clicking a
result did nothing no matter what. Added a real click handler that jumps
you to the right tab/subtab and, where relevant, selects the specific
subject/stack/test and scrolls to it.
