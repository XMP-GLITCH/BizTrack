# BizTrack

An offline-first PWA for tracking inventory, sales and profit across several
small businesses. Built for independent sellers and makers — crochet, thrift,
food, beauty — with XAF and other West/Central and East African currencies
first-class.

Offline-first is a product decision, not a leftover. Mobile data is expensive
and intermittent for the people using this, so the app reads and writes locally
and syncs when it can, rather than showing a loading spinner when the network
drops.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build
npm test           # unit + integration tests (node:test, no extra deps)
npm run lint
```

The app runs **fully local with no backend configured**, which is how it ships
to beta testers. To connect Supabase, copy `.env.example` to `.env.local` and
fill it in — see [`supabase/README.md`](supabase/README.md).

Database and row-level-security tests need a local Postgres:

```sh
./supabase/tests/run.sh
```

## Layout

```
src/
  domain/      Business rules, framework-free and fully tested.
               money, stock ledger, statistics, schema, legacy migration.
  store/       Zustand store. Per-entity actions, persisted to localStorage.
  backend/     Supabase client and the row <-> record mapping layer.
  App.jsx      Screens, modals and styles.
supabase/
  migrations/  Schema, RLS policies, billing columns.
  tests/       RLS suite, asserted in both directions.
```

## The three ideas that shape the code

**Money is an integer in the currency's minor unit.** XAF has no subunit, so
1 500 XAF is `1500`; USD has two, so `$15.00` is `1500`. Floats accumulate error
across the sums every screen performs, and books that are off by a franc destroy
trust faster than a crash. Currency belongs to a business, so an amount is
always interpretable.

**Stock is a ledger, not a counter.** Quantity on hand is derived by summing
`stockMovements`. This is what lets two devices sync without losing a sale, and
it is why a restock at a new price averages in rather than retroactively
repricing stock already on the shelf. It also means "why is my stock 3?" is an
answerable question.

**Records are built to sync before there is a server.** Client-generated UUIDs,
`updatedAt` on every mutation, and soft deletes with `deletedAt`. A hard delete
cannot propagate — the other device has no way to tell "deleted" from "not seen
yet".

## Data safety

Upgrading an existing install rewrites its stored data, on a device that holds
the only copy of someone's books. So the migration writes an untouched snapshot
first, converts each business in isolation so one bad record cannot cost the
others, verifies the result against the source on the device itself (counts,
units sold, per-item stock), and shows a recovery screen offering the original
if anything fails. Users can download that snapshot at any time from
**Account → Pre-Upgrade Backup**.
