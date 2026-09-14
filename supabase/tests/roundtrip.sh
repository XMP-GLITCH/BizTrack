#!/usr/bin/env bash
# End-to-end check of the data layer against a REAL Postgres running the real
# migrations, with row-level security enforced.
#
# The unit tests prove the mappers agree with themselves. This proves they agree
# with the database: column names, column types, constraints, the RLS insert
# path, and the server-side updated_at trigger. It is the difference between
# "the code round-trips" and "the books round-trip".
#
# Usage:  PGHOST=/tmp PGPORT=5433 ./supabase/tests/roundtrip.sh
set -euo pipefail

DB="${TEST_DB:-biztrack_roundtrip}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK_DIR:-/tmp/pgtest}"
OWNER='11111111-1111-1111-1111-111111111111'

mkdir -p "$WORK"

echo "Building a business locally and flattening it to rows ..."
node --input-type=module -e "
import { migrateLegacyBusiness } from '$ROOT/src/domain/migrate.js';
import { flattenBusinesses } from '$ROOT/src/backend/mappers.js';
import { calcBizStats } from '$ROOT/src/domain/stats.js';
import { deriveInventory } from '$ROOT/src/domain/inventory.js';
import fs from 'node:fs';
const b = migrateLegacyBusiness({
  name: 'Sabi Crochet', category: 'Crochet', color: '#C17F5A', emoji: 'X',
  inventory: [
    { id:'1', name:'Bucket Hat', qty:12, cost:1500, price:4500, sold:8 },
    { id:'2', name:'Tote Bag',   qty:2,  cost:2000, price:6000, sold:2 },
  ],
  sales: [
    { id:'s1', itemName:'Bucket Hat', qty:5, askingPrice:4500, actualPrice:4500, revenue:22500, cost:7500, date:'2026-04-01' },
    { id:'s2', itemName:'Bucket Hat', qty:3, askingPrice:4500, actualPrice:4000, revenue:12000, cost:4500, date:'2026-04-08' },
    { id:'s3', itemName:'Tote Bag',   qty:2, askingPrice:6000, actualPrice:6000, revenue:12000, cost:4000, date:'2026-04-10' },
    { id:'s4', itemName:'Custom Beanie', qty:1, actualPrice:8000, revenue:8000, cost:2500, date:'2026-04-12', isCustom:true },
  ],
}, 'XAF');
fs.writeFileSync('$WORK/rows.json', JSON.stringify(flattenBusinesses([b], '$OWNER')));
fs.writeFileSync('$WORK/expected.json', JSON.stringify({
  stats: calcBizStats(b),
  inventory: deriveInventory(b).map(i => [i.name, i.qty, i.avgCost, i.sold]).sort(),
}));
"
chmod a+r "$WORK/rows.json"

echo "Recreating $DB and applying migrations ..."
dropdb --if-exists "$DB"
createdb "$DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Pushing rows as an authenticated user (RLS on) and reading them back ..."
psql -qAt -d "$DB" -v ON_ERROR_STOP=1 -v owner="$OWNER" -v work="$WORK" <<'SQL' >/dev/null
insert into auth.users (id, email) values (:'owner', 'roundtrip@example.com');
create temporary table payload as select pg_read_file(:'work' || '/rows.json')::jsonb as j;
grant select on payload to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', :'owner', false);

insert into businesses (id, owner_id, name, category, color, emoji, currency, created_at, deleted_at)
select * from jsonb_to_recordset((select j->'businesses' from payload))
  as x(id uuid, owner_id uuid, name text, category text, color text, emoji text, currency text, created_at timestamptz, deleted_at timestamptz);

insert into items (id, business_id, name, unit_price, created_at, archived_at, deleted_at)
select * from jsonb_to_recordset((select j->'items' from payload))
  as x(id uuid, business_id uuid, name text, unit_price bigint, created_at timestamptz, archived_at timestamptz, deleted_at timestamptz);

insert into sales (id, business_id, item_id, item_name, qty, unit_price, unit_cost, asking_price, note, is_custom, occurred_at, created_by, created_at, deleted_at)
select * from jsonb_to_recordset((select j->'sales' from payload))
  as x(id uuid, business_id uuid, item_id uuid, item_name text, qty int, unit_price bigint, unit_cost bigint, asking_price bigint, note text, is_custom boolean, occurred_at timestamptz, created_by uuid, created_at timestamptz, deleted_at timestamptz);

insert into stock_movements (id, business_id, item_id, delta, unit_cost, reason, sale_id, occurred_at, created_by, created_at)
select * from jsonb_to_recordset((select j->'movements' from payload))
  as x(id uuid, business_id uuid, item_id uuid, delta int, unit_cost bigint, reason text, sale_id uuid, occurred_at timestamptz, created_by uuid, created_at timestamptz);

-- Read back through RLS as the user, then hand to superuser to write out.
create temporary table pulled as select jsonb_build_object(
  'businesses', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from businesses b),
  'items',      (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from items i),
  'sales',      (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from sales s),
  'movements',  (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from stock_movements m)
) as j;
reset role;
SQL

psql -qAt -d "$DB" -v ON_ERROR_STOP=1 -c "\copy (select jsonb_build_object(
  'businesses', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from businesses b),
  'items',      (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from items i),
  'sales',      (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from sales s),
  'movements',  (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from stock_movements m))) to '$WORK/out.json'"

node --input-type=module -e "
import { assembleBusinesses } from '$ROOT/src/backend/mappers.js';
import { calcBizStats } from '$ROOT/src/domain/stats.js';
import { deriveInventory } from '$ROOT/src/domain/inventory.js';
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('$WORK/out.json','utf8'));
const expected = JSON.parse(fs.readFileSync('$WORK/expected.json','utf8'));
const [b] = assembleBusinesses(raw);
const stats = calcBizStats(b);
const inv = deriveInventory(b).map(i => [i.name, i.qty, i.avgCost, i.sold]).sort();
let fails = 0;
const ck = (n,a,e) => { const ok = JSON.stringify(a)===JSON.stringify(e);
  console.log((ok?'  PASS  ':'  FAIL  ')+n+(ok?'':'  got '+JSON.stringify(a)+' want '+JSON.stringify(e))); if(!ok) fails++; };
ck('revenue survives Postgres', stats.revenue, expected.stats.revenue);
ck('COGS survives Postgres', stats.cogs, expected.stats.cogs);
ck('profit survives Postgres', stats.profit, expected.stats.profit);
ck('units sold survives', stats.unitsSold, expected.stats.unitsSold);
ck('sale count survives', stats.salesCount, expected.stats.salesCount);
ck('stock + weighted avg cost survive', inv, expected.inventory);
ck('custom sale kept its null item link', raw.sales.filter(s=>s.is_custom).map(s=>s.item_id), [null]);
ck('server stamped updated_at on every sale', raw.sales.every(s=>!!s.updated_at), true);
console.log(fails ? '\n'+fails+' FAILED' : '\n=== ROUND TRIP THROUGH POSTGRES + RLS PASSED ===');
process.exit(fails?1:0);
"
