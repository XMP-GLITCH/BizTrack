-- One customer, one basket.
--
-- A customer buying three different things is three sale rows, and that is
-- correct: stock and profit are per item, and merging them into one record
-- would break the ledger the whole app is built on. But the CUSTOMER should
-- get one receipt, not three.
--
-- `group_id` is the whole feature. Sales recorded in a single go share one, so
-- a receipt can show every line that belongs together. It changes nothing about
-- the money. Null means a sale recorded on its own, which is most of them.
--
-- Deliberately a plain text column and NOT a foreign key to a `sale_groups`
-- table. There is nothing to store about a group beyond the fact that some
-- sales share one: no total to keep in step, no status, no owner. A table would
-- be a second place for the same fact to live, and this file has spent a week
-- deleting those.
alter table public.sales add column if not exists group_id text;

-- Receipts are fetched by group, and a shop that has traded for a year has
-- thousands of sales. Partial, because the overwhelming majority of sales have
-- no group and there is no reason to index a column that is null.
create index if not exists sales_group_id_idx
  on public.sales (business_id, group_id)
  where group_id is not null;

-- No RLS change. `sales` already has policies scoped to the owner, and adding a
-- column does not widen them: a column is only reachable through a row someone
-- was already allowed to read.
