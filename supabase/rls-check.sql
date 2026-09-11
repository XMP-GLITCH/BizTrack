-- Is row-level security actually protecting this database?
--
-- Run this in the SQL Editor after any schema change. It is the single most
-- important check in this project: the anon key ships inside the public
-- JavaScript bundle, so RLS is not one layer of defence, it is the ONLY thing
-- standing between one user's books and everybody else's.
--
-- This cannot be checked from the client. An anon query against a table with
-- RLS working and an anon query against an empty table both return [] -- so
-- "it returned nothing" proves nothing at all. Only the database can answer it.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Every table. Problems sort to the top.
-- ═══════════════════════════════════════════════════════════════════════════
select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies,
  case
    when not c.relrowsecurity
      then 'DANGER - RLS OFF. Anyone holding the anon key can read this table.'
    when (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname) = 0
      then 'LOCKED - RLS on with no policies. Safe, but the app cannot read it either.'
    else 'OK'
  end                                         as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
-- False first, so anything unprotected is the first row you see.
order by c.relrowsecurity, c.relname;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Views, which are the quiet way RLS gets bypassed.
--
-- A view runs with its OWNER's privileges unless security_invoker is on. Since
-- these views are owned by postgres, and a table owner bypasses RLS, a view
-- without it would happily hand every user's stock levels to any caller --
-- while every table above still reported a cheerful OK.
--
-- item_stock must read "on".
-- ═══════════════════════════════════════════════════════════════════════════
select
  c.relname as view_name,
  coalesce(
    (select option_value
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    'NOT SET') as security_invoker,
  case
    when coalesce(
      (select option_value from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'), 'off') = 'true'
      then 'OK'
    else 'DANGER - runs as its owner and bypasses RLS on the tables beneath it.'
  end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. What each policy actually says.
--
-- Worth reading once rather than trusting the count above. A policy named
-- "select_own" that says USING (true) passes every check in query 1 and
-- protects nothing.
-- ═══════════════════════════════════════════════════════════════════════════
select
  tablename,
  policyname,
  cmd        as applies_to,
  roles,
  qual       as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. SECURITY DEFINER functions, which run as their creator.
--
-- Each one here is deliberate -- is_business_member exists because a policy on
-- business_members that queries business_members recurses forever, and the
-- enqueue jobs must read across all users to do their work. What matters is
-- that none of them is callable by a client role. EXECUTE granted to
-- authenticated or anon on any of these would hand a user everyone's data.
-- ═══════════════════════════════════════════════════════════════════════════
select
  p.proname as function_name,
  case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
       then 'callable by signed-in users' else 'not callable by clients' end as authenticated_access,
  case when has_function_privilege('anon', p.oid, 'EXECUTE')
       then 'CALLABLE BY ANON' else 'not callable by anon' end as anon_access
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;
