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
| 2 — Supabase | ✅ Done, 8 Sep 2026. Schema applied to the live project, RLS verified against it, Google sign-in working end to end. |
| 3 — Public launch | 🟡 Mostly built. Error tracking, privacy policy, terms, consent, account deletion, notifications and analytics all landed. Remaining: custom SMTP, a filled-in legal entity, deployed Edge Functions. |

**The schema blocker is gone.** It was applied on 8 September and every table
answers. What now stands between this and paying users is the list at the end
of the 8 September session log.

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
- **Analytics holds usage only, never business content.** No item names, no
  amounts, no customer data. Enforced by an allowlist in `src/analytics`, not
  by call-site discipline. That table reaches dashboards and exports, so a
  franc of revenue in it would make every future breach a financial one.
- **There is no cookie banner, deliberately.** No advertising or third-party
  tracking cookies exist, so a consent dialog would imply consent was needed
  for things it was not. What *is* asked for is what genuinely needs it:
  analytics, and transferring data outside Cameroon. Adding a third-party
  analytics SDK changes this.
- **The claim flow offers no "keep only this device's books".** With a
  merge-based sync there is no honest way to deliver it — the next pull brings
  the account's rows straight back. A choice the code cannot keep is worse than
  no choice at all.
- **An unreachable server is never read as an empty one.** `inspectRemote()`
  returns null on failure and the claim flow then does nothing and asks again
  next launch. Treating offline as "the account is empty" is how a merge prompt
  becomes silent data loss.
- **Every email carries a six-digit code beside its link.** Not a fallback: on
  Android the link often opens a browser that is not the installed PWA, so the
  code is the reliable path. `AuthScreen`'s `verify` mode is where it is spent.
- **Apple sign-in was built, then removed.** It needs a paid Developer Program
  membership and this audience is overwhelmingly Android. `signInWithApple`
  stays in `auth.js`; only the button is gone.
- **The `auth.sessions` trigger can never raise.** Its whole body is wrapped.
  A missed sign-in notification is acceptable; blocking authentication for
  everyone is not. Drop statement is in `supabase/functions/README.md`.

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

Against the live project, pasted into the Supabase SQL Editor:

```
supabase/rls-check.sql          # is RLS really protecting every table AND view
supabase/analytics-queries.sql  # which screens, which features, what breaks
```

Run `rls-check.sql` after ANY schema change.

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

**Proven against the LIVE project, 8 September 2026:** the schema applied
cleanly; all eight tables reject an anonymous insert with `42501`, meaning RLS
rejected the row before the foreign key was even checked. Google OAuth returns
a correct 302 to `accounts.google.com` with the right `client_id` and callback.

That write probe is how to check RLS from outside the database, and it is worth
remembering: with RLS *off* the same request returns `23503` from the foreign
key instead, so the two are distinguishable without writing a single row. A
*read* probe cannot tell them apart — an empty table and a fully protected one
both return `[]`.

**Not proven:** the three Edge Functions (`notify`, `unsubscribe`,
`delete-account`) were written with no local Postgres, Docker or Deno on the
machine, so that TypeScript has never executed and none of it is deployed.
Email delivery through Brevo is entirely untested.

Also unverified: whether `item_stock` actually has `security_invoker` on. Every
table is empty, so a leaking view and a working one look identical from
outside. Query 2 of `rls-check.sql` answers it from inside.

---

## Open decisions

1. ~~Claim-local-data flow.~~ **Settled 8 Sep.** Ask, never decide silently;
   default to merging, because the merge is a union and loses nothing; write a
   backup before anything changes. `src/backend/claim.js` and `ClaimScreen`.
2. **App.jsx is now 3,108 lines**, up from ~2,600 — the 8 September work made
   this worse, not better. New screens went to their own files, but the settings
   rows, consent gate and claim wiring all landed in App.jsx. State ownership is
   settled, so the split is still safe; there is just more of it.
3. **Bundle is 917 KB** (262 KB gzipped), up from 859 KB: supabase-js is ~209 KB
   of it and the 8 September work added ~58 KB more. On a low-end Android over
   slow data this is a real cost, and it is now the largest single lever on the
   experience of the device these users actually own. Code-split the backend and
   Recharts before launch.

---

## Layout

```
src/domain/    Business rules, framework-free, fully tested.
               money · inventory (ledger) · stats · schema · migrate
src/store/     Zustand store. Per-entity actions, persisted to localStorage.
src/backend/   Supabase client, row mappers, auth, sync, claim.
               Degrades to local-only throughout.
src/analytics/ Usage telemetry, crash capture, error boundary. Allowlisted.
src/legal/     Privacy policy and terms, as data. One file, lawyer-readable.
src/screens/   AuthScreen · LegalScreen · ClaimScreen. The rest is in App.jsx.
supabase/      migrations · functions (Edge) · emails · tests
               setup-all.sql · rls-check.sql · analytics-queries.sql
```

`supabase/setup-all.sql` now holds FIVE migrations and is still not idempotent.
A project that already ran the first three must apply only the two newer
migration files — never re-run setup-all.

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

---

## Session log — 8 September 2026

Phase 2 finished and most of Phase 3 built, in one session, on branch
`claude/repo-review-54joy7`. Nine commits, `5ee30ba`..`c74a8a9`.

### What got unblocked

`setup-all.sql` was pasted into the SQL Editor and applied. `.env.local` was
recreated from `LOCAL_SETUP.md` §2 and confirmed to reach Vite — checked in the
*served module*, not just on disk, because a file that exists and a file that
Vite has picked up are different claims.

"Confirm email" is now **off** (`mailer_autoconfirm: true`) and
`http://localhost:5173` is in the redirect allowlist. The latter was confirmed
indirectly and neatly: Supabase silently replaces a non-allowlisted
`redirect_to` with the Site URL, and it came back intact.

Google sign-in is live. The Cloud Console client is a **Web application** type —
the OAuth exchange happens in Supabase, not the browser — with
`https://ufyyurmekegbzkqjisdb.supabase.co/auth/v1/callback` as the redirect URI.
Scopes are `email profile`, which are non-sensitive, so publishing the consent
screen needed no Google review.

### What was built

- **Auth:** Google sign-in; six-digit code verification (`verifyOtp`) so a
  confirmation or password reset can be finished *inside* the app; a clickwrap
  consent gate that records the accepted `LEGAL_VERSION` on user metadata.
- **Email:** five branded auth templates in `supabase/emails` (regenerate with
  `generate.py`), plus a queue-backed notification sender — trial warnings,
  low stock, weekly summary, new sign-in — through Brevo.
- **Legal:** privacy policy and terms in `src/legal/documents.js`, rendered
  in-app by `LegalScreen`, plus self-service account deletion.
- **Analytics:** first-party usage telemetry and crash capture, opt-in, with a
  90-day retention job and eight ready-made queries.
- **Claim flow:** the path an existing local-only user takes to get an account.

### Two false claims were shipping, and are now fixed

Worth recording because both were live liability, not untidiness:

- About said **"Your records stay on your device."** True before Phase 2, false
  the moment sync shipped.
- The v1.4.3 changelog still advertised **"local data encryption stability."**
  The same claim had already been removed from About for being untrue. The PIN
  is a screen lock, not encryption.

The lesson generalises: every claim in user-facing copy has to be re-checked
when the architecture changes under it. The privacy policy written earlier in
this same session said the app collected no analytics — which the analytics
work made false two hours later, and it had to be rewritten to match.

### Before anyone else can sign up

1. **`ENTITY` in `src/legal/documents.js` is placeholders.** The policy is live
   in the app right now showing `[YOUR REGISTERED BUSINESS OR PERSONAL NAME]`.
2. **Deploy the Edge Functions:** `notify`, `unsubscribe --no-verify-jwt`,
   `delete-account`. Until then the Delete Account button errors and nothing
   sends.
3. **Storage bucket `brand`** with `public/wordmark-light.png`, or every email
   shows alt text instead of the logo.
4. **Custom SMTP (Brevo).** This is the real launch blocker: Supabase's built-in
   sender only delivers to your own team addresses, so a beta tester's
   confirmation email goes nowhere, silently, while sign-up appears to succeed.
5. **Lawyer review** of governing law, the liability cap, VAT, and whether
   cross-border transfer needs more than the consent collected at sign-up.
6. Then turn "Confirm email" back on.

### Notes for whoever picks this up

The two highest-value engineering jobs are both listed under Open decisions and
both got worse today: App.jsx grew ~500 lines, and the bundle grew ~58 KB. The
bundle is the one that touches every user on every launch.

`npm run lint` is still 4 errors and 3 warnings, all pre-existing, all in
App.jsx. Nothing added on 8 September contributed to it — two new violations
were introduced during the work and both were fixed rather than suppressed. Keep
it that way; the count is a useful tripwire precisely because it has not moved.

---

## Deployment — what is actually live, 9 September 2026

Established by probing Vercel and DNS directly, not from memory. This was not
written down anywhere and cost a session to rediscover.

### Two Vercel projects, one repo

Both are linked to `XMP-GLITCH/BizTrack` and both build on every push:

| Project | Domains | Status |
|---|---|---|
| **`biz-track`** | `biztrack.store`, `www.biztrack.store`, **`biz-track-nine.vercel.app`** | **The live one.** Users are here. |
| `biz-track-oy5c` | `biz-track-oy5c.vercel.app` | Abandoned duplicate. Delete or disconnect it. |

`biz-track.vercel.app` is **not ours** — that subdomain belongs to another
Vercel account and serves a Next.js app. That is why the second project got the
`-oy5c` suffix. Do not chase it.

Production on both is still `e4e14ee` (main, v1.5.9), which contains no Supabase
code at all. **The branch has never been deployed to production.**

### `biztrack.store` is bought but dead

Registered at Namecheap, on Namecheap's own nameservers
(`dns1.registrar-servers.com`), with **no A or AAAA records**. Nothing resolves.
To point it at Vercel: A record `@` → `76.76.21.21`, and a CNAME for `www` whose
target must be **copied from the Vercel domains tab** — Vercel issues a
per-project value and its own docs disagree between `cname.vercel-dns.com` and
`cname.vercel-dns-0.com`.

### The trap that governs the whole migration

**localStorage is per-origin.** Books saved at `biz-track-nine.vercel.app` are
invisible at `biztrack.store`. A user moved to the new domain before they have
an account sees an empty app — indistinguishable from total data loss, and the
exact failure that produced the v1.5.3–v1.5.7 emergency-rescue history.

So the order is fixed, and it is not negotiable:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the **`biz-track`**
   project, visibility **Config** — Vercel refuses `Secret` on a `VITE_` prefix
   because Vite inlines it into the client bundle, which is correct.
2. Deploy to the origin users already use.
3. Get both existing users onto accounts, so their books reach the server.
4. *Then* point `biztrack.store` at the project.

Anyone without an account moves by **file**, via Settings → Save My Data to a
File, then Restore From a File on the other device.

### Vite inlines env vars at BUILD time

A deploy without those two variables produces an app that silently runs
local-only: no sign-in screen, no accounts, no sync, and it looks perfectly
healthy. Verify a build from outside rather than trusting the dashboard:

```sh
curl -s <deployment>/assets/index-*.js | grep -q ufyyurmekegbzkqjisdb
```

Preview deployments are behind `ssoProtection: all_except_custom_domains`, so
that check needs a Vercel share link — and a beta tester cannot open a preview
URL at all. Custom domains are exempt, which is one more reason to finish
`biztrack.store`.

Measured on the branch preview: the bundle is **920 KB**. That is the number the
code-splitting work has to move.
