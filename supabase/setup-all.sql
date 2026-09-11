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


-- ═══════════════════════════════════════════════════════════════════
-- 20260907000100_notifications.sql
-- ═══════════════════════════════════════════════════════════════════

-- Notifications.
--
-- Everything that sends email goes through ONE queue. Cron jobs and triggers
-- only ever enqueue; a single Edge Function drains and sends. That indirection
-- buys three things worth more than the extra table:
--
--  * Idempotency. (user_id, kind, dedupe_key) is unique, so a cron run that
--    overlaps the previous one, or a sender that dies after delivering but
--    before committing, cannot email someone the same trial warning twice.
--    Duplicate billing email is how a product teaches people to filter it.
--
--  * Retry. A Brevo outage leaves rows pending with an error recorded, and the
--    next run picks them up. Sending inline would drop them silently.
--
--  * One audit trail. "Did we actually warn them before the trial ended?" is
--    answerable from SQL, which matters the first time someone disputes it.
--
-- Nothing here can withhold data. Notifications are advisory: an unsent email
-- never changes what the app shows or what the user can export.

-- ── preferences ────────────────────────────────────────────────────────────
-- Opt-OUT rather than opt-in. These are transactional messages about someone's
-- own books and their own trial, not marketing; a silent trial expiry is worse
-- for the user than an email they did not ask for. Marketing would need the
-- opposite default.
alter table public.profiles
  add column notify_billing    boolean not null default true,
  add column notify_alerts     boolean not null default true,
  add column notify_security   boolean not null default true,
  -- Lets an unsubscribe link work from an inbox, where there is no session.
  add column unsubscribe_token uuid    not null default gen_random_uuid();

comment on column public.profiles.notify_billing is
  'Trial and plan email. Opt-out: an unannounced trial expiry costs the user more than the email does.';

-- ── the queue ──────────────────────────────────────────────────────────────
create table public.notification_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- 'billing.trial_ending' | 'billing.trial_ended' | 'alert.low_stock'
  -- | 'alert.weekly_summary' | 'security.new_signin'
  kind       text        not null,
  -- Whatever makes this notification unique in time: 'd7' for the seven-day
  -- trial warning, '2026-W37' for a weekly summary. Together with kind and
  -- user it is the idempotency key.
  dedupe_key text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer     not null default 0,
  last_error text
);

create unique index notification_queue_dedupe_idx
  on public.notification_queue (user_id, kind, dedupe_key);

-- The sender's only read pattern: oldest unsent first.
create index notification_queue_pending_idx
  on public.notification_queue (created_at)
  where sent_at is null;

alter table public.notification_queue enable row level security;

-- Users may read their own notification history, and nothing may write from a
-- client session. Enqueueing is a privileged act: a client that could insert
-- here could send mail in someone else's name.
create policy notification_queue_select_own on public.notification_queue
  for select to authenticated using (user_id = auth.uid());

-- ── stock on hand ──────────────────────────────────────────────────────────
-- Stock is a ledger, so quantity is a sum and never a stored counter. This view
-- is the one place that sum lives for server-side callers, so the low-stock job
-- cannot drift from what the app itself computes.
create or replace view public.item_stock as
  select
    i.id                          as item_id,
    i.business_id,
    i.name                        as item_name,
    coalesce(sum(m.delta), 0)::bigint as on_hand
  from public.items i
  left join public.stock_movements m on m.item_id = i.id
  where i.deleted_at is null
    and i.archived_at is null
  group by i.id, i.business_id, i.name;

-- The view runs as its caller, so RLS on the underlying tables still applies
-- and one user cannot read another's stock through it.
alter view public.item_stock set (security_invoker = on);

-- ── enqueue: trial and plan ────────────────────────────────────────────────
-- Called by cron. Writes rows; sends nothing.
create or replace function public.enqueue_billing_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  -- Warnings at 7, 3 and 1 days. The bucket is the dedupe key, so a user who
  -- is 6.4 days out lands in the same 'd7' bucket they already received and is
  -- not warned twice.
  with due as (
    select
      p.id as user_id,
      case
        when p.trial_ends_at <= now() + interval '1 day'  then 'd1'
        when p.trial_ends_at <= now() + interval '3 days' then 'd3'
        when p.trial_ends_at <= now() + interval '7 days' then 'd7'
      end as bucket,
      p.trial_ends_at
    from public.profiles p
    where p.plan = 'trialing'
      and p.notify_billing
      and p.trial_ends_at > now()
      and p.trial_ends_at <= now() + interval '7 days'
  )
  insert into public.notification_queue (user_id, kind, dedupe_key, payload)
  select
    user_id, 'billing.trial_ending', bucket,
    jsonb_build_object(
      'trial_ends_at', trial_ends_at,
      'days_left', greatest(0, ceil(extract(epoch from (trial_ends_at - now())) / 86400)::int))
  from due
  where bucket is not null
  on conflict (user_id, kind, dedupe_key) do nothing;

  get diagnostics inserted = row_count;

  -- The trial has run out. The app is read-only from here; it never hides or
  -- withholds anything, and the copy has to say so plainly.
  insert into public.notification_queue (user_id, kind, dedupe_key, payload)
  select p.id, 'billing.trial_ended', to_char(p.trial_ends_at, 'YYYY-MM-DD'),
         jsonb_build_object('trial_ends_at', p.trial_ends_at)
  from public.profiles p
  where p.plan = 'trialing'
    and p.notify_billing
    and p.trial_ends_at <= now()
  on conflict (user_id, kind, dedupe_key) do nothing;

  return inserted;
end;
$$;

-- ── enqueue: low stock ─────────────────────────────────────────────────────
-- Weekly, not per-event. A maker who sells the last of three things in an
-- afternoon does not need three emails, and daily mail about stock they already
-- know is low is how this gets muted.
create or replace function public.enqueue_low_stock()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with low as (
    select
      b.owner_id                                as user_id,
      b.id                                      as business_id,
      b.name                                    as business_name,
      jsonb_agg(jsonb_build_object('name', s.item_name, 'on_hand', s.on_hand)
                order by s.on_hand, s.item_name) as items
    from public.businesses b
    join public.profiles   p on p.id = b.owner_id and p.notify_alerts
    -- Through the view, so this can never disagree with the app's own number.
    join public.item_stock s on s.business_id = b.id
    where b.deleted_at is null
      and s.on_hand <= p.low_stock_threshold
    group by b.owner_id, b.id, b.name
  )
  insert into public.notification_queue (user_id, kind, dedupe_key, payload)
  select
    user_id,
    'alert.low_stock',
    -- ISO week: one low-stock email per business per week, at most.
    business_id::text || ':' || to_char(now(), 'IYYY-"W"IW'),
    jsonb_build_object('business_name', business_name, 'items', items)
  from low
  on conflict (user_id, kind, dedupe_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ── enqueue: weekly summary ────────────────────────────────────────────────
-- Revenue, cost and profit for the last seven days, computed the same way the
-- app computes them: money is an integer in the currency's minor unit, and
-- profit is revenue minus cost of goods actually sold.
create or replace function public.enqueue_weekly_summary()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with totals as (
    select
      b.owner_id                                   as user_id,
      b.id                                         as business_id,
      b.name                                       as business_name,
      b.currency,
      coalesce(sum(s.qty * s.unit_price), 0)::bigint as revenue,
      coalesce(sum(s.qty * s.unit_cost), 0)::bigint  as cogs,
      coalesce(sum(s.qty), 0)::bigint                as units
    from public.businesses b
    join public.profiles p on p.id = b.owner_id and p.notify_alerts
    left join public.sales s
      on s.business_id = b.id
     and s.deleted_at is null
     and s.occurred_at >= now() - interval '7 days'
    where b.deleted_at is null
    group by b.owner_id, b.id, b.name, b.currency
  )
  insert into public.notification_queue (user_id, kind, dedupe_key, payload)
  select
    user_id,
    'alert.weekly_summary',
    business_id::text || ':' || to_char(now(), 'IYYY-"W"IW'),
    jsonb_build_object(
      'business_name', business_name,
      'currency',      currency,
      'revenue',       revenue,
      'cogs',          cogs,
      'profit',        revenue - cogs,
      'units',         units)
  from totals
  -- A week with no sales gets no email. Silence is the honest signal there;
  -- a cheerful "0 XAF this week" mail is the kind of thing people unsubscribe
  -- from and then miss the trial warning too.
  where units > 0
  on conflict (user_id, kind, dedupe_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ── security: new sign-in ──────────────────────────────────────────────────
-- A trigger on auth.sessions, which deserves a warning.
--
-- This fires inside the transaction that signs a user in. If it ever raised,
-- it would break authentication for everyone -- the single worst failure this
-- codebase could ship. So the whole body is wrapped: any error is swallowed and
-- sign-in proceeds. A missed notification is an acceptable loss; a user locked
-- out of their own books is not.
--
-- Supabase owns the auth schema and may alter it during an upgrade. If sign-in
-- ever misbehaves after a platform update, drop this trigger first:
--   drop trigger if exists on_auth_session_created on auth.sessions;
create or replace function public.enqueue_new_signin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.notification_queue (user_id, kind, dedupe_key, payload)
    select
      new.user_id,
      'security.new_signin',
      to_char(new.created_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      jsonb_build_object('signed_in_at', new.created_at)
    from public.profiles p
    where p.id = new.user_id
      and p.notify_security
    on conflict (user_id, kind, dedupe_key) do nothing;
  exception when others then
    -- Deliberately silent. Never block a sign-in over an email.
    null;
  end;
  return new;
end;
$$;

create trigger on_auth_session_created
  after insert on auth.sessions
  for each row execute function public.enqueue_new_signin();

-- ── privileges ─────────────────────────────────────────────────────────────
-- The enqueue functions are SECURITY DEFINER and read every user's rows, so no
-- client role may call them. Cron and the sender run as service_role.
revoke all on function public.enqueue_billing_notices()  from public, anon, authenticated;
revoke all on function public.enqueue_low_stock()        from public, anon, authenticated;
revoke all on function public.enqueue_weekly_summary()   from public, anon, authenticated;

-- ── the sender's read side ─────────────────────────────────────────────────
-- auth.users is not reachable through PostgREST, so the join to an address has
-- to happen here. SECURITY DEFINER, and revoked from every client role: this
-- returns other people's email addresses.
--
-- attempts < 5 is the poison-message guard. A row that has failed five times is
-- failing for a reason retrying will not fix -- a dead address, a malformed
-- payload -- and left alone it would be retried forever on every run.
create or replace function public.pending_notifications(p_limit integer default 100)
returns table (
  id                bigint,
  user_id           uuid,
  kind              text,
  payload           jsonb,
  email             text,
  display_name      text,
  unsubscribe_token uuid,
  attempts          integer
)
language sql
security definer
set search_path = public
as $$
  select q.id, q.user_id, q.kind, q.payload,
         u.email::text, p.display_name, p.unsubscribe_token, q.attempts
  from public.notification_queue q
  join auth.users     u on u.id = q.user_id
  join public.profiles p on p.id = q.user_id
  where q.sent_at is null
    and q.attempts < 5
    and u.email is not null
  order by q.created_at
  limit greatest(1, least(p_limit, 500));
$$;

-- ── unsubscribe ────────────────────────────────────────────────────────────
-- Reached from an inbox, where there is no session, so the token is the whole
-- credential. It grants exactly one thing: turning a category off. It cannot
-- read a profile, cannot turn anything back on, and is useless for anything
-- but this. Re-enabling happens in the app, behind a real login.
--
-- Security notifications are intentionally not unsubscribable here. "Someone
-- signed into your account" is the message a compromised user most needs, and
-- an attacker with inbox access should not be able to silence it with a click.
create or replace function public.unsubscribe_by_token(p_token uuid, p_category text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit integer;
begin
  if p_category = 'billing' then
    update public.profiles set notify_billing = false where unsubscribe_token = p_token;
  elsif p_category = 'alerts' then
    update public.profiles set notify_alerts = false where unsubscribe_token = p_token;
  elsif p_category = 'all' then
    update public.profiles set notify_billing = false, notify_alerts = false
    where unsubscribe_token = p_token;
  else
    return false;
  end if;

  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

revoke all on function public.pending_notifications(integer)      from public, anon, authenticated;
revoke all on function public.unsubscribe_by_token(uuid, text)    from public, anon;
-- anon calls this one through the Edge Function, which holds the service key.


-- ═══════════════════════════════════════════════════════════════════
-- 20260907000200_analytics.sql
-- ═══════════════════════════════════════════════════════════════════

-- Product analytics.
--
-- Beta questions this exists to answer: which screens people open, which
-- features they use and which they never touch, and what breaks.
--
-- What it deliberately does NOT hold: business content. No item names, no sale
-- amounts, no customer details, no business names. Only that an event happened,
-- and counts or durations describing it.
--
-- That boundary is a security decision before it is a privacy one. This table
-- is read by dashboards and exports, so it will end up in more places than the
-- ledger ever does. Putting a franc of anyone's revenue in here would turn a
-- convenience table into a second copy of the books, and every future breach
-- into a financial one. The client enforces the same rule with a key allowlist.

create table public.analytics_events (
  id          bigint      generated always as identity primary key,
  -- Null is impossible in practice today: only signed-in users may insert.
  -- Kept nullable so anonymous telemetry can be added later without a rewrite.
  user_id     uuid        references auth.users (id) on delete cascade,
  -- One app run. Lets "opened three screens then crashed" be reconstructed
  -- without anything identifying the person beyond the account already known.
  session_id  uuid        not null,
  event       text        not null check (length(event) between 1 and 64),
  props       jsonb       not null default '{}'::jsonb,
  app_version text        check (app_version is null or length(app_version) <= 32),
  -- When it happened on the device, which may be long before it was sent:
  -- events queue offline and flush on the next connection.
  occurred_at timestamptz not null,
  -- When the server received it. The gap between the two is itself the useful
  -- signal about how much of this audience is offline and for how long.
  created_at  timestamptz not null default now()
);

create index analytics_events_event_idx   on public.analytics_events (event, occurred_at);
create index analytics_events_user_idx    on public.analytics_events (user_id, occurred_at);
create index analytics_events_session_idx on public.analytics_events (session_id);

alter table public.analytics_events enable row level security;

-- Insert-only from the app, and only ever as yourself. A client that could
-- write another user's id could forge someone else's usage history.
create policy analytics_insert_self on public.analytics_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Users may read their own telemetry -- it is their personal data, and a
-- subject access request should be answerable without an engineer.
create policy analytics_select_own on public.analytics_events
  for select to authenticated using (user_id = auth.uid());

-- No update or delete policy: telemetry is append-only. Retention is enforced
-- by the job below rather than by anything a client can call.

-- ── size guard ─────────────────────────────────────────────────────────────
-- Without this, one loop in a client could write unbounded JSON. The cap is
-- generous for real events and small enough that abuse is obvious.
create or replace function public.analytics_props_guard()
returns trigger
language plpgsql
as $$
begin
  if pg_column_size(new.props) > 4096 then
    raise exception 'analytics props too large';
  end if;
  return new;
end;
$$;

create trigger analytics_events_props_guard
  before insert on public.analytics_events
  for each row execute function public.analytics_props_guard();

-- ── retention ──────────────────────────────────────────────────────────────
-- Ninety days. Long enough to compare this month with last, short enough that
-- "how long do you keep it?" has an answer the privacy policy can state and
-- that a regulator will accept. Data minimisation is not optional under the
-- regimes this product operates in.
create or replace function public.prune_analytics()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.analytics_events where created_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_analytics() from public, anon, authenticated;

comment on table public.analytics_events is
  'Usage telemetry only. Never business content: no item names, amounts, or customer data. Pruned after 90 days.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification — expect 8 tables, and rls_enabled = true on every one.
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
  and c.relname in ('profiles','businesses','business_members','items','sales','stock_movements','notification_queue','analytics_events')
order by c.relname;
