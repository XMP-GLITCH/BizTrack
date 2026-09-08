# BizTrack — working context

Claude Code reads this file automatically at the start of every session. It
exists because the work so far happened in a web session whose transcript does
not travel; this is that reasoning, written down.

---

## What this is

An offline-first PWA for tracking inventory, sales and profit across several
small businesses. Built for independent sellers and makers in West/Central
Africa — crochet, thrift, food, beauty — with XAF as the default currency.

Two people use it today. The goal is a real public product: **~130 paying users
by end of December**, at 3,500 XAF/month or 30,000/year.

Offline-first is a **product decision, not legacy debt**. Mobile data is
expensive and intermittent for these users, so the app reads and writes locally
and syncs when it can. Do not "modernise" this into a server-rendered app that
spins a loading skeleton when the network drops.

---

## Where things stand

| Phase | State |
|---|---|
| 0 — Stabilise | ✅ Done. Install prompt, hook-order crash, data validation, honest security copy. |
| 1 — Ledger data model | ✅ Done. Integer money, stock ledger, per-entity store, legacy migration. |
| 2 — Supabase | 🟡 Code complete and tested. **Schema NOT yet applied to the live project.** |
| 3 — Public launch | ⬜ Not started. Error tracking, privacy policy, account deletion, backups. |

**The immediate blocker:** `supabase/setup-all.sql` has never been run against
the real project. Until it is, sign-up succeeds but every sync fails with
`relation "public.businesses" does not exist`. See `LOCAL_SETUP.md`.

Project ref: `ufyyurmekegbzkqjisdb`. `.env.local` is gitignored and must be
recreated on each machine, or the app silently runs local-only.

---

## The three ideas the code is built around

**1. Money is an integer in the currency's minor unit.** XAF has no subunit, so
1 500 XAF is `1500`; USD has two, so `$15.00` is `1500`. Never floats — they
drift across the sums every screen performs, and books off by a franc destroy
trust faster than a crash. Currency lives on the *business*, not globally, so an
amount is always interpretable.

**2. Stock is a ledger, not a counter.** Quantity on hand is derived by summing
`stockMovements`. This is what lets two offline devices each sell the last unit
and both keep their sale — a stored counter would have both write "4" and lose
one. It also means restocking at a new price averages in rather than
retroactively repricing stock already on the shelf, and "why is my stock 3?" is
answerable.

**3. Records were built to sync before there was a server.** Client-generated
UUIDs, `updatedAt` on every mutation, soft deletes via `deletedAt`. A hard
delete cannot propagate — the other device can't distinguish "deleted" from
"not seen yet".

---

## Deliberate choices that look like bugs

Do not "fix" these without discussing:

- **Overselling is allowed.** Recording a sale that takes stock negative is
  permitted and flagged for reconciliation. The sale physically happened;
  refusing to log real money is worse than showing a discrepancy.
- **The PIN is not encryption.** It is a local device lock over already-local
  data. The About copy used to claim "industrial-grade encryption" — that was
  false and was removed. Do not reintroduce security claims.
- **Sign-out does not delete local records.** They may not be backed up yet.
- **Auto data-rescue only scans *legacy* storage keys.** Scanning the live key
  resurrected data the user had just signed out of.
- **`replaceBusinesses` is the one bulk write left.** Restore genuinely replaces
  everything, and its input is validated by `parseBackup` first.
- **Sync is pull-based, not Realtime.** One owner on one or two devices over
  metered data does not need a websocket. Revisit when staff accounts land.
- **`business_members` exists though the UI never creates more than one row.**
  Retrofitting tenancy onto live data is the migration to avoid.
- **`is_business_member()` is `SECURITY DEFINER` on purpose.** A policy on
  `business_members` that queries `business_members` recurses infinitely.

---

## Data safety rules

The migration rewrites stored data on a device holding someone's only copy of
their books. Therefore:

- An untouched snapshot is written to `biztrack-pre-ledger-backup` before any
  migration, and never overwritten. Downloadable via Account → Pre-Upgrade Backup.
- `migrateState()` must never throw. Each business converts in isolation;
  failures are preserved under `unreadableBusinesses`, never dropped.
- `verifyMigration()` re-checks counts, units sold and per-item stock on the
  user's own device. A mismatch surfaces a banner, not a silent success.
- **Never gate data behind payment.** An expired plan makes the app read-only —
  everything stays visible and exportable. Locking someone out of their own
  books would travel by word of mouth faster than the product.

---

## Business decisions already made

- **3,500 XAF/month, 30,000/year.** Annual is the hero option: mobile-money
  auto-renewal is unreliable, so twelve monthly decisions means twelve chances
  to lose a happy customer.
- **30-day trial, then read-only.** Not a free tier — a free tier gives someone
  tracking one hustle no reason to ever pay.
- **~130 users, not 100.** 100 assumed monthly pricing; annual discounting moves
  the target for the same 4.2M XAF/year.
- **Beta: announce the price, hold back the discount.** Saying nothing about
  price reads as bait-and-switch when the bill arrives.
- **Acquisition is direct, not ads.** ~200 conversations converts far better
  than a funnel at this scale, and paid ads against a 3,500 product need
  retention data nobody has yet.

---

## Verifying changes

```sh
npm test              # 70 unit + integration tests (node:test, no extra deps)
npm run lint          # 4 pre-existing errors, 3 warnings — see below
npm run build
./supabase/tests/run.sh        # 35 RLS tests, needs local Postgres
./supabase/tests/roundtrip.sh  # data survives a real Postgres round trip
```

**Known lint state:** 4 errors and 3 warnings, all pre-existing React hygiene in
the update-check and PIN paths (`set-state-in-effect`, `purity`,
`exhaustive-deps`). They need restructuring, not renaming. Do not add
suppressions.

---

## What is proven, and what is not

**Proven** against real PostgreSQL 16 running the actual migration files: the
schema, 35 RLS tests asserted in *both* directions (owner can reach their data,
another user cannot), and a full data round trip where revenue, COGS, profit,
stock on hand and weighted-average cost all return identical.

**Proven** in a headless browser against the built app: legacy migration on real
data, the auth screen, and graceful offline failure.

**Not proven:** the live Supabase service. GoTrue auth, PostgREST behaviour and
the network round trip to `*.supabase.co` were unreachable from the environment
this was built in. Expect ordinary integration details on first connection.

---

## Open decisions

1. **Claim-local-data flow.** When someone signs into an account that already
   has data while their device also holds local books — merge both, or ask them
   to choose? Merging is safe but can produce a confusing pile.
2. **App.jsx is still ~2,600 lines.** The split was deferred; state ownership is
   now settled, so it is safe to do.
3. **Bundle is 859 KB** (supabase-js added ~209 KB). On a low-end Android over
   slow data that is a real cost. Code-split the backend and Recharts before
   launch.

---

## Layout

```
src/domain/    Business rules, framework-free, fully tested.
               money · inventory (ledger) · stats · schema · migrate
src/store/     Zustand store. Per-entity actions, persisted to localStorage.
src/backend/   Supabase client, row mappers, auth, sync. Degrades to local-only.
src/screens/   AuthScreen. Everything else still lives in App.jsx.
supabase/      migrations · tests (RLS + round trip) · setup-all.sql
```

---

## Session log — 7 September 2026

The move to VS Code described above actually happened on this date. What
changed, and what was measured against the live service rather than assumed.

### This checkout

`C:\Users\EAE\projects\biztrack`, a fresh clone on `claude/repo-review-54joy7`.

The previous working copy at `C:\Users\EAE\Downloads\files\biztrack` is a clone
of **`main`** — v1.5.9, the pre-ledger local-only app, with no `CLAUDE.md`, no
`supabase/`, no `src/domain/` and no `src/backend/`. It was left in place
deliberately for the owner to delete. It holds nothing unique: no unpushed
commits, no stashes, and only `build.log`, `dist/` and `node_modules/` outside
git. If it is still there and someone is confused about which folder is which,
that is why.

`main` and the branch have not been merged. `main` is still v1.5.9.

### Verified against the live Supabase project

Probed directly, not inferred:

| Check | Result |
|---|---|
| Network to `*.supabase.co` | Reachable |
| Project `ufyyurmekegbzkqjisdb` | Live |
| Publishable key in `LOCAL_SETUP.md` | Valid |
| Email provider / sign-ups | Both enabled |
| **Schema applied** | **No** |
| **`mailer_autoconfirm`** | **`false` — "Confirm email" still ON** |

`GET /rest/v1/businesses` returns exactly the failure predicted above:

```
PGRST205 — Could not find the table 'public.businesses' in the schema cache
```

So the Phase 2 blocker is unchanged and now confirmed live: `setup-all.sql` has
still never been run. The network unreachability noted under "Not proven" was an
environment limitation, not a project problem — the service answers fine from
this machine.

### Tooling installed

Supabase CLI **v2.116.0** at
`C:\Users\EAE\AppData\Local\Programs\supabase\supabase.exe`, appended to the
**User** PATH (38 → 39 entries; prior value backed up before the edit). It needs
a terminal started after the install to resolve.

Dead ends on this machine, so nobody repeats them: no winget package exists,
Scoop is not installed, and `npm i -g supabase` is blocked by Supabase upstream.
The GitHub release zip is the route that works — verify the SHA256 against the
release `checksums.txt`, and expect GitHub to be slow enough that the download
needs `curl -C -` to resume.

### Still outstanding

1. `.env.local` does not exist in this checkout. Until it does the app runs
   local-only and never contacts Supabase. Values are in `LOCAL_SETUP.md` §2.
2. Apply the schema — CLI (`login` → `link` → `db push`) or paste
   `supabase/setup-all.sql` into the dashboard SQL Editor.
3. Turn off "Confirm email" and add `http://localhost:5173` to the redirect
   allowlist. Both are dashboard-only; neither can be done from the CLI or the
   publishable key.

### A note on the old `main`, for context

A read of `main` turned up several defects, and the branch already fixes all of
them: the `beforeinstallprompt` listener was never registered (so the Android
install prompt could never appear), `index.html` read the wrong storage key for
the theme, `vite.config.js` used `__dirname` in an ESM config, and the rescue
code scanned the *live* storage key alongside the legacy ones. Nothing to do —
recorded only so the same findings are not re-reported as new.

One loose thread genuinely explains the v1.5.3–v1.5.7 emergency history:
`idb-keyval` was still installed in the old checkout but absent from
`package.json`. The store used to persist to IndexedDB and later moved to
`localStorage`, which is what stranded people's books and forced the whole Data
Rescue system into existence.
