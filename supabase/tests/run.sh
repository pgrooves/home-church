#!/bin/sh
# ===========================================================================
# Home Church, migration tests
#
# Spins up a throwaway Postgres, builds just enough Supabase around it to be
# realistic (the auth schema, auth.uid() reading a JWT claim, the anon,
# authenticated and service_role roles), runs a migration into it, and then
# runs the migration's test file as those real roles.
#
# WHY THIS EXISTS. 0016 is the first migration in the project where the
# security model is the feature. "A closed answer does not leave the
# database" is a claim about what the API returns to a role, and the only
# honest way to check it is to be that role and ask. Reading the policy and
# nodding is not the same thing.
#
#   sh supabase/tests/run.sh                     # every test
#   sh supabase/tests/run.sh 0016_group_rooms    # just one
#
# Needs a postgres server binary on the machine, which the Supabase project
# itself does not: this never talks to the real project and cannot, by
# construction, touch anything in it.
# ===========================================================================
set -e

MIG=${1:-0016_group_rooms}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=${HC_TEST_DIR:-/var/tmp/hc-migration-tests}

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
export PATH

command -v initdb >/dev/null || {
  echo "No postgres server binaries found. On Debian or Ubuntu:"
  echo "  apt-get install -y postgresql"
  exit 1
}

# Postgres refuses to run as root, so do the work as a plain user when we are.
AS=""
if [ "$(id -u)" = "0" ]; then
  id pg >/dev/null 2>&1 || useradd -m pg
  AS="pg"
fi

if [ ! -d "$WORK/data" ]; then
  rm -rf "$WORK"; mkdir -p "$WORK"
  [ -n "$AS" ] && chown "$AS" "$WORK"
  chmod 700 "$WORK"
  if [ -n "$AS" ]; then
    su "$AS" -c "PATH=$PATH initdb -D $WORK/data -A trust -U postgres" >"$WORK/initdb.log" 2>&1
  else
    initdb -D "$WORK/data" -A trust -U postgres >"$WORK/initdb.log" 2>&1
  fi
fi

# Socket only, no TCP port open to anything.
if ! pg_isready -h "$WORK" -p 55432 -q 2>/dev/null; then
  OPTS="-k $WORK -p 55432 -c listen_addresses="
  if [ -n "$AS" ]; then
    su "$AS" -c "PATH=$PATH pg_ctl -D $WORK/data -l $WORK/pg.log -o '$OPTS' -w start" >/dev/null
  else
    pg_ctl -D "$WORK/data" -l "$WORK/pg.log" -o "$OPTS" -w start >/dev/null
  fi
fi

PSQL="psql -h $WORK -p 55432 -U postgres"

$PSQL -q -c "drop database if exists hc_test;" -c "create database hc_test;"
$PSQL -d hc_test -q -v ON_ERROR_STOP=1 -c 'set client_min_messages=warning' -f "$HERE/harness.sql"
$PSQL -d hc_test -q -v ON_ERROR_STOP=1 -c 'set client_min_messages=warning' \
      -f "$ROOT/supabase/migrations/$MIG.sql"

# Run it a second time. Every migration here promises to be safe to re-run.
$PSQL -d hc_test -q -v ON_ERROR_STOP=1 -c 'set client_min_messages=warning' \
      -f "$ROOT/supabase/migrations/$MIG.sql"

OUT=$($PSQL -d hc_test -q -f "$HERE/${MIG}_test.sql" 2>&1 \
      | sed 's/^psql:[^ ]* //; s/^NOTICE:  //; s/^WARNING:  //')

echo "$OUT" | grep -E '^(PASS|FAIL|ERROR)' || true

FAILED=$(echo "$OUT" | grep -cE '^(FAIL|ERROR)' || true)
TOTAL=$(echo "$OUT" | grep -cE '^PASS' || true)
echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED failed, $TOTAL passed."
  exit 1
fi
echo "$TOTAL passed."
