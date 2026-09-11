#!/usr/bin/env bash
# Runs the schema and RLS tests against a throwaway Postgres database.
#
# These tests are the reason to trust the policies: RLS is the whole
# authorization layer, so each rule is asserted in both directions -- the owner
# CAN reach their data, and another user CANNOT.
#
# Usage:  ./supabase/tests/run.sh            (uses a local postgres)
#         PGHOST=... PGPORT=... ./supabase/tests/run.sh
set -euo pipefail

DB="${TEST_DB:-biztrack_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

echo "Recreating $DB ..."
dropdb --if-exists "$DB"
createdb "$DB"

psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done

psql -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/rls_test.sql"
