-- Invoices: money ASKED FOR.
--
-- A separate table, and that is the entire point rather than an organisational
-- preference. `sales` is money the books say has ARRIVED: every row in it is
-- summed into revenue, profit, the weekly chart, the item ranking, the CSV and
-- the copy-for-analysis summary. An unpaid invoice living there behind a flag
-- would have to be filtered out of all six, and the day a seventh is added and
-- forgotten, the owner's revenue silently includes money nobody has paid them.
--
-- So it is not that invoices are excluded from revenue. It is that they cannot
-- reach it.
--
-- Paying one does NOT move a row into `sales`. The owner records the sale the
-- ordinary way and `sale_group_id` remembers that the two belong together. A
-- conversion that wrote on the invoice's behalf would reopen the same hole from
-- the other end.

create table if not exists public.invoices (
  id            uuid primary key,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null,

  -- The first customer data this app has ever stored. Both optional: plenty of
  -- invoices are written for someone the owner only knows by face.
  customer_name    text not null default '',
  customer_contact text not null default '',
  note             text not null default '',

  -- Lines are DOCUMENT CONTENT, not ledger entries: never queried on their own,
  -- never aggregated, and never summed into anything. A child table would buy
  -- joins nobody needs and a second place for the same snapshot to drift.
  lines         jsonb not null default '[]'::jsonb,

  issued_at     timestamptz not null default now(),
  due_at        timestamptz,
  -- Null means unpaid. It is the only thing separating an outstanding invoice
  -- from a settled one, and it is never inferred from a sale.
  paid_at       timestamptz,
  paid_method   text not null default '',
  sale_group_id text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- "Who owes me" is the question this feature exists to answer, so it is the
-- query that gets an index. Partial, because a settled invoice is history.
create index if not exists invoices_outstanding_idx
  on public.invoices (business_id, issued_at desc)
  where paid_at is null and deleted_at is null;

create index if not exists invoices_updated_at_idx
  on public.invoices (business_id, updated_at desc);

alter table public.invoices enable row level security;

-- Same shape as every other table here: reachable only through a business the
-- caller is a member of. `is_business_member()` is SECURITY DEFINER on purpose,
-- because a policy on `business_members` that queries `business_members`
-- recurses infinitely.
drop policy if exists "members read invoices"   on public.invoices;
drop policy if exists "members write invoices"  on public.invoices;
drop policy if exists "members update invoices" on public.invoices;
drop policy if exists "members delete invoices" on public.invoices;

create policy "members read invoices"
  on public.invoices for select to authenticated
  using (public.is_business_member(business_id));

create policy "members write invoices"
  on public.invoices for insert to authenticated
  with check (public.is_business_member(business_id));

-- Both `using` and `with check`: with only `using`, someone allowed to touch a
-- row could rewrite its `business_id` into a business they do not belong to.
create policy "members update invoices"
  on public.invoices for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "members delete invoices"
  on public.invoices for delete to authenticated
  using (public.is_business_member(business_id));

-- Run supabase/rls-check.sql after applying this, as after ANY schema change.
