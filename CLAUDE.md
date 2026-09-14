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
| 3 — Public launch | ✅ Shipped 11–13 Sep 2026. Live at **biztrack.store**. Accounts, Google sign-in, email codes, password reset, branded email, legal documents, analytics, notifications — all deployed and verified end to end. What remains is not engineering: getting the two existing users onto accounts, and a lawyer reading the documents before money changes hands. |

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

**Proven 11 Sep 2026, against the live project:** all four Edge Functions
(`notify`, `unsubscribe`, `delete-account`, `send-email`) are deployed and
have executed. `notify` rejects a bad secret and sends with a good one;
`delete-account` refuses an unauthenticated call; `unsubscribe` reaches its
RPC and answers correctly; `send-email` refuses an unsigned request and sends
on a valid signature. Email through Brevo is delivering: signup confirmation,
password reset and sign-in notices all observed as requests → delivered →
opened in Brevo's event log.

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
3. ~~Bundle is 917 KB.~~ **Done 11 Sep.** Recharts (340 KB — a third of the
   app) is lazy behind `Suspense` in `ProfitChart.jsx`, and vendor code is split
   into react / supabase / icons / store chunks. First load is now **580 KB
   (166 KB gzipped)**, down from 920 KB / 264 KB. The vendor split matters most
   on the loads *after* an update: a release invalidates a 46 KB app chunk
   instead of a 264 KB monolith. The chart chunk is still precached by the
   service worker on purpose — this is offline-first, and someone opening
   Analytics with no signal should still see their chart.

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

---

## Session log — 11–13 September 2026

The launch. Everything below was verified against the live services, not
inferred — mostly by probing from outside, because that is the only check that
cannot be fooled by a dashboard that says the right thing.

### It is live

**https://biztrack.store** — apex canonical, `www` redirects to it, TLS issued,
serving the same build as `biz-track-nine.vercel.app`.

Both origins matter and they are NOT interchangeable. localStorage is
per-origin, so the two existing users' books live at the vercel.app address
until they have accounts. Sending them to `biztrack.store` before they sync
shows them an empty app, which is indistinguishable from losing everything.

### Email, and why it is not SMTP

Supabase Auth sends through a **Send Email Hook** (`supabase/functions/
send-email`), not SMTP. That is deliberate and hard-won: Supabase's own SMTP
client returned `500 Error sending recovery email` against Brevo while the
*identical* host, port, username, password and sender authenticated and sent
fine from outside it. The fault was inside Supabase's SMTP path. The Brevo API
was already proven, so the hook routes around it.

Two things that bought beyond unblocking delivery: the five branded templates
now render from `send-email/templates.ts` in the repo rather than being pasted
into five dashboard tabs nobody can diff, and every auth email carries the
numeric code beside its button.

The hook verifies a **standard-webhooks HMAC signature** on every request,
constant-time, rejecting anything older than five minutes. This is not
optional: the endpoint sends as a DKIM- and SPF-passing BizTrack address, so an
open one would be a phishing gift aimed at users whose only business records
are in this app.

`no-reply@biztrack.store` sends; `Reply-To` is `hello@biztrack.store`, because
someone locked out of their books will hit reply and a bounce at that moment is
the worst possible answer.

### What the dashboards got wrong

Worth recording, because two of these cost real time:

- Brevo reported `authenticated: false` while its own API said every DNS record
  was `ok: true`. The records had been right for a while; Brevo simply had not
  re-checked. `PUT /v3/senders/domains/{domain}/authenticate` fixed it in one
  call.
- Brevo's SMTP panel showed "Currently Unavailable" while `GET /v3/account`
  reported `relay.enabled: true` with the host, port and login. The panel had
  failed to load, nothing more.
- Vercel's env vars were half-set: only `VITE_SUPABASE_URL`, Production only.
  Since `isBackendConfigured = Boolean(url && anonKey)`, production would have
  failed too.

The lesson that generalises: **verify from outside, in the built artefact.**
`curl -s <deployment>/assets/index-*.js | grep -q ufyyurmekegbzkqjisdb` is worth
more than any settings page.

### Bugs found by a real person, not by tests

Three, all in the signup flow, all mine, all invisible to `npm test`:

1. The Terms and Privacy links were inside the consent `<label>`, so tapping
   them toggled the checkbox instead of opening the document.
2. Fixing that exposed a second: Google sign-in is gated on that checkbox, and
   the accidental toggling had been satisfying the gate. With the links fixed
   the button silently refused, with the reason in small red text above the
   fold. The gate is right; making it invisible was not.
3. Password recovery issues an 8-digit code; the verify field had
   `maxLength={6}` and sliced input to 6. The last two digits were discarded as
   the user typed, so the code could never be entered at all — on the screen
   someone reaches when locked out.

All three shipped past a green test suite. Keep sending real-user reports;
they are worth more than anything curl can prove.

### Notifications are scheduled

`pg_cron` + `pg_net`, three jobs, secret in Vault rather than in the job bodies:

| Job | Schedule | Purpose |
|---|---|---|
| `biztrack-billing` | `0 7 * * *` | Trial warnings at 7/3/1 days, then trial-ended |
| `biztrack-weekly` | `0 7 * * 1` | Low stock + weekly summary |
| `biztrack-drain` | `*/15 * * * *` | Sends whatever is queued |

Without these the 30-day trial simply expires and the app goes read-only with
no warning — which is the entire trial-to-paid path.

**Verified running, 14 Sep 2026.** `cron.job` shows what is *scheduled*;
`cron.job_run_details` shows what actually *ran* — a job can be registered and
still fail every time, usually because `pg_net` cannot reach the function or
the Vault lookup returns null and the secret header goes out empty. Check the
second, and note the column trap: `job_run_details` has `jobid`, not
`jobname`, so it needs a join:

```sql
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
order by d.start_time desc limit 15;
```

That, together with the Brevo event log showing `requests → delivered`, is the
whole chain proven: cron fires → `notify` runs → Brevo delivers.

### Still open

Nothing technical. Every part of the system has been verified against the live
services. What remains is product work and housekeeping:

1. **The two existing users have never signed up.** Own phones,
   `biz-track-nine.vercel.app`, Google sign-in. Analytics and crash capture are
   live, so this is the step that starts producing real information.
2. **Brevo API key rotation.** It and the SMTP key were pasted into a session
   transcript. The SMTP key is now unused — the hook replaced it — so it can
   simply be deleted.
3. **Test accounts** `arreyewube273+hooktest@gmail.com` and possibly
   `otakufever003@gmail.com` are real rows and will muddy early numbers.
4. **A lawyer** on governing law, the liability cap and VAT before taking money.
5. **App.jsx is ~3,100 lines.** Still the largest structural debt, and unlike
   the bundle it costs the maintainer rather than the user.
