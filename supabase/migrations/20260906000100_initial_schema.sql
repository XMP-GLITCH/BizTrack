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
