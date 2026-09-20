-- BizTrack: why is sync refusing to push?
--
-- Paste into the Supabase SQL Editor. It runs as the service role, so it sees
-- past RLS -- which is the whole point: the client cannot tell you why it was
-- refused, because `syncOnce` reports every failure as "offline".
--
-- Symptom this answers:
--   [BizTrack] Sync deferred: businesses: new row violates row-level security
--   policy for table "businesses"   (403 on POST /businesses?on_conflict=id)
--
-- The push upserts, so an EXISTING row takes the UPDATE path, which is
-- `using (is_business_member(id))`. The same function governs SELECT, so a
-- missing membership row breaks the push AND makes the pull return nothing --
-- which is why a second device shows onboarding over an empty app.

-- ── 1. The summary. Run this first. ────────────────────────────────────────
select 'A. owner-membership trigger' as check_name,
       coalesce(string_agg(tgname, ', '), '*** MISSING -- this is the bug ***') as result
from pg_trigger
where tgrelid = 'public.businesses'::regclass and not tgisinternal

union all
select 'B. businesses with NO owner membership',
       coalesce(string_agg(b.name, ', '), 'none - all good')
from public.businesses b
where not exists (select 1 from public.business_members m
                  where m.business_id = b.id and m.user_id = b.owner_id)

union all
select 'C. businesses owned by otakufever003',
       count(*)::text
from public.businesses
where owner_id = 'c0000bb0-617a-4b2b-b525-13506d2b8d24'

union all
select 'D. memberships held by otakufever003',
       count(*)::text
from public.business_members
where user_id = 'c0000bb0-617a-4b2b-b525-13506d2b8d24'

union all
select 'E. all businesses / distinct owners',
       count(*)::text || ' rows across ' || count(distinct owner_id)::text || ' owner(s)'
from public.businesses;


-- ── 2. Has ANY client write ever succeeded? ────────────────────────────────
-- profiles and business_members are written by SECURITY DEFINER triggers, so
-- they work regardless of RLS. If those have rows and everything else is zero,
-- no authenticated client write has ever landed -- which is systemic, not
-- per-account.
select 'auth.users'        t, count(*) from auth.users
union all select 'profiles',          count(*) from public.profiles
union all select 'businesses',        count(*) from public.businesses
union all select 'business_members',  count(*) from public.business_members
union all select 'items',             count(*) from public.items
union all select 'sales',             count(*) from public.sales
union all select 'stock_movements',   count(*) from public.stock_movements;


-- ── 3. Reproduce the exact insert AS the user. Rolls back. ─────────────────
-- This is what `supabase/tests/rls_test.sql` does with try_as(), pointed at
-- the live project. If this SUCCEEDS, the policy is fine and the client's JWT
-- is not being honoured. If it FAILS, the server tells us why in plain text.
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"c0000bb0-617a-4b2b-b525-13506d2b8d24","role":"authenticated"}';

  select auth.uid() as uid_the_policy_sees, current_user as role_in_use;

  -- (a) plain insert, no RETURNING
  insert into public.businesses (id, owner_id, name, category, color, emoji, currency, created_at)
  values (gen_random_uuid(), 'c0000bb0-617a-4b2b-b525-13506d2b8d24',
          'RLS probe', 'Other', '#C17F5A', 'X', 'XAF', now());

  -- (b) the shape PostgREST actually sends: upsert + RETURNING.
  -- The SELECT policy is is_business_member(id), and the membership row is
  -- made by an AFTER INSERT trigger -- so RETURNING may be evaluated before
  -- that row exists. This is the line to watch.
  insert into public.businesses (id, owner_id, name, category, color, emoji, currency, created_at)
  values (gen_random_uuid(), 'c0000bb0-617a-4b2b-b525-13506d2b8d24',
          'RLS probe returning', 'Other', '#C17F5A', 'X', 'XAF', now())
  on conflict (id) do update set name = excluded.name
  returning id, name;
rollback;


-- ── 4. Stop assuming auth.uid() and read its real definition. ──────────────
-- Everything above assumed the textbook Supabase definition:
--   select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
-- The SQL editor test that "succeeded" only proved that definition works when
-- I set `request.jwt.claims` myself. If PostgREST populates auth context
-- differently on this project (flattened `request.jwt.claim.sub` GUCs instead
-- of / alongside the JSON blob, a customised auth.uid(), or a role the
-- `authenticator` login role was never granted), my simulation would pass
-- while the real request keeps failing -- which is exactly the discrepancy
-- observed. Read the truth rather than assume it:

select 'auth.uid() definition' as check_name, pg_get_functiondef('auth.uid()'::regprocedure) as result
union all
select 'auth.role() definition', pg_get_functiondef('auth.role()'::regprocedure)
union all
select 'roles the authenticator login can SET ROLE to',
       coalesce(string_agg(rolname, ', '), 'NONE -- this would break everything')
from pg_auth_members m join pg_roles r on r.oid = m.roleid
where m.member = 'authenticator'::regrole
union all
select 'businesses: rowsecurity / forcerowsecurity',
       (select relrowsecurity::text || ' / ' || relforcerowsecurity::text
        from pg_class where oid = 'public.businesses'::regclass)
union all
select 'is_business_member() definition', pg_get_functiondef('public.is_business_member(uuid)'::regprocedure);
