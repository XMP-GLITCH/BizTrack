-- The bug that meant NO USER HAD EVER SYNCED A SINGLE ROW.
--
-- Symptom: every push of a business returned 403 / 42501,
--   "new row violates row-level security policy for table businesses",
--   for all 8 accounts, continuously, since the schema went up. Reads worked.
--   `businesses` stayed at 0 rows forever, so items/sales/movements never ran
--   either: `pushChanges` aborts on the first failure and `pullChanges` never
--   follows.
--
-- Cause: the client UPSERTS (`on_conflict=id`), because a retry after a
-- dropped connection must update the same row rather than duplicate a sale.
-- PostgreSQL requires an `INSERT ... ON CONFLICT DO UPDATE` to satisfy the
-- UPDATE policy's WITH CHECK as well as the INSERT policy's -- EVEN WHEN
-- NOTHING CONFLICTS. The UPDATE policy read `is_business_member(id)`, and the
-- membership row that function looks for is created by `add_owner_as_member`,
-- an AFTER INSERT trigger which has not fired yet at the moment the check runs.
--
-- So the very first write of a business could never pass, for anybody, ever.
-- A plain INSERT of the identical row as the identical role passes; only the
-- upsert form fails, which is why it survived 35 RLS tests: those assert the
-- plain shape, not the shape PostgREST actually sends.
--
-- Fix: let the OWNER through on their own row without consulting membership.
-- This is what the original migration already said it guaranteed --
-- "there is no such thing as a business whose owner cannot see it" -- and did
-- not actually enforce, because it routed the owner's access through a row
-- that does not exist yet.
--
-- Not weaker: `owner_id = auth.uid()` still pins every path to the caller, so
-- a business cannot be read, updated, or handed to anyone else. A non-owner
-- member could never satisfy `owner_id = auth.uid()` before either, so their
-- access is unchanged.

drop policy if exists businesses_select_member on public.businesses;
create policy businesses_select_member on public.businesses
  for select to authenticated
  using (owner_id = auth.uid() or public.is_business_member(id));

drop policy if exists businesses_update_member on public.businesses;
create policy businesses_update_member on public.businesses
  for update to authenticated
  using (owner_id = auth.uid() or public.is_business_member(id))
  with check (owner_id = auth.uid());
