# Stud Desk

A student time-management web app: planner with deadline-splitting and priority
filters, a Pomodoro timer with time-of-day guidance, 5-subject paginated
notebooks (basic + Cornell-style formal notes), a Feynman worksheet, 5
flashcard stacks, a draggable mind map with connector lines, a 5-box Leitner
spaced-repetition system with real review-timing, and XP/streak gamification
— behind real login/sign-up accounts that follow you across devices.

## Project structure

```
stud-desk-project/
├── index.html         Page structure/markup
├── css/
│   └── styles.css     All styling
├── js/
│   ├── config.js      Your Supabase project credentials (you fill this in)
│   └── app.js          All app logic
├── sql/
│   └── setup.sql       Database schema + security rules, run once in Supabase
└── README.md           This file
```

## How accounts & data work

Stud Desk uses **Supabase** (a free-tier hosted Postgres database + auth
service) so accounts and data are real and follow you anywhere:

- Signing up creates a real account — Supabase Auth handles password
  hashing properly, never plain text.
- Each person's planner tasks, notebooks, flashcards, mind map, Leitner
  cards, XP, level, and streak save to the cloud automatically as they use
  the app.
- Logging in on any device or browser pulls that same data back down.

There's no server code to write — Supabase is the backend. The site itself
stays a plain static site you host normally.

## Part 1 — one-time Supabase setup (~5 minutes)

1. **Create a free project** at supabase.com → "New project." Pick a name
   and a database password, then wait ~2 minutes for it to spin up.

2. **Run the database script.** In the project, open **SQL Editor → New
   query**, paste in everything from `sql/setup.sql`, click **Run**. This
   creates the table that holds account data and locks it down so users can
   only ever see their own.

3. **Copy your API keys.** Go to **Project Settings → API**, copy the
   **Project URL** and the **anon / public key**.

4. **Paste them into `js/config.js`:**
   ```js
   const SUPABASE_URL = "https://your-project-ref.supabase.co";
   const SUPABASE_ANON_KEY = "your-long-anon-key";
   ```
   The anon key is meant to be public in client code — that's safe by
   design, since the rules from step 2 are what actually protect the data.

5. **(Optional, for quick testing)** Authentication → Providers → Email →
   turn off "Confirm email" so new accounts can log in immediately without
   checking an inbox. Turn it back on before real people sign up.

## Part 2 — host it with GitHub + Vercel

1. **Create a GitHub repo:** github.com → **+ → New repository** → name it
   `stud-desk` → **Create repository**.
2. **Upload the files:** on the new repo page, click **"uploading an
   existing file"** and drag in `index.html`, `css/`, `js/` (with your real
   keys already in `config.js`), `sql/`, and `README.md`. Commit.
3. **Connect Vercel:** go to vercel.com → **Sign up** → **Continue with
   GitHub**. Click **Add New… → Project**, pick your `stud-desk` repo,
   **Import**. Leave all settings as default (no framework, no build step)
   and click **Deploy**.

You'll get a live URL like `stud-desk.vercel.app` in under a minute — real
accounts, working everywhere, no servers for you to run.

Any time you push a change to GitHub, Vercel redeploys automatically.

## Customizing

- Colors and fonts: edit the `:root` CSS variables at the top of `css/styles.css`.
- Recommended/risky study hours: edit the `buildSchedule()` function in `js/app.js`.
- Leitner box intervals: edit the `INTERVALS` object in `js/app.js`.
- Feynman daily cap / unlock time: edit `FEYNMAN_DAILY_CAP` and `nextTwoPM()` in `js/app.js`.
