-- Product photos: a private bucket, owner-scoped.
--
-- Photos are blobs, so they do not belong in a table beside the ledger. They
-- live in Storage, and the ledger keeps only the id: `items.photo_id`.
--
-- THE PATH IS THE AUTHORISATION. Every object is stored at
--
--     {auth.uid()}/{photoId}.jpg
--
-- so the first path segment IS the owner, and each policy below compares it to
-- `auth.uid()`. That means no join, no lookup table, and nothing to keep in
-- step: a row cannot be mislabelled into another user's folder, because the
-- folder name is the check.
--
-- Note for when staff accounts land: `business_members` already exists for
-- multi-user, and these policies are OWNER-only. A staff account would have a
-- different `auth.uid()` and would see no photos. That is the safe direction to
-- be wrong in, and it is deliberate rather than overlooked.

-- ── the item points at its photo ─────────────────────────────────────────────
-- Without this the blobs reach Storage and NOTHING KNOWS WHICH ITEM THEY
-- BELONG TO. A phone restored from the account pulls every item with a null
-- photo id, so the lazy fetch has nothing to ask for and the whole remote path
-- is dead code that looks like it works, because the device that took the
-- photos still has them locally.
--
-- Text, not a foreign key: the id names a blob in Storage and in the device's
-- own IndexedDB, neither of which Postgres can reference.
alter table public.items add column if not exists photo_id text;

-- ── the bucket ───────────────────────────────────────────────────────────────
-- PRIVATE. A public bucket would make every product photo readable by anyone
-- who can guess a UUID, and this app's own privacy policy says records are not
-- shared. Reads go through a signed URL or an authenticated download.
--
-- 2 MB ceiling: the client compresses to about 100 KB before it ever uploads,
-- so this is a backstop against a bug, not a working limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── policies ─────────────────────────────────────────────────────────────────
-- Dropped first so this migration can be re-run. `storage.objects` already has
-- RLS enabled by Supabase; enabling it again is not needed and owning the table
-- is not guaranteed.

drop policy if exists "own product photos are readable" on storage.objects;
drop policy if exists "own product photos are writable" on storage.objects;
drop policy if exists "own product photos are replaceable" on storage.objects;
drop policy if exists "own product photos are deletable" on storage.objects;

create policy "own product photos are readable"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own product photos are writable"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update needs BOTH `using` and `with check`. With only `using`, a user who may
-- touch a row could rewrite its `name` into someone else's folder: the check
-- that let them in is not the check on what they wrote.
create policy "own product photos are replaceable"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own product photos are deletable"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── how to check this from outside ───────────────────────────────────────────
-- The same probe this project uses for table RLS works here. An anonymous
-- upload must be refused:
--
--   curl -X POST "$URL/storage/v1/object/product-photos/probe.jpg" \
--        -H "apikey: $ANON" -H "Content-Type: image/jpeg" --data-binary @tiny.jpg
--
-- A 400/403 means the policy held. A 200 means this migration has not been
-- applied, or the bucket was created public by hand in the dashboard.
