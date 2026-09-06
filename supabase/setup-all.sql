-- ─────────────────────────────────────────────────────────────────────────────
-- BizTrack — complete database setup.
--
-- Paste this whole file into the Supabase SQL Editor and press Run. It is the
-- three files in supabase/migrations/ concatenated in order, unchanged.
--
-- Safe to run ONCE on a fresh project. It is not idempotent: running it twice
-- will error on "already exists", which is harmless but means the second run
-- did nothing.
--
-- A verification query at the bottom prints what was created.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════
-- 20260906000100_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- BizTrack schema.
--
-- Design notes that matter for anyone changing this later:
--
--  * Money is BIGINT in the currency's minor unit, never a float. XAF has no
--    subunit (1500 stays 1500); USD has two ($15.00 -> 1500). Currency lives on
--    the business so an amount is always interpretable.
--
--  * Stock on hand is NOT stored. It is derived by summing stock_movements.
--    Two devices offline, each selling the last unit, both insert a row and the
--    total comes out right; a stored counter would have them both write "4" and
--    silently lose a sale.
--
--  * Deletes are soft (deleted_at). A hard delete cannot sync -- the other
--    device has no way to tell "deleted" from "not seen yet".
--
--  * updated_at is set by a trigger, NEVER by the client. Sync pulls rows with
--    `updated_at > cursor`, so it must come from one clock. Trusting client
--    timestamps means a device with a wrong clock silently misses its own rows.
--
--  * Ids are generated on the client so a record created offline has its
--    permanent identity immediately, which makes a retried push idempotent.
--    The database accepts the id it is given rather than assigning one.

create extension if not exists "pgcrypto";

-- ── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text        not null default 'Business Owner',
  avatar_url          text,
  default_currency    text        not null default 'XAF',
  low_stock_threshold integer     not null default 3 check (low_stock_threshold > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── businesses ─────────────────────────────────────────────────────────────
create table public.businesses (
  id         uuid primary key,
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  name       text        not null check (length(btrim(name)) > 0),
  category   text        not null default 'Other',
  color      text        not null default '#C17F5A',
  emoji      text        not null default '🛍️',
  currency   text        not null default 'XAF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Membership exists from day one even though the UI only ever creates one row
-- per business today. Retrofitting a tenancy layer onto live data is one of the
-- genuinely painful migrations; an unused join table costs nothing now.
create table public.business_members (
  business_id uuid        not null references public.businesses (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  role        text        not null default 'owner' check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- ── items ──────────────────────────────────────────────────────────────────
-- No quantity or cost column: both are derived from stock_movements.
create table public.items (
  id          uuid primary key,
  business_id uuid        not null references public.businesses (id) on delete cascade,
  name        text        not null check (length(btrim(name)) > 0),
  unit_price  bigint      not null default 0 check (unit_price >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at  timestamptz
);

-- ── sales ──────────────────────────────────────────────────────────────────
-- item_id is nullable for one-off custom work with no inventory behind it, and
-- item_name / unit_cost are denormalised on purpose: a sale must remember what
-- it was worth at the time, even if the item is later renamed or removed.
create table public.sales (
  id            uuid primary key,
  business_id   uuid        not null references public.businesses (id) on delete cascade,
  item_id       uuid        references public.items (id) on delete set null,
  item_name     text        not null,
  qty           integer     not null check (qty > 0),
  unit_price    bigint      not null default 0 check (unit_price >= 0),
  unit_cost     bigint      not null default 0 check (unit_cost >= 0),
  asking_price  bigint      not null default 0 check (asking_price >= 0),
  note          text        not null default '',
  is_custom     boolean     not null default false,
  occurred_at   timestamptz not null default now(),
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ── stock movements ────────────────────────────────────────────────────────
-- Append-only. Rows are facts about what happened, so they merge across devices
-- without conflict. delta is negative for sales, positive for purchases.
create table public.stock_movements (
  id          uuid primary key,
  business_id uuid        not null references public.businesses (id) on delete cascade,
  item_id     uuid        not null references public.items (id) on delete cascade,
  delta       integer     not null check (delta <> 0),
  unit_cost   bigint      not null default 0 check (unit_cost >= 0),
  reason      text        not null check (reason in ('initial', 'restock', 'sale', 'adjustment')),
  sale_id     uuid        references public.sales (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── sync indexes ───────────────────────────────────────────────────────────
-- Every pull is "rows in my businesses changed since <cursor>".
create index businesses_owner_updated_idx      on public.businesses (owner_id, updated_at);
create index items_business_updated_idx        on public.items (business_id, updated_at);
create index sales_business_updated_idx        on public.sales (business_id, updated_at);
create index movements_business_updated_idx    on public.stock_movements (business_id, updated_at);
create index movements_item_idx                on public.stock_movements (item_id, occurred_at);
create index sales_item_idx                    on public.sales (item_id) where item_id is not null;
create index business_members_user_idx         on public.business_members (user_id);

-- ── updated_at triggers ────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Server clock only. See the note at the top of this file.
  new.updated_at := now();
  return new;
end;
$$;

create trigger businesses_touch    before insert or update on public.businesses      for each row execute function public.touch_updated_at();
create trigger items_touch         before insert or update on public.items           for each row execute function public.touch_updated_at();
create trigger sales_touch         before insert or update on public.sales           for each row execute function public.touch_updated_at();
create trigger movements_touch     before insert or update on public.stock_movements for each row execute function public.touch_updated_at();
create trigger profiles_touch      before insert or update on public.profiles        for each row execute function public.touch_updated_at();

-- ── new user bootstrap ─────────────────────────────────────────────────────
-- A profile must exist the moment a user signs up, or the first sync has
-- nowhere to write their settings.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Business Owner')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── owner is always a member ───────────────────────────────────────────────
-- Keeps membership authoritative for access checks: there is no such thing as a
-- business whose owner cannot see it.
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (business_id, user_id) do nothing;
  return new;
end;
$$;

create trigger businesses_add_owner_member
  after insert on public.businesses
  for each row execute function public.add_owner_as_member();

-- ═══════════════════════════════════════════════════════════════════
-- 20260906000200_rls.sql
-- ═══════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════
-- 20260906000300_billing.sql
-- ═══════════════════════════════════════════════════════════════════

-- Trial and plan state.
--
-- Two columns and nothing else on purpose. Billing is collected manually while
-- the user base is small enough to talk to, which is the cheapest way to learn
-- what people will actually pay; these columns just record the outcome so the
-- app can enforce it and so automated billing later needs no migration.
--
-- The app must never lock someone out of their own records. An expired plan
-- makes the app READ-ONLY -- everything stays visible and exportable, only new
-- writes stop. Enforcing that in the database would put a user's books behind
-- their subscription status, so it is deliberately a client-side gate.

alter table public.profiles
  add column plan            text        not null default 'trialing'
    check (plan in ('trialing', 'active', 'expired')),
  add column trial_ends_at   timestamptz not null default (now() + interval '30 days'),
  add column plan_expires_at timestamptz;

comment on column public.profiles.plan is
  'trialing | active | expired. Expired means read-only in the client, never data denial.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification — expect 6 tables, and rls_enabled = true on every one.
-- ═══════════════════════════════════════════════════════════════════════════

select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('profiles','businesses','business_members','items','sales','stock_movements')
order by c.relname;
