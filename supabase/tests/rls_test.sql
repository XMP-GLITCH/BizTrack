-- RLS test suite.
--
-- RLS is the entire authorization layer for this app: there is no server-side
-- code between the client and the database. So these tests assert both halves
-- of every rule -- that the right person CAN reach their data, and that the
-- wrong person CANNOT. A policy that only ever gets tested by its author using
-- their own account will happily leak every other account.
--
-- Run: psql -d biztrack_test -f supabase/tests/rls_test.sql

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create temporary table results (seq serial, name text, passed boolean, detail text);

create or replace function t(p_name text, p_passed boolean, p_detail text default '')
returns void language plpgsql as $$
begin insert into results (name, passed, detail) values (p_name, p_passed, p_detail); end; $$;

-- Runs a query as a given user and returns the row count it can see.
create or replace function count_as(p_user uuid, p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end; $$;

-- Runs a statement as a given user; returns the SQLSTATE, or 'OK'.
create or replace function try_as(p_user uuid, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'OK';
exception when others then
  reset role;
  return sqlstate;
end; $$;

-- ── fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sabi@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ada@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'staff@example.com');

\set sabi  '''11111111-1111-1111-1111-111111111111'''
\set ada   '''22222222-2222-2222-2222-222222222222'''
\set staff '''33333333-3333-3333-3333-333333333333'''
\set sabibiz '''aaaaaaaa-0000-0000-0000-000000000001'''
\set adabiz  '''bbbbbbbb-0000-0000-0000-000000000001'''
\set sabiitem '''aaaaaaaa-0000-0000-0000-00000000a001'''

-- Sabi and Ada each set up a business, acting as themselves.
select t('sabi can create her own business',
  try_as(:sabi, format('insert into businesses (id, owner_id, name, currency) values (%L, %L, %L, %L)',
    :sabibiz, :sabi, 'Sabi Crochet', 'XAF')) = 'OK');

select t('ada can create her own business',
  try_as(:ada, format('insert into businesses (id, owner_id, name, currency) values (%L, %L, %L, %L)',
    :adabiz, :ada, 'Ada Thrift', 'NGN')) = 'OK');

select t('owner is auto-added as a member',
  (select count(*) from business_members where business_id = :sabibiz and user_id = :sabi) = 1);

select t('sabi can add an item to her business',
  try_as(:sabi, format('insert into items (id, business_id, name, unit_price) values (%L, %L, %L, 4500)',
    :sabiitem, :sabibiz, 'Bucket Hat')) = 'OK');

select t('sabi can record a sale',
  try_as(:sabi, format($q$insert into sales (id, business_id, item_id, item_name, qty, unit_price, unit_cost)
    values (gen_random_uuid(), %L, %L, 'Bucket Hat', 3, 4000, 1500)$q$, :sabibiz, :sabiitem)) = 'OK');

select t('sabi can record a stock movement',
  try_as(:sabi, format($q$insert into stock_movements (id, business_id, item_id, delta, unit_cost, reason)
    values (gen_random_uuid(), %L, %L, 20, 1500, 'initial')$q$, :sabibiz, :sabiitem)) = 'OK');

-- ── isolation: the half people forget to test ──────────────────────────────
select t('sabi sees exactly her own business',
  count_as(:sabi, 'select count(*)::int from businesses') = 1);
select t('ada sees exactly her own business',
  count_as(:ada, 'select count(*)::int from businesses') = 1);
select t('ada CANNOT see sabi''s business',
  count_as(:ada, format('select count(*)::int from businesses where id = %L', :sabibiz)) = 0);
select t('ada CANNOT see sabi''s items',
  count_as(:ada, format('select count(*)::int from items where business_id = %L', :sabibiz)) = 0);
select t('ada CANNOT see sabi''s sales',
  count_as(:ada, format('select count(*)::int from sales where business_id = %L', :sabibiz)) = 0);
select t('ada CANNOT see sabi''s stock movements',
  count_as(:ada, format('select count(*)::int from stock_movements where business_id = %L', :sabibiz)) = 0);
select t('ada CANNOT see sabi''s profile',
  count_as(:ada, format('select count(*)::int from profiles where id = %L', :sabi)) = 0);

-- ── writes into someone else's business ────────────────────────────────────
select t('ada CANNOT insert an item into sabi''s business',
  try_as(:ada, format('insert into items (id, business_id, name) values (gen_random_uuid(), %L, %L)',
    :sabibiz, 'Injected')) = '42501');

select t('ada CANNOT insert a sale into sabi''s business',
  try_as(:ada, format($q$insert into sales (id, business_id, item_name, qty, unit_price)
    values (gen_random_uuid(), %L, 'Injected', 1, 100)$q$, :sabibiz)) = '42501');

select t('ada CANNOT insert a stock movement into sabi''s business',
  try_as(:ada, format($q$insert into stock_movements (id, business_id, item_id, delta, reason)
    values (gen_random_uuid(), %L, %L, 99, 'adjustment')$q$, :sabibiz, :sabiitem)) = '42501');

-- An UPDATE that matches no visible rows is not an error; assert nothing moved.
select t('ada''s update of sabi''s item affects nothing',
  (select count(*) from items where id = :sabiitem and name = 'Bucket Hat') = 1
  and try_as(:ada, format('update items set name = %L where id = %L', 'Stolen', :sabiitem)) = 'OK'
  and (select count(*) from items where id = :sabiitem and name = 'Bucket Hat') = 1);

select t('ada''s delete of sabi''s item affects nothing',
  try_as(:ada, format('delete from items where id = %L', :sabiitem)) = 'OK'
  and (select count(*) from items where id = :sabiitem) = 1);

-- ── ownership cannot be reassigned ─────────────────────────────────────────
select t('ada CANNOT create a business owned by sabi',
  try_as(:ada, format('insert into businesses (id, owner_id, name) values (gen_random_uuid(), %L, %L)',
    :sabi, 'Impersonated')) = '42501');

select t('sabi CANNOT hand her business to ada by rewriting owner_id',
  try_as(:sabi, format('update businesses set owner_id = %L where id = %L', :ada, :sabibiz)) = '42501');

-- ── membership grants access, without policy changes ───────────────────────
select t('staff CANNOT see the business before being added',
  count_as(:staff, format('select count(*)::int from businesses where id = %L', :sabibiz)) = 0);

select t('owner can add a staff member',
  try_as(:sabi, format($q$insert into business_members (business_id, user_id, role)
    values (%L, %L, 'staff')$q$, :sabibiz, :staff)) = 'OK');

select t('staff CAN now see the business',
  count_as(:staff, format('select count(*)::int from businesses where id = %L', :sabibiz)) = 1);
select t('staff CAN now see its sales',
  count_as(:staff, format('select count(*)::int from sales where business_id = %L', :sabibiz)) = 1);
select t('staff CAN record a sale',
  try_as(:staff, format($q$insert into sales (id, business_id, item_name, qty, unit_price)
    values (gen_random_uuid(), %L, 'Staff sale', 1, 500)$q$, :sabibiz)) = 'OK');

select t('staff CANNOT add further members',
  try_as(:staff, format($q$insert into business_members (business_id, user_id, role)
    values (%L, %L, 'staff')$q$, :sabibiz, :ada)) = '42501');

select t('staff CANNOT delete the business',
  try_as(:staff, format('delete from businesses where id = %L', :sabibiz)) = 'OK'
  and (select count(*) from businesses where id = :sabibiz) = 1);

-- ── recursion check ────────────────────────────────────────────────────────
-- A policy on business_members that queries business_members loops forever.
-- This is the single most common way to break a Supabase schema.
select t('querying business_members does not recurse',
  count_as(:sabi, 'select count(*)::int from business_members') >= 1);

-- ── anonymous access ───────────────────────────────────────────────────────
select t('a request with no identity sees no businesses',
  count_as(null, 'select count(*)::int from businesses') = 0);
select t('a request with no identity sees no sales',
  count_as(null, 'select count(*)::int from sales') = 0);

-- ── constraints that protect the books ─────────────────────────────────────
select t('a sale with zero quantity is rejected',
  try_as(:sabi, format($q$insert into sales (id, business_id, item_name, qty, unit_price)
    values (gen_random_uuid(), %L, 'Bad', 0, 100)$q$, :sabibiz)) = '23514');
select t('a negative price is rejected',
  try_as(:sabi, format($q$insert into sales (id, business_id, item_name, qty, unit_price)
    values (gen_random_uuid(), %L, 'Bad', 1, -100)$q$, :sabibiz)) = '23514');
select t('a no-op stock movement is rejected',
  try_as(:sabi, format($q$insert into stock_movements (id, business_id, item_id, delta, reason)
    values (gen_random_uuid(), %L, %L, 0, 'adjustment')$q$, :sabibiz, :sabiitem)) = '23514');
select t('an unknown movement reason is rejected',
  try_as(:sabi, format($q$insert into stock_movements (id, business_id, item_id, delta, reason)
    values (gen_random_uuid(), %L, %L, 5, 'nonsense')$q$, :sabibiz, :sabiitem)) = '23514');

-- ── updated_at comes from the server, not the client ───────────────────────
select t('client-supplied updated_at is overridden by the server',
  (select count(*) from (
     select try_as(:sabi, format('update items set updated_at = %L where id = %L',
       '2001-01-01T00:00:00Z', :sabiitem))
   ) x) = 1
  and (select updated_at from items where id = :sabiitem) > '2020-01-01'::timestamptz);

-- ── report ─────────────────────────────────────────────────────────────────
\pset tuples_only off
\pset format aligned
select seq, case when passed then 'PASS' else 'FAIL' end as result, name from results order by seq;
select count(*) filter (where passed) || ' passed, ' ||
       count(*) filter (where not passed) || ' failed' as summary from results;
select case when count(*) = 0 then 'ALL RLS TESTS PASSED' else 'FAILURES PRESENT' end
from results where not passed;
