-- Forwarding analytics to PostHog, server-side.
--
-- The events keep landing in our own table first and are forwarded from there,
-- rather than a PostHog SDK running in the app. That ordering is the whole
-- point:
--
--  * No SDK in the bundle. We just cut first load from 920 KB to 580 KB; a
--    client library would hand back ~50 KB of it for a dashboard.
--  * No cookie banner. A client SDK sets analytics identifiers, which would
--    make "we use no tracking cookies" false and put a consent dialog in front
--    of every user. Server-side forwarding sets nothing on the device.
--  * No offline data loss. A client SDK drops events when the network is gone,
--    which for this audience is most of the time. Ours queue on the device and
--    flush on reconnect, and the gap between occurred_at and created_at is
--    itself a measurement worth keeping.
--  * The raw data stays ours. PostHog becomes a view onto it, not the system
--    of record, and can be removed without losing anything.

alter table public.analytics_events
  add column forwarded_at timestamptz;

comment on column public.analytics_events.forwarded_at is
  'When this event was forwarded to PostHog. Null means pending. Set only after PostHog accepts it, so a failed batch is retried rather than lost.';

-- The forwarder's only read pattern: oldest unforwarded first.
create index analytics_events_unforwarded_idx
  on public.analytics_events (created_at)
  where forwarded_at is null;

-- Events already in the table predate forwarding. Marking them sent avoids a
-- backfill of stale rows into a brand-new PostHog project on first run, where
-- they would land with today's ingestion date and distort the first week of
-- every chart.
update public.analytics_events
set forwarded_at = now()
where forwarded_at is null;

-- ── the forwarder's read side ──────────────────────────────────────────────
-- SECURITY DEFINER because it reads every user's rows, and revoked from client
-- roles for the same reason.
create or replace function public.pending_analytics(p_limit integer default 200)
returns table (
  id          bigint,
  user_id     uuid,
  session_id  uuid,
  event       text,
  props       jsonb,
  app_version text,
  occurred_at timestamptz,
  created_at  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.user_id, e.session_id, e.event, e.props,
         e.app_version, e.occurred_at, e.created_at
  from public.analytics_events e
  where e.forwarded_at is null
  order by e.created_at
  limit greatest(1, least(p_limit, 1000));
$$;

create or replace function public.mark_analytics_forwarded(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  marked integer;
begin
  update public.analytics_events
  set forwarded_at = now()
  where id = any(p_ids) and forwarded_at is null;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke all on function public.pending_analytics(integer)        from public, anon, authenticated;
revoke all on function public.mark_analytics_forwarded(bigint[]) from public, anon, authenticated;
