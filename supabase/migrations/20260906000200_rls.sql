-- Row Level Security.
--
-- This is the entire authorization layer. There is no server-side application
-- code between the client and the database, so if a policy is wrong, one user
-- can read another's books. Everything below is exercised by the tests in
-- supabase/tests/rls_test.sql, which assert both that the right person CAN see
-- their data and that the wrong person CANNOT.
--
-- Access is decided by membership, never by owner_id directly, so adding staff
-- accounts later needs no policy changes -- only new rows in business_members.

alter table public.profiles         enable row level security;
alter table public.businesses       enable row level security;
alter table public.business_members enable row level security;
alter table public.items            enable row level security;
alter table public.sales            enable row level security;
alter table public.stock_movements  enable row level security;

-- Force RLS for table owners too, so a mistake elsewhere cannot quietly bypass
-- these policies.
alter table public.profiles         force row level security;
alter table public.businesses       force row level security;
alter table public.business_members force row level security;
alter table public.items            force row level security;
alter table public.sales            force row level security;
alter table public.stock_movements  force row level security;

-- ── membership helper ──────────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing, not incidental. A policy on
-- business_members that queries business_members recurses infinitely; running
-- the lookup as the definer skips RLS inside the function and breaks the cycle.
-- It is STABLE so the planner calls it once per statement rather than per row.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_owner(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_business_owner(uuid) to authenticated;

-- ── profiles ───────────────────────────────────────────────────────────────
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── businesses ─────────────────────────────────────────────────────────────
create policy businesses_select_member on public.businesses
  for select to authenticated using (public.is_business_member(id));

-- You may only create a business owned by yourself.
create policy businesses_insert_own on public.businesses
  for insert to authenticated with check (owner_id = auth.uid());

-- Members may edit; the WITH CHECK prevents handing the business to someone
-- else by rewriting owner_id.
create policy businesses_update_member on public.businesses
  for update to authenticated
  using (public.is_business_member(id))
  with check (public.is_business_member(id) and owner_id = auth.uid());

create policy businesses_delete_owner on public.businesses
  for delete to authenticated using (owner_id = auth.uid());

-- ── business_members ───────────────────────────────────────────────────────
-- Your own membership rows, plus everyone in a business you belong to.
create policy members_select on public.business_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_business_member(business_id));

-- Only the owner manages who has access.
create policy members_insert_owner on public.business_members
  for insert to authenticated with check (public.is_business_owner(business_id));

create policy members_update_owner on public.business_members
  for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy members_delete_owner on public.business_members
  for delete to authenticated using (public.is_business_owner(business_id));

-- ── items / sales / stock movements ────────────────────────────────────────
-- Identical shape: membership in the owning business grants full access. The
-- WITH CHECK on insert stops a client writing rows into someone else's business.
create policy items_select on public.items
  for select to authenticated using (public.is_business_member(business_id));
create policy items_insert on public.items
  for insert to authenticated with check (public.is_business_member(business_id));
create policy items_update on public.items
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy items_delete on public.items
  for delete to authenticated using (public.is_business_member(business_id));

create policy sales_select on public.sales
  for select to authenticated using (public.is_business_member(business_id));
create policy sales_insert on public.sales
  for insert to authenticated with check (public.is_business_member(business_id));
create policy sales_update on public.sales
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy sales_delete on public.sales
  for delete to authenticated using (public.is_business_member(business_id));

create policy movements_select on public.stock_movements
  for select to authenticated using (public.is_business_member(business_id));
create policy movements_insert on public.stock_movements
  for insert to authenticated with check (public.is_business_member(business_id));
create policy movements_update on public.stock_movements
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy movements_delete on public.stock_movements
  for delete to authenticated using (public.is_business_member(business_id));

-- ── grants ─────────────────────────────────────────────────────────────────
-- RLS filters rows; grants decide whether the role may touch the table at all.
-- anon gets nothing: there is no public-facing data in this app.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.businesses, public.business_members,
  public.items, public.sales, public.stock_movements
  to authenticated;
