# Running BizTrack on your own machine

Everything in this branch is built and tested, but the build environment it was
written in has **no network access to Supabase**. Your machine does — which is
why the remaining steps happen here rather than there.

## 1. Get the branch

```sh
git clone https://github.com/XMP-GLITCH/BizTrack.git
cd BizTrack
git checkout claude/repo-review-54joy7
npm install
code .
```

Already cloned? `git fetch origin && git checkout claude/repo-review-54joy7 && git pull`

## 2. Create `.env.local`

**This file is gitignored, so it is not in the clone.** Without it the app runs
local-only and never contacts Supabase. Create it in the project root:

```
VITE_SUPABASE_URL=https://ufyyurmekegbzkqjisdb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_BKXsTO-7HDWNzm9GAcUwCw_3o4l8X1Y
```

Never put the `service_role` key here. It bypasses row-level security entirely.

## 3. Apply the database schema

VS Code: **Ctrl/Cmd+Shift+P → Tasks: Run Task**, then in order:

1. `supabase: login` — opens a browser
2. `supabase: link project` — already points at your project ref
3. `supabase: push migrations` — applies all three migrations

You will be asked for the database password you set when creating the project.

No CLI? Paste `supabase/setup-all.sql` into the
[SQL Editor](https://supabase.com/dashboard/project/ufyyurmekegbzkqjisdb/sql/new)
and press Run. It is the same three migrations in one file, and it prints a
verification table at the end: six tables, `rls_enabled = t` on all of them.

## 4. Two dashboard settings

- [Providers](https://supabase.com/dashboard/project/ufyyurmekegbzkqjisdb/auth/providers)
  → enable **Email**. Turn *off* "Confirm email" for beta so testers are not
  blocked by inbox problems; turn it back on before launch.
- [URL Configuration](https://supabase.com/dashboard/project/ufyyurmekegbzkqjisdb/auth/url-configuration)
  → add `http://localhost:5173`, plus your deployed origin later. Password reset
  fails silently without this.

## 5. Run it

**Ctrl/Cmd+Shift+P → Tasks: Run Task → `dev server`**, or `npm run dev`.

Create an account. What you should see:

| What happens | What it means |
|---|---|
| Lands in the app, books appear | Working. |
| `relation "public.businesses" does not exist` | Step 3 did not take — re-run the migrations. |
| "No internet connection…" | The app cannot reach Supabase. Check `.env.local` was created and restart the dev server — Vite only reads env files at startup. |
| Sign-in screen loops back | Email provider not enabled, or "Confirm email" is on and the address is unconfirmed. |

## Useful tasks

| Task | What it does |
|---|---|
| `dev server` | Vite on :5173 |
| `test` | 70 unit and integration tests |
| `lint` | ESLint |
| `build` | Production build |
| `supabase: push migrations` | Applies `supabase/migrations/*` |

Database and RLS tests need a local Postgres: `./supabase/tests/run.sh`.

## Optional

Supabase publish a VS Code extension for browsing your project's tables from the
editor — search "Supabase" in the Extensions panel. It is convenience only;
nothing here depends on it.
