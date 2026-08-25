#!/usr/bin/env python3
"""
Home Church, Supabase content CLI.

One script, standard library only. No pip install, no node_modules, nothing
to keep up to date. That is deliberate, it matches the promise in README.md
that this repo has no build step, and it means this still runs in three years
on whatever Python is on the machine.

Every slash command in `.claude/commands/` shells out to this. Nothing else
in the app talks to Supabase with the service role key.

    python3 scripts/hc_supabase.py check
    python3 scripts/hc_supabase.py verify
    python3 scripts/hc_supabase.py apply supabase/migrations/0001_content_cms.sql
    python3 scripts/hc_supabase.py select guides --limit 5
    python3 scripts/hc_supabase.py select events --ilike title=baptism
    python3 scripts/hc_supabase.py upsert guides guide.json
    python3 scripts/hc_supabase.py update events event-baptism patch.json
    python3 scripts/hc_supabase.py host someone@example.com on

Credentials come from `.env` at the repo root, which is git ignored. They are
never printed, never logged, and never written to another file. If you find
yourself about to pass a key on the command line, stop, that is what .env is
for and shell history is forever.
"""

import argparse
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zoneinfo

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(REPO_ROOT, ".env")
CONFIG_JS = os.path.join(REPO_ROOT, "js", "config.js")

# The tables this CMS ships with. Adding another content type means adding
# its name here and a probe row below, and that is all that changes.
CONTENT_TABLES = ["series", "guides", "podcasts", "events", "announcements",
                  "reading_plans", "worship_sets", "groups", "serve_teams",
                  "next_steps", "church_profile", "podcast_show"]

# What `verify` tries to insert as an anonymous user, per table. These have to
# be valid rows, or PostgREST rejects them for the wrong reason: a payload
# naming a column that does not exist comes back 400 before the database ever
# checks permissions, and a 400 would read as "blocked" while proving nothing
# about row level security. A well formed row can only fail on permissions,
# which is what makes 401 or 403 here meaningful.
PROBE_ROWS = {
    "series": {"title": "probe"},
    "guides": {},
    "podcasts": {"title": "probe"},
    "events": {"title": "probe", "starts_at": "2000-01-01T00:00:00+00:00"},
    "announcements": {"title": "probe"},
    # total_weeks is not null, and current_week defaults to 1 which the range
    # constraint needs to fall inside, so 1 is the only safe width here.
    "reading_plans": {"title": "probe", "total_weeks": 1},
    # served_on is not null and sermon_id is a real foreign key, so the probe
    # leaves it out rather than naming a sermon that may not exist: a rejected
    # foreign key would be a 409 before permissions are ever consulted, which
    # is the same wrong-reason failure the note above is about.
    "worship_sets": {"served_on": "2000-01-01"},
    "groups": {"name": "probe"},
    "serve_teams": {"name": "probe"},
    "next_steps": {"title": "probe"},
    "church_profile": {"name": "probe"},
    "podcast_show": {"name": "probe"},
}


# --------------------------------------------------------------------------
# Credentials
# --------------------------------------------------------------------------

def load_env():
    """Read .env into a dict. Deliberately tiny, no dependency on python-dotenv."""
    if not os.path.exists(ENV_PATH):
        die(
            ".env not found at the repo root.\n"
            "Copy .env.example to .env and fill in SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY.\n"
            ".env is git ignored, so it stays on this machine."
        )

    env = {}
    with open(ENV_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            env[key.strip()] = value

    url = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not url or not key:
        die("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.")
    if not url.startswith("https://"):
        die("SUPABASE_URL should start with https://")

    return url, key


def project_ref(url):
    """`https://abcd1234.supabase.co` -> `abcd1234`. This is how you tell two
    similarly named projects apart, the ref is unique and the display name is
    not."""
    host = urllib.parse.urlparse(url).netloc
    return host.split(".")[0] if host else "unknown"


def app_config():
    """The URL and anon key the shipped app is pointed at, read out of
    js/config.js. Used to prove .env and the app agree, and to test public
    readability the way a phone would actually see it."""
    if not os.path.exists(CONFIG_JS):
        return None, None
    src = open(CONFIG_JS, "r", encoding="utf-8").read()

    def grab(name):
        m = re.search(name + r"\s*:\s*['\"]([^'\"]*)['\"]", src)
        return m.group(1) if m else None

    return (grab("SUPABASE_URL") or "").rstrip("/") or None, grab("SUPABASE_ANON_KEY")


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

def request(method, url, key, path="", body=None, headers=None, query=None):
    """One thin wrapper over urllib. Returns (status, parsed_body)."""
    full = url + path
    if query:
        full += "?" + urllib.parse.urlencode(query, safe="*.,()")

    hdrs = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    }
    if headers:
        hdrs.update(headers)

    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(full, data=data, headers=hdrs, method=method)

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", "replace")
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"message": raw[:500]}
    except urllib.error.URLError as err:
        die(
            "Could not reach %s\n  %s\n\n"
            "If you are running this inside a Claude Code web session, that is "
            "expected, the egress proxy blocks supabase.co. Run this command on "
            "your own machine instead." % (url, err.reason)
        )


def die(message):
    sys.stderr.write("\n" + message.rstrip() + "\n\n")
    sys.exit(1)


def load_json_arg(value):
    """Accepts a path to a .json file, a literal JSON string, or `-` for stdin.
    The slash commands normally write a temp file and pass its path."""
    if value == "-":
        return json.loads(sys.stdin.read())
    if os.path.exists(value):
        with open(value, "r", encoding="utf-8") as fh:
            return json.load(fh)
    try:
        return json.loads(value)
    except ValueError:
        die("Could not read JSON from %r. Pass a file path, a JSON string, or - for stdin." % value)


# --------------------------------------------------------------------------
# check: which project am I pointed at, and what is in it
# --------------------------------------------------------------------------

def list_tables(url, key):
    """PostgREST publishes an OpenAPI document at the REST root that names
    every table it can see. That is the cheapest way to ask 'what exists'
    without a SQL connection."""
    status, body = request("GET", url, key, "/rest/v1/")
    if status != 200 or not isinstance(body, dict):
        return None
    # PostgREST 9/10 use `definitions`, 12+ use `components.schemas`.
    if "definitions" in body:
        return sorted(body["definitions"].keys())
    schemas = body.get("components", {}).get("schemas", {})
    return sorted(schemas.keys()) if schemas else []


def cmd_check(args):
    url, key = load_env()
    ref = project_ref(url)
    cfg_url, cfg_anon = app_config()

    print("")
    print("  .env is pointed at project ref   %s" % ref)
    if cfg_url:
        print("  js/config.js is pointed at       %s" % project_ref(cfg_url))
        if cfg_url.rstrip("/") == url:
            print("  These match. This is the project the app already reads.")
        else:
            print("")
            print("  MISMATCH. The app reads one project and .env writes to another.")
            print("  Publishing into the .env project would put content somewhere")
            print("  the app never looks. Fix one of the two before publishing.")
    print("")

    tables = list_tables(url, key)
    if tables is None:
        die("Connected, but could not read the PostgREST schema. Check that the "
            "key in .env is the service_role key and not the anon key.")

    print("  Tables visible in this project:")
    if tables:
        for name in tables:
            mark = "content" if name in CONTENT_TABLES else ""
            print("    %-28s %s" % (name, mark))
    else:
        print("    (none yet)")
    print("")

    missing = [t for t in CONTENT_TABLES if t not in tables]
    if missing:
        print("  Content tables still missing: %s" % ", ".join(missing))
        print("  Run supabase/migrations/0001_content_cms.sql in the SQL editor.")
    else:
        print("  All %d content tables are present." % len(CONTENT_TABLES))
    print("")
    return 0


# --------------------------------------------------------------------------
# verify: prove the tables and the security rules actually work
# --------------------------------------------------------------------------

def cmd_verify(args):
    url, key = load_env()
    cfg_url, anon_key = app_config()
    failures = []

    print("")
    print("  Project %s" % project_ref(url))
    print("")
    print("  Table       exists   rows   public read   anon write blocked")
    print("  " + "-" * 62)

    for table in CONTENT_TABLES:
        # Exists, and how many rows, asked with the service role key.
        status, body = request(
            "GET", url, key, "/rest/v1/" + table,
            headers={"Prefer": "count=exact", "Range": "0-0"},
            query={"select": "id"},
        )
        exists = status in (200, 206)
        count = len(body) if isinstance(body, list) else 0
        if not exists:
            failures.append("%s does not exist (%s)" % (table, status))
            print("  %-11s %-8s %-6s %-13s %s" % (table, "NO", "-", "-", "-"))
            continue

        # Public read, asked the way a phone asks it, with the anon key.
        public_ok = "skipped"
        if anon_key and cfg_url:
            pstatus, _ = request("GET", cfg_url, anon_key, "/rest/v1/" + table,
                                 query={"select": "id", "limit": "1"})
            public_ok = "yes" if pstatus in (200, 206) else "NO (%s)" % pstatus
            if pstatus not in (200, 206):
                failures.append("%s is not publicly readable with the anon key" % table)

        # Anon write, which must be refused. A 401 or 403 here is the pass.
        write_blocked = "skipped"
        if anon_key and cfg_url:
            probe = dict(PROBE_ROWS.get(table, {}))
            probe["id"] = "__hc_rls_probe__"
            wstatus, wbody = request("POST", cfg_url, anon_key, "/rest/v1/" + table, body=probe)
            if wstatus in (401, 403):
                write_blocked = "yes"
            elif wstatus in (200, 201):
                write_blocked = "NO (%s)" % wstatus
                failures.append(
                    "%s accepted an anonymous write (%s). Row level security is "
                    "not doing its job, and a probe row was just created. Delete "
                    "id __hc_rls_probe__." % (table, wstatus)
                )
            else:
                # Refused, but not on permissions. The write did not land, so
                # nothing is open, but this did not prove RLS either.
                write_blocked = "unproven (%s)" % wstatus
                failures.append(
                    "%s refused the probe with %s rather than 401 or 403, so the "
                    "write is blocked but row level security is unproven here. "
                    "Response: %s" % (table, wstatus, json.dumps(wbody))
                )

        print("  %-11s %-8s %-6s %-13s %s" % (table, "yes", count, public_ok, write_blocked))

    print("")
    if failures:
        print("  Problems found:")
        for f in failures:
            print("    - %s" % f)
        print("")
        return 1

    print("  All %d tables exist, read publicly, and refuse anonymous writes."
          % len(CONTENT_TABLES))
    print("")
    return 0


# --------------------------------------------------------------------------
# apply: run a migration file
# --------------------------------------------------------------------------

def cmd_apply(args):
    url, key = load_env()
    with open(args.file, "r", encoding="utf-8") as fh:
        sql = fh.read()

    status, body = request("POST", url, key, "/rest/v1/rpc/hc_exec_sql", body={"query": sql})

    if status in (200, 201, 204):
        print("Applied %s" % args.file)
        return 0

    if status == 404:
        die(
            "This project does not have the optional hc_exec_sql function, so a\n"
            "migration cannot be run over the API. That is the default and it is\n"
            "the recommended setup.\n\n"
            "Run it by hand instead, it takes fifteen seconds:\n"
            "  1. Supabase dashboard -> SQL Editor -> New query\n"
            "  2. Paste all of %s\n"
            "  3. Run\n"
            "  4. python3 scripts/hc_supabase.py verify\n\n"
            "If you would rather automate this, read the header of\n"
            "supabase/migrations/0002_optional_migration_runner.sql first, it\n"
            "explains what the service role key can do afterward." % args.file
        )

    die("Migration failed (%s):\n%s" % (status, json.dumps(body, indent=2)))


# --------------------------------------------------------------------------
# select / upsert / update: the day to day content operations
# --------------------------------------------------------------------------

def cmd_select(args):
    url, key = load_env()
    query = {"select": args.columns, "limit": str(args.limit)}

    # PostgREST filter syntax: ?col=eq.value, ?col=ilike.*text*
    for pair in args.eq or []:
        col, _, val = pair.partition("=")
        query[col] = "eq." + val
    for pair in args.ilike or []:
        col, _, val = pair.partition("=")
        query[col] = "ilike.*%s*" % val
    if args.order:
        query["order"] = args.order

    status, body = request("GET", url, key, "/rest/v1/" + args.table, query=query)
    if status not in (200, 206):
        die("Select failed (%s):\n%s" % (status, json.dumps(body, indent=2)))

    print(json.dumps(body, indent=2, ensure_ascii=False))
    return 0


def cmd_upsert(args):
    """Insert, or overwrite the row that already has this id.

    Used by /new-guide, /new-event, and /new-podcast. Upsert rather than
    insert so re-publishing a guide after a correction is the same command as
    publishing it the first time, and so a half finished publish can simply be
    run again."""
    url, key = load_env()
    payload = load_json_arg(args.payload)
    rows = payload if isinstance(payload, list) else [payload]

    for row in rows:
        if not row.get("id"):
            die("Every row needs an `id`. Ids are permanent slugs, see "
                "supabase/README.md.")

    status, body = request(
        "POST", url, key, "/rest/v1/" + args.table,
        body=rows,
        headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    if status not in (200, 201):
        die("Upsert into %s failed (%s):\n%s" % (args.table, status, json.dumps(body, indent=2)))

    for row in body or []:
        print("published  %s  %s" % (args.table, row.get("id")))
    return 0


def cmd_update(args):
    """Patch named columns on one row, leaving everything else alone. This is
    what /edit-content uses, because a typo fix should never rewrite a whole
    guide and risk clobbering a field nobody looked at."""
    url, key = load_env()
    patch = load_json_arg(args.patch)
    if not isinstance(patch, dict) or not patch:
        die("The patch must be a JSON object of the columns to change.")

    status, body = request(
        "PATCH", url, key, "/rest/v1/" + args.table,
        body=patch,
        headers={"Prefer": "return=representation"},
        query={"id": "eq." + args.id},
    )
    if status not in (200, 204):
        die("Update failed (%s):\n%s" % (status, json.dumps(body, indent=2)))
    if not body:
        die("No row in %s has id %r. Nothing was changed." % (args.table, args.id))

    print("updated  %s  %s  (%s)" % (args.table, args.id, ", ".join(patch.keys())))
    return 0


# --------------------------------------------------------------------------
# when: church local time -> the UTC string events wants
# --------------------------------------------------------------------------

CHURCH_TZ = "America/Chicago"


def cmd_host(args):
    """Grant or take away can_host, by email rather than by uuid.

    can_host is deliberately not self service, see migration 0016: it lets
    somebody open and close a group room, take down anything anybody wrote in
    it, and edit the questions the whole group sees. The church sets it. This
    is the one step that does, so the person running the account does not
    have to find a uuid or write SQL to do it.

    auth.users is not a public schema table, so it is not reachable through
    the ordinary /rest/v1 select this script otherwise uses. The email lookup
    goes through GoTrue's admin endpoint instead, which is what the service
    role key is for."""
    url, key = load_env()
    email = args.email.strip().lower()
    turn_on = args.state == "on"

    # GoTrue's admin listing takes `filter`, a fuzzy substring search, not an
    # equality filter, so a request for "trey@x.com" can come back with other
    # addresses that merely contain that text. Matched exactly, case
    # insensitively, against what came back, rather than trusted as is.
    status, body = request(
        "GET", url, key, "/auth/v1/admin/users",
        query={"filter": email},
    )
    if status != 200:
        die("Could not look that email up (%s):\n%s" % (status, json.dumps(body, indent=2)))

    candidates = (body or {}).get("users", []) if isinstance(body, dict) else []
    users = [u for u in candidates if (u.get("email") or "").strip().lower() == email]
    if not users:
        die("No account signed in yet with %s.\n\n"
            "can_host is set on the profile row a sign-in creates, so the "
            "person has to open the app and sign in once, with this exact "
            "email, before you can grant it." % email)
    if len(users) > 1:
        die("More than one account matches %s exactly. Not touching anything." % email)

    uid = users[0]["id"]

    status, profile = request(
        "GET", url, key, "/rest/v1/profiles",
        query={"id": "eq." + uid, "select": "first_name,can_host"},
    )
    if status != 200 or not profile:
        die("Signed in, but no profile row yet for %s. It is created on first "
            "sign-in; ask them to open the app once and try again." % email)

    name = (profile[0].get("first_name") or "").strip() or "(no name set)"
    was = profile[0].get("can_host")

    status, updated = request(
        "PATCH", url, key, "/rest/v1/profiles",
        body={"can_host": turn_on},
        headers={"Prefer": "return=representation"},
        query={"id": "eq." + uid},
    )
    if status not in (200, 204) or not updated:
        die("Update failed (%s):\n%s" % (status, json.dumps(updated, indent=2)))

    verb = "can now host group rooms" if turn_on else "can no longer host group rooms"
    print("%s (%s) %s.%s" % (
        name, email, verb,
        "" if was == turn_on else "  (was %s)" % ("on" if was else "off"),
    ))
    return 0


def cmd_when(args):
    """`events.starts_at` is timestamptz, so it is stored in UTC. The church is
    in New Orleans, which is UTC-5 in summer and UTC-6 in winter, and that is
    exactly the kind of thing that gets hand converted wrong once a year and
    puts a Christmas Eve service on the wrong day.

        python3 scripts/hc_supabase.py when 2026-08-20 19:00
        -> 2026-08-21T00:00:00+00:00

    Ask this, do not do the arithmetic in your head."""
    try:
        hour, minute = (args.time.split(":") + ["0"])[:2]
        naive = datetime.datetime.strptime(args.date, "%Y-%m-%d").replace(
            hour=int(hour), minute=int(minute)
        )
    except ValueError:
        die("Expected a date as YYYY-MM-DD and a time as HH:MM on a 24 hour clock.")

    local = naive.replace(tzinfo=zoneinfo.ZoneInfo(args.tz))
    print(local.astimezone(datetime.timezone.utc).isoformat())
    return 0


# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="hc_supabase.py",
        description="Home Church content CLI. Credentials come from .env, never the command line.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="which project .env points at, and what is in it")
    sub.add_parser("verify", help="prove the tables exist and the security rules hold")

    p_apply = sub.add_parser("apply", help="run a migration file (needs the optional runner)")
    p_apply.add_argument("file")

    p_select = sub.add_parser("select", help="read rows")
    p_select.add_argument("table")
    p_select.add_argument("--columns", default="*")
    p_select.add_argument("--eq", action="append", metavar="col=value")
    p_select.add_argument("--ilike", action="append", metavar="col=text", help="case insensitive contains")
    p_select.add_argument("--order", metavar="col.desc")
    p_select.add_argument("--limit", type=int, default=20)

    p_upsert = sub.add_parser("upsert", help="insert or overwrite rows by id")
    p_upsert.add_argument("table")
    p_upsert.add_argument("payload", help="path to a .json file, a JSON string, or -")

    p_update = sub.add_parser("update", help="patch named columns on one row")
    p_update.add_argument("table")
    p_update.add_argument("id")
    p_update.add_argument("patch", help="path to a .json file, a JSON string, or -")

    p_host = sub.add_parser("host", help="let somebody host a group room, or take that away")
    p_host.add_argument("email")
    p_host.add_argument("state", choices=["on", "off"])

    p_when = sub.add_parser("when", help="church local time -> the UTC value events wants")
    p_when.add_argument("date", help="YYYY-MM-DD")
    p_when.add_argument("time", help="HH:MM on a 24 hour clock")
    p_when.add_argument("--tz", default=CHURCH_TZ)

    args = parser.parse_args()
    handlers = {
        "check": cmd_check, "verify": cmd_verify, "apply": cmd_apply,
        "select": cmd_select, "upsert": cmd_upsert, "update": cmd_update,
        "host": cmd_host, "when": cmd_when,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
