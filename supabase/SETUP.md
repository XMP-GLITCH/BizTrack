# Connecting BizTrack to Supabase

Everything in this repo is written and tested; what remains needs your Supabase
account. Two paths — pick either. Both take about five minutes.

## Path A — CLI (recommended, one command applies all migrations)

```sh
npx supabase login                          # opens a browser
npx supabase link --project-ref <your-ref>  # the xxxx in xxxx.supabase.co
npx supabase db push                        # applies supabase/migrations/*
```

`supabase/config.toml` is already committed, so `link` and `push` work as-is.

## Path B — Dashboard (no CLI)

Open your project → **SQL Editor**, and run these three files **in order**:

1. `supabase/migrations/20260906000100_initial_schema.sql`
2. `supabase/migrations/20260906000200_rls.sql`
3. `supabase/migrations/20260906000300_billing.sql`

Order matters: the policies reference tables created by the first file.

## Then, in both cases

**1. Credentials.** Settings → API. Copy into `.env.local`:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / public key>
```

Both are public by design and ship in the client bundle. Row-level security is
what protects the data, which is why `20260906000200_rls.sql` is the real
security boundary and has 35 tests against it.

Never put the **service_role** key in this file. It bypasses RLS entirely.

**2. Auth.** Authentication → Providers → enable **Email**. Turn on "Confirm
email" before you take real signups.

**3. Redirect URLs.** Authentication → URL Configuration → add your deployed
origin (and `http://localhost:5173` for development). Password reset and Google
sign-in both fail silently without this.

## Checking it worked

```sh
npm run dev
```

The console logs `No Supabase credentials found; running local-only` when the
env vars are missing. That line disappearing is the signal it connected.

In the dashboard, Table Editor should list six tables: `profiles`,
`businesses`, `business_members`, `items`, `sales`, `stock_movements`.

## Verifying the policies against your live project

The RLS suite runs against local Postgres. To sanity-check the deployed
policies, create two accounts in your project, sign in as each, and confirm
neither can see the other's businesses. If both see everything, RLS did not get
enabled — re-run `20260906000200_rls.sql`.

## What was verified before you got here

Against a real PostgreSQL 16 running these exact migration files:

- **35 RLS tests**, each asserted in both directions — the owner can reach their
  data, another user cannot. Covers cross-user reads on every table, writes into
  another user's business, ownership reassignment, staff privilege limits,
  anonymous access, and the `SECURITY DEFINER` helper that stops a policy on
  `business_members` from recursing on itself.
- **A full data round trip** (`supabase/tests/roundtrip.sh`): a business
  flattened to rows, inserted as an authenticated user through RLS, read back
  through the policies and reassembled. Revenue, COGS, profit, units sold, stock
  on hand and weighted average cost all return identical.

What could **not** be verified from the build environment is the live service
itself — GoTrue auth, PostgREST, and the network round trip to
`*.supabase.co` — because outbound access to Supabase is blocked there. Expect
to shake out ordinary integration details (redirect URLs, email confirmation
settings) on first connection.
