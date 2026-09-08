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
