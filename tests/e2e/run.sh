#!/bin/sh
# ===========================================================================
# Home Church, the Group tab end to end
#
# Two browsers, one room, and a real database in between. This is the only
# test in the project where the app talks to something that enforces the row
# level security policies, and it exists because everything else hands the
# screen a snapshot that already contains every answer.
#
# That difference is not academic. It is how migration 0021 was found: the
# host's reveal desk was built from the notes on the phone, a shut answer
# never reaches any phone, and so the desk read "Nothing written here yet"
# in a room with four answers in it. Every unit test passed. This one did
# not.
#
# WHAT IT STANDS UP
#   postgres      the throwaway one from supabase/tests/run.sh, with every
#                 migration applied, so the schema is the shipping schema
#   postgrest     the same server Supabase runs, speaking to it as anon and
#                 authenticated through a JWT
#   a web server  serving the app from the repo, unmodified
#   chromium      two contexts, a host and a member, driven by playwright
#
# There is no GoTrue here, so the tokens are minted in the test with the same
# secret PostgREST is configured with. That is the one piece of the real
# stack this fakes, and it fakes only the signing: the claims are the claims
# Supabase issues, and auth.uid() reads them the same way.
#
#   sh tests/e2e/run.sh
#
# Needs: postgres server binaries, a postgrest binary on PATH or at
# /tmp/postgrest, node, and the chromium playwright already uses. Skips with
# a message rather than failing when any of them is missing, because this is
# not the test to block a commit on.
# ===========================================================================
set -e

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=${HC_TEST_DIR:-/var/tmp/hc-migration-tests}
PORT_APP=${HC_E2E_APP_PORT:-8899}
PORT_API=${HC_E2E_API_PORT:-3001}
SECRET="hc-e2e-secret-that-is-at-least-32-chars-long"

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
export PATH

PGRST=$(command -v postgrest || echo /tmp/postgrest)
[ -x "$PGRST" ] || { echo "SKIP  no postgrest binary. Put one on PATH or at /tmp/postgrest."; exit 0; }
command -v initdb >/dev/null || { echo "SKIP  no postgres server binaries."; exit 0; }
command -v node >/dev/null || { echo "SKIP  no node."; exit 0; }
node -e "require.resolve('playwright-core')" 2>/dev/null || {
  echo "SKIP  playwright-core is not installed. npm install."; exit 0; }

# Edit mode's screens, against the bundled seed. No database, nothing to stand
# up, so it runs first and its failures are read before anything slower.
node "$(dirname "$0")/editable-content.js" || exit 1

# The Alpha screen's own behaviour, same terms: the bundled seed, no database.
# Runs up here with the other cheap one rather than down with the stack.
node "$(dirname "$0")/alpha.js" || exit 1

# The sideways drag, and the one screen it reaches that is not a stop. Same
# terms again, the bundled seed and no database: what it needs a browser for
# is a finger, not a row in a table.
node "$(dirname "$0")/swipe.js" || exit 1

# The pull down from the top, which is the other gesture the shell owns. Same
# terms as the drag above it: the bundled seed, no database, and the fetches
# counted rather than made, because what it needs a browser for is a finger.
node "$(dirname "$0")/pull.js" || exit 1

# Search and the two discs in the top bar. Same terms again, and here for the
# same reason: what is left over once tests/search.test.js has asked
# everything that can be asked without a page is all layout and traffic.
node "$(dirname "$0")/search.js" || exit 1

# The way in. This one stands up its own GoTrue-shaped answers rather than the
# seed, because a sign-in has to have something to sign into, but it is still
# local and still needs no database, so it belongs up here with the cheap ones.
node "$(dirname "$0")/gate.js" || exit 1

# The contact form at the top of Connect. Stands up its own answers for the
# contact Edge Function, including the failure, and needs no database either.
node "$(dirname "$0")/contact.js" || exit 1

# Get notified, the second button under every event on the Cal tab. Installs a
# pretend Capacitor before the app's own scripts run, because a reminder is
# the operating system's to hold and a browser has none. Still local, still no
# database, so it belongs up here with the cheap ones.
node "$(dirname "$0")/reminders.js" || exit 1

# The database, built the same way the migration tests build it. Doing it
# through that script rather than by hand means this can never run against a
# schema the migration tests have not also seen.
echo "→ building the database"
sh "$ROOT/supabase/tests/run.sh" >/dev/null

PSQL="psql -h $WORK -p 55432 -U postgres -d hc_test -q"

echo "→ the two people, and a login role for postgrest"
$PSQL <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'hcdev';
  end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'host@e2e.test'),
  ('c0000000-0000-0000-0000-000000000002', 'member@e2e.test')
  on conflict do nothing;
insert into public.profiles (id, first_name, can_host) values
  ('c0000000-0000-0000-0000-000000000001', 'Trey',  true),
  ('c0000000-0000-0000-0000-000000000002', 'Priya', false)
  on conflict (id) do update set first_name = excluded.first_name,
                                 can_host   = excluded.can_host;

-- A clean room. The two people stay, everything they did last time goes,
-- and the terms are unagreed again because the gate is part of the run.
truncate public.group_note_reports, public.group_blocks, public.group_room_notes,
         public.group_room_questions, public.group_room_members, public.group_rooms cascade;
update public.profiles set terms_accepted_at = null where id::text like 'c0000000%';
SQL

cat > "$WORK/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:hcdev@/hc_test?host=$WORK&port=55432"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PORT_API
server-host = "127.0.0.1"
CONF

echo "→ postgrest on $PORT_API"
"$PGRST" "$WORK/pgrst.conf" > "$WORK/pgrst.log" 2>&1 &
API_PID=$!

echo "→ the app on $PORT_APP"
(cd "$ROOT" && exec python3 -m http.server "$PORT_APP" --bind 127.0.0.1 >/dev/null 2>&1) &
APP_PID=$!

cleanup() { kill $API_PID $APP_PID 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Wait for both rather than sleeping and hoping.
i=0
while [ $i -lt 40 ]; do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT_API/group_rooms" \
     && curl -sf -o /dev/null "http://127.0.0.1:$PORT_APP/index.html"; then break; fi
  i=$((i + 1)); sleep 1
done
[ $i -lt 40 ] || { echo "FAIL  the stack did not come up"; tail -20 "$WORK/pgrst.log"; exit 1; }

HC_E2E_API="http://127.0.0.1:$PORT_API" \
HC_E2E_APP="http://127.0.0.1:$PORT_APP/index.html" \
HC_E2E_SECRET="$SECRET" \
node "$HERE/group-room.js"
