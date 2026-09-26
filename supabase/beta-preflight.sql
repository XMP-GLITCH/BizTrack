-- Before the domain moves, and before the beta opens.
--
-- Paste into the Supabase SQL Editor. Nothing here writes.
--
-- WHY THIS EXISTS
--
-- `biztrack.store`, `www.biztrack.store` and `biz-track-nine.vercel.app` are
-- three domains on ONE Vercel project. Same build, same code. What differs is
-- the ORIGIN, and localStorage is per-origin.
--
-- So removing `biz-track-nine.vercel.app` does not retire an old app. It
-- destroys the only access path to whatever still sits in localStorage at that
-- origin: there would be no app there to run "Save My Data to a File" from, so
-- anything unsynced is gone by every route at once. That is the failure that
-- produced the whole v1.5.3 to v1.5.7 rescue history, and it is worth one
-- query to avoid repeating it.
--
-- HAVING AN ACCOUNT IS NOT THE SAME AS HAVING SYNCED. A device that has been
-- offline, or signed in but not yet pushed, still holds the only copy of
-- everything recorded since. Query 1 is what tells the two apart.

-- ── 1. does every account actually have books on the SERVER? ────────────────
-- A row with businesses = 0 means that person's records are still only on
-- their phone. Do not move the domain while that is true.
--
-- Then ask each of them roughly how many sales they have recorded. A count
-- that is short by a week means a push never completed, which this query
-- cannot see on its own.
select
  p.id,
  p.display_name,
  p.plan,
  p.created_at,
  (select count(*) from public.businesses b
     where b.owner_id = p.id and b.deleted_at is null)          as businesses,
  (select count(*) from public.items i
     join public.businesses b on b.id = i.business_id
    where b.owner_id = p.id and i.deleted_at is null)           as items,
  (select count(*) from public.sales s
     join public.businesses b on b.id = s.business_id
    where b.owner_id = p.id and s.deleted_at is null)           as sales,
  (select max(s.updated_at) from public.sales s
     join public.businesses b on b.id = s.business_id
    where b.owner_id = p.id)                                    as last_sale_synced
from public.profiles p
order by p.created_at;

-- ── 2. the beta cohort, and how full it is ──────────────────────────────────
-- Safe to run before the cohort column exists: it counts by signup date, which
-- `profiles.created_at` has carried since the first migration. That is the
-- backstop for identifying the cohort even if nothing else is ever added.
select
  count(*)                                              as accounts_total,
  count(*) filter (where plan = 'trialing')             as trialing,
  count(*) filter (where plan = 'active')               as active,
  count(*) filter (where plan = 'expired')              as expired,
  min(created_at)                                       as first_signup,
  max(created_at)                                       as latest_signup
from public.profiles;

-- ── 3. who is about to go read-only ─────────────────────────────────────────
-- The client gate reads exactly these columns through `evaluatePlan`. A beta
-- user should NOT appear here: the beta state is plan = 'active' with a null
-- `plan_expires_at`, which `evaluatePlan` treats as writable with no expiry.
-- Anyone in this list during the beta was stamped wrong at signup.
select
  p.id,
  p.display_name,
  p.plan,
  p.trial_ends_at,
  p.plan_expires_at,
  case
    when p.plan = 'active'   and p.plan_expires_at is null then 'writable, no expiry'
    when p.plan = 'active'   and p.plan_expires_at > now() then 'writable until ' || p.plan_expires_at
    when p.plan = 'trialing' and p.trial_ends_at   > now() then 'trial, ' ||
      ceil(extract(epoch from (p.trial_ends_at - now())) / 86400)::text || ' days left'
    else 'READ-ONLY'
  end as client_sees
from public.profiles p
order by p.plan, p.trial_ends_at;

-- ── 4. the cohort and the waitlist ──────────────────────────────────────────
-- Needs 20260919000100_beta_cohort.sql applied; before that it errors, which
-- is itself the answer.
--
-- `beta` counts ONLY accounts stamped during the beta. The two accounts that
-- predate it have a null cohort and are deliberately not in the fifty.
select
  count(*) filter (where cohort = 'beta')                as beta_places_taken,
  (select beta_limit from public.app_settings where id)  as beta_limit,
  (select beta_open  from public.app_settings where id)  as beta_open,
  count(*) filter (where cohort is null)                 as predates_the_beta,
  (select count(*) from public.waitlist)                 as waiting
from public.profiles;

-- ── 5. what the sign-up screen is being told ────────────────────────────────
-- The same call the client makes. If this disagrees with query 4, the client
-- and the database are reading different things.
select public.beta_status();

-- ── 6. the waitlist itself ──────────────────────────────────────────────────
-- There is no select policy on this table, so it is readable only through the
-- service role, which is what the SQL editor uses. That is the design.
select email, source, created_at
from public.waitlist
order by created_at desc
limit 100;
