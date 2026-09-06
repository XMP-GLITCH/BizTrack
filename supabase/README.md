# BizTrack backend

Supabase (Postgres + auth + row-level security). There is no server-side
application code: the client talks to Postgres directly, so **the RLS policies
are the entire authorization layer**. Treat `20260906000200_rls.sql` as security
code and keep `tests/rls_test.sql` passing.

## Setting up a project

1. Create a project at supabase.com. Pick the region closest to your users.
2. Run the migrations in `migrations/`, in filename order — SQL Editor, or
   `supabase db push` if you use the CLI.
3. Copy the project URL and anon key into `.env.local` (see `.env.example`).
4. Auth → Providers: enable **Email**. Turn on "Confirm email" for production.
5. Auth → URL Configuration: add your deployed origin to the redirect allow-list.

Leave the env vars unset and the app runs fully local, exactly as it does today.

## Running the tests

Needs a local Postgres (any recent version):

```sh
./supabase/tests/run.sh
```

`_supabase_shim.sql` provides the small part of Supabase the migrations depend
on — `auth.users`, `auth.uid()`, and the `anon`/`authenticated` roles — so the
real migration files run unmodified against plain Postgres.

## Design decisions worth knowing before changing anything

**Money is `bigint` in the currency's minor unit.** XAF has no subunit (1500
stays 1500); USD has two ($15.00 → 1500). Never store money as a float. Currency
lives on the business so an amount is always interpretable.

**Stock on hand is not stored.** It is derived by summing `stock_movements`.
Two devices offline, each selling the last unit, both insert a row and the total
comes out right — a stored counter would have both write "4" and lose a sale.

**Deletes are soft.** A hard delete cannot sync: the other device cannot tell
"deleted" from "not seen yet". Every table that syncs has `deleted_at`.

**`updated_at` is set by a trigger, never by the client.** Incremental pulls are
`updated_at > cursor`, so it must come from one clock. Trusting client
timestamps means a device with a wrong clock silently misses its own rows.

**Ids come from the client.** A record created offline gets its permanent
identity immediately, which is what makes a retried push idempotent instead of
duplicating rows.

**Access is by membership, never by `owner_id` directly.** `business_members`
exists from day one even though the UI creates exactly one row per business
today. Adding staff accounts later needs no policy changes — only new rows.
Retrofitting tenancy onto live data is the migration you do not want.

**`is_business_member()` is `SECURITY DEFINER` on purpose.** A policy on
`business_members` that queries `business_members` recurses infinitely. Running
the lookup as the definer skips RLS inside the function and breaks the cycle.
This is the most common way to break a Supabase schema; there is a test for it.

**Plan state never gates data access.** `profiles.plan` is recorded in the
database, but an expired plan makes the app read-only in the *client* —
everything stays visible and exportable, only new writes stop. Enforcing it in
RLS would put someone's own books behind their subscription status.
