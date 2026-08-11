#!/usr/bin/env python3
"""
Home Church, sign-in email setup.

Puts the six digit code back in the sign-in emails, and points the link in
them at the app instead of at http://localhost:3000. Standard library only,
same promise as scripts/hc_supabase.py next door.

    python3 scripts/hc_auth.py show     # what the project sends today
    python3 scripts/hc_auth.py apply    # make it send what supabase/auth/ says
    python3 scripts/hc_auth.py apply --dry-run

This is the only script in the repo that talks to the Management API rather
than to the project itself, because email templates and the Site URL are
project settings and do not live in the database. That means a different
credential: a personal access token from
https://supabase.com/dashboard/account/tokens, in `.env` as
SUPABASE_ACCESS_TOKEN.

It is a one time fix, not a weekly chore. If you are on a phone and cannot
run this, supabase/auth/README.md has the same changes as dashboard taps.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(REPO_ROOT, ".env")
CONFIG_JS = os.path.join(REPO_ROOT, "js", "config.js")
TEMPLATE_DIR = os.path.join(REPO_ROOT, "supabase", "auth")

API = "https://api.supabase.com/v1"

# Where the app actually lives. The link in the emails is built from this, and
# Supabase refuses to redirect anywhere that is not on the allow list, so both
# settings below are derived from this one string. Change it here if the app
# ever moves to its own domain.
APP_URL = "https://pgrooves.github.io/home-church/"

# mailer_otp_exp is 24 hours out of the box. The emails say "about an hour",
# and a code that outlives the message it arrived in is worth nobody's while.
OTP_EXPIRY_SECONDS = 3600
OTP_LENGTH = 6


def die(message):
    sys.stderr.write(message.rstrip() + "\n")
    sys.exit(1)


def read_env():
    if not os.path.exists(ENV_PATH):
        die(
            ".env not found at the repo root.\n"
            "This script needs SUPABASE_ACCESS_TOKEN in it, a personal access\n"
            "token from https://supabase.com/dashboard/account/tokens.\n\n"
            "No shell here? supabase/auth/README.md has the same changes as\n"
            "dashboard taps, which is the path that works from a phone."
        )
    env = {}
    with open(ENV_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def project_ref():
    """Read the ref out of js/config.js rather than .env, so this can only ever
    touch the project the phones are actually pointed at."""
    if not os.path.exists(CONFIG_JS):
        die("js/config.js not found, cannot tell which project to change.")
    src = open(CONFIG_JS, "r", encoding="utf-8").read()
    m = re.search(r"SUPABASE_URL\s*:\s*['\"]https://([^.'\"]+)\.supabase\.co", src)
    if not m:
        die("js/config.js has no Supabase URL in it. Fill that in first.")
    return m.group(1)


def call(method, path, token, payload=None):
    request = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:400]
        if err.code in (401, 403):
            die(
                "Supabase refused the token (%s).\n"
                "SUPABASE_ACCESS_TOKEN must be a personal access token from\n"
                "https://supabase.com/dashboard/account/tokens, not the service\n"
                "role key and not the anon key. They are different things.\n\n%s"
                % (err.code, detail)
            )
        die("Management API said %s.\n%s" % (err.code, detail))
    except urllib.error.URLError as err:
        die(
            "Could not reach api.supabase.com: %s\n"
            "A web session's proxy blocks this. Run it from a real machine, or\n"
            "follow supabase/auth/README.md in the dashboard instead." % err.reason
        )


def template(name):
    path = os.path.join(TEMPLATE_DIR, name)
    if not os.path.exists(path):
        die("Missing %s. It should be committed alongside this script." % path)
    # The leading comment block explains the file to whoever opens it next and
    # has no business being mailed to anybody.
    body = open(path, "r", encoding="utf-8").read()
    return re.sub(r"^\s*<!--.*?-->\s*", "", body, count=1, flags=re.S).strip()


def desired():
    return {
        "site_url": APP_URL,
        "uri_allow_list": ",".join([APP_URL, APP_URL + "**"]),
        "mailer_otp_length": OTP_LENGTH,
        "mailer_otp_exp": OTP_EXPIRY_SECONDS,
        "mailer_subjects_confirmation": "{{ .Token }} is your Home Church code",
        "mailer_templates_confirmation_content": template("confirm-signup.html"),
        "mailer_subjects_magic_link": "{{ .Token }} is your Home Church code",
        "mailer_templates_magic_link_content": template("magic-link.html"),
    }


def summarize(config):
    """The four things that decide whether a person can get into the app."""
    templates = [
        ("Confirm signup", config.get("mailer_templates_confirmation_content") or ""),
        ("Magic Link", config.get("mailer_templates_magic_link_content") or ""),
    ]
    print("Site URL      %s" % (config.get("site_url") or "(unset)"))
    print("Allowed back  %s" % (config.get("uri_allow_list") or "(nothing)"))
    print("Code expires  %s seconds" % config.get("mailer_otp_exp"))
    for label, body in templates:
        has_code = "{{ .Token }}" in body
        print("%-13s %s" % (label, "sends a code" if has_code else "NO CODE, link only"))


def show(token, ref):
    summarize(call("GET", "/projects/%s/config/auth" % ref, token))


def apply(token, ref, dry_run):
    current = call("GET", "/projects/%s/config/auth" % ref, token)
    payload = desired()

    changes = [k for k, v in payload.items() if current.get(k) != v]
    if not changes:
        print("Already set the way supabase/auth/ describes. Nothing to do.")
        return

    print("Changing on %s:" % ref)
    for key in changes:
        print("  %s" % key)

    if dry_run:
        print("\n--dry-run, nothing sent.")
        return

    call("PATCH", "/projects/%s/config/auth" % ref, token, payload)
    print("\nDone. Now what goes out:")
    summarize(call("GET", "/projects/%s/config/auth" % ref, token))
    print(
        "\nSend yourself a code from the app to confirm. If the email still\n"
        "arrives from 'Supabase Auth', that is the sender name, which needs\n"
        "custom SMTP, see supabase/auth/README.md. The code will be in it\n"
        "either way."
    )


def main():
    parser = argparse.ArgumentParser(
        description="Put the six digit code back in Home Church's sign-in emails."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("show", help="print what the project sends today")
    applied = sub.add_parser("apply", help="make it send what supabase/auth/ says")
    applied.add_argument("--dry-run", action="store_true", help="list changes, send nothing")

    args = parser.parse_args()
    env = read_env()
    token = env.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        die(
            "SUPABASE_ACCESS_TOKEN is not in .env.\n"
            "Make one at https://supabase.com/dashboard/account/tokens and add:\n"
            "    SUPABASE_ACCESS_TOKEN=sbp_...\n"
            ".env is git ignored, so it stays on this machine."
        )

    ref = project_ref()
    if args.command == "show":
        show(token, ref)
    else:
        apply(token, ref, args.dry_run)


if __name__ == "__main__":
    main()
