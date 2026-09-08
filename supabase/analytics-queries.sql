-- Reading the analytics.
--
-- Paste any of these into the Supabase SQL Editor. They run as the project
-- owner, which bypasses row-level security, so you see every user's telemetry
-- even though the app itself only ever lets a user read their own.
--
-- Everything here is usage only. There is no revenue, no item name and no
-- customer in this table by design, so none of these queries can answer "what
-- did they sell" -- that lives in the ledger, behind RLS, where it belongs.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Which screens do people actually open?
-- ═══════════════════════════════════════════════════════════════════════════
select
  props ->> 'screen'                     as screen,
  count(*)                               as views,
  count(distinct user_id)                as people,
  round(count(*)::numeric
        / nullif(count(distinct user_id), 0), 1) as views_per_person
from public.analytics_events
where event = 'screen.view'
  and occurred_at > now() - interval '30 days'
group by 1
order by views desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Which features get used -- AND which never do.
--
-- The left join is the point. A feature nobody touches produces no rows, so a
-- plain GROUP BY silently omits exactly the thing you wanted to find out. This
-- lists every instrumented action, including the ones sitting at zero.
-- ═══════════════════════════════════════════════════════════════════════════
with known(event, label) as (values
  ('business.add',    'Add a business'),
  ('business.delete', 'Delete a business'),
  ('item.add',        'Add an inventory item'),
  ('item.restock',    'Restock an item'),
  ('item.delete',     'Delete an item'),
  ('sale.record',     'Record a sale'),
  ('stock.oversold',  'Hit an oversold warning')
)
select
  k.label,
  k.event,
  count(e.id)                as uses,
  count(distinct e.user_id)  as people
from known k
left join public.analytics_events e
       on e.event = k.event
      and e.occurred_at > now() - interval '30 days'
group by k.label, k.event
order by uses desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. What is breaking?
--
-- Grouped by message rather than listed, because one bug produces hundreds of
-- rows and the raw list hides how few distinct problems there really are.
-- `people` matters more than `hits`: something crashing 400 times for one user
-- is a different, smaller problem than something crashing once for forty.
-- ═══════════════════════════════════════════════════════════════════════════
select
  event,
  props ->> 'message'          as message,
  count(*)                     as hits,
  count(distinct user_id)      as people,
  max(occurred_at)             as last_seen,
  (array_agg(props ->> 'stack' order by occurred_at desc))[1] as recent_stack
from public.analytics_events
where event like 'error.%'
  and occurred_at > now() - interval '30 days'
group by 1, 2
order by people desc, hits desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Are people coming back? (daily active users)
-- ═══════════════════════════════════════════════════════════════════════════
select
  date_trunc('day', occurred_at)::date as day,
  count(distinct user_id)              as people,
  count(distinct session_id)           as sessions
from public.analytics_events
where occurred_at > now() - interval '30 days'
group by 1
order by 1 desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Activation: how far does a new account actually get?
--
-- The beta question that decides whether ~130 paying users is reachable. An
-- account that never records a sale will never renew, and this shows where
-- people stop.
-- ═══════════════════════════════════════════════════════════════════════════
with per_user as (
  select
    user_id,
    min(occurred_at)                                              as first_seen,
    bool_or(event = 'business.add')                               as made_business,
    bool_or(event = 'item.add')                                   as added_item,
    bool_or(event = 'sale.record')                                as recorded_sale
  from public.analytics_events
  group by user_id
)
select
  count(*)                                    as accounts,
  count(*) filter (where made_business)        as reached_a_business,
  count(*) filter (where added_item)           as reached_an_item,
  count(*) filter (where recorded_sale)        as reached_a_sale,
  round(100.0 * count(*) filter (where recorded_sale) / nullif(count(*), 0), 1)
                                               as pct_fully_activated
from per_user;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. How offline is this audience, really?
--
-- occurred_at is when it happened on the phone; created_at is when it reached
-- us. The gap is the only hard evidence you have about how long users spend
-- disconnected -- which is the assumption the whole offline-first design rests
-- on. If this comes back near zero, that assumption deserves re-examining.
-- ═══════════════════════════════════════════════════════════════════════════
select
  count(*)                                                       as events,
  round(avg(extract(epoch from (created_at - occurred_at)))::numeric, 1) as avg_delay_seconds,
  round((percentile_cont(0.5) within group (
        order by extract(epoch from (created_at - occurred_at))))::numeric, 1) as median_delay_seconds,
  round((percentile_cont(0.95) within group (
        order by extract(epoch from (created_at - occurred_at))))::numeric, 1) as p95_delay_seconds,
  count(*) filter (where created_at - occurred_at > interval '1 hour') as sent_over_an_hour_late
from public.analytics_events
where occurred_at > now() - interval '30 days';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. How many people agreed to be measured?
--
-- Read every other number on this page in light of this one. Only people who
-- said yes appear anywhere above, so a low rate means these figures describe a
-- self-selected minority, not your users.
-- ═══════════════════════════════════════════════════════════════════════════
select
  count(*) filter (where (props ->> 'ok')::boolean)     as allowed,
  count(*) filter (where not (props ->> 'ok')::boolean) as declined
from public.analytics_events
where event = 'analytics.consent';


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. One session, start to finish.
--
-- For chasing a specific report: replace the id and read what the person did
-- in order, up to whatever went wrong.
-- ═══════════════════════════════════════════════════════════════════════════
-- select occurred_at, event, props
-- from public.analytics_events
-- where session_id = '00000000-0000-0000-0000-000000000000'
-- order by occurred_at;
