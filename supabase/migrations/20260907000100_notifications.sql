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
