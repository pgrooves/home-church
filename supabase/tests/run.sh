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
#   sh supabase/tests/run.sh                                    # the lot
#   sh supabase/tests/run.sh 0016_group_rooms                   # just one
#   sh supabase/tests/run.sh 0016_group_rooms 0017_group_rooms_grants
#
# Migrations are applied in the order given and the tests run afterwards, so
# every test sees the schema as production will have it rather than as it was
# halfway through. That matters here: 0017 takes away privileges 0016 handed
# out, and testing 0016 alone is how the hole in it went unnoticed.
#
# Needs a postgres server binary on the machine, which the Supabase project
# itself does not: this never talks to the real project and cannot, by
# construction, touch anything in it.
# ===========================================================================
set -e

MIGS=${*:-"0016_group_rooms 0017_group_rooms_grants 0018_group_rooms_anon 0019_group_reports_resolve 0020_group_word_filter 0021_group_answer_index 0022_group_retention_schedule 0023_journal 0025_admin_role 0026_admin_content 0027_announcement_push 0028_announcement_pin 0029_group_room_set_guide 0030_text_overrides 0031_editable_columns 0032_reading_plan_weeks 0033_announcement_media 0035_alpha 0036_leader_mode 0037_register_device_token 0038_newsletter_intake 0039_newsletter_fetch_button 0040_announcement_events 0041_event_review 0042_event_admin_writes 0043_admin_review_push 0045_announcement_authors 0047_contact_messages 0048_group_status_note 0049_group_season_state 0050_group_status_own_function 0051_announcement_updates_order_and_undelete 0052_event_dedupe 0053_event_dedupe_guards 0054_group_join_link"}
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

for MIG in $MIGS; do
  FILE="$ROOT/supabase/migrations/$MIG.sql"
  [ -f "$FILE" ] || { echo "No such migration: $FILE"; exit 1; }
  # Twice. Every migration here promises to be safe to re-run.
  $PSQL -d hc_test -q -v ON_ERROR_STOP=1 -c 'set client_min_messages=warning' -f "$FILE"
  $PSQL -d hc_test -q -v ON_ERROR_STOP=1 -c 'set client_min_messages=warning' -f "$FILE"
done

OUT=""
for MIG in $MIGS; do
  TEST="$HERE/${MIG}_test.sql"
  [ -f "$TEST" ] || continue
  OUT="$OUT
$($PSQL -d hc_test -q -f "$TEST" 2>&1 | sed 's/^psql:[^ ]* //; s/^NOTICE:  //; s/^WARNING:  //')"
done

echo "$OUT" | grep -E '^(PASS|FAIL|ERROR)' || true

FAILED=$(echo "$OUT" | grep -cE '^(FAIL|ERROR)' || true)
TOTAL=$(echo "$OUT" | grep -cE '^PASS' || true)
echo ""
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED failed, $TOTAL passed."
  exit 1
fi
echo "$TOTAL passed."
