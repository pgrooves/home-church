#!/usr/bin/env python3
"""Pull the narration already published, so a fresh checkout narrates one guide.

WHY THIS EXISTS. `build_narration.py` skips a section when two things are both
true: its hash matches `narration/manifest.json`, and its mp3 is on disk. On
the machine the pipeline was written for, a Mac that has run it before, both
are true for everything except the week's new guide, and a weekly run costs
four minutes.

A fresh container has neither. `narration/` is git ignored, correctly, because
it is mp3s. So a session on the web starts with an empty output directory,
finds no previous anything, and speaks the entire catalogue: 54 sections and
228 minutes of audio to publish six new ones. That is not a bug in the
narrator, it is a machine that has never run it.

WHAT THIS DOES. Makes the container resemble the Mac. `guides.narration` in
Supabase already holds exactly the manifest the narrator writes, per section:
hash, path, bytes, voice, seconds. The app reads it to find the audio, and
`upload_narration.js` writes it. So it is the shared, durable copy of what has
already been spoken, on every machine at once, and nothing new has to be
invented or committed to have one.

This reads those rows, downloads the mp3s they point at, and writes
`narration/manifest.json` from them. After it, `npm run narrate` sees a
catalogue it has already spoken and only the new guide is new.

    python3 scripts/narration_sync.py
    python3 scripts/narration_sync.py --dry-run

NOT FOR THE MAC. Harmless there, and pointless: a machine with its own
`narration/` already has all of this, and re-downloading it is bandwidth spent
to arrive where you started. Skip it unless you are on a fresh checkout.

Exit codes: 0 synced, 1 no credentials or the fetch failed.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hc_supabase import load_env  # noqa: E402  same credentials, same fallbacks

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get(url, key, binary=False):
    req = urllib.request.Request(url, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
    })
    body = urllib.request.urlopen(req, timeout=60).read()
    return body if binary else json.loads(body.decode("utf-8"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default="narration")
    ap.add_argument("--dry-run", action="store_true",
                    help="say what would be fetched and write nothing")
    args = ap.parse_args()

    url, key = load_env()
    out = os.path.join(REPO, args.out)

    try:
        rows = get(url + "/rest/v1/guides?select=id,narration", key)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        sys.exit("could not read guides.narration: %s" % exc)

    manifest, fetched, skipped, missing = {}, 0, 0, 0

    for row in rows:
        gid, narration = row.get("id"), row.get("narration")
        # A guide with no narration is one nobody has spoken yet. It belongs in
        # neither the manifest nor the download list: leaving it out is what
        # makes the next run speak it.
        if not gid or not isinstance(narration, dict) or not narration:
            continue

        manifest[gid] = {}
        for sid, entry in narration.items():
            if not isinstance(entry, dict) or not entry.get("path"):
                continue
            manifest[gid][sid] = entry

            local = os.path.join(out, entry["path"])
            if os.path.exists(local) and os.path.getsize(local) == entry.get("bytes", -1):
                skipped += 1
                continue
            if args.dry_run:
                print("  would fetch   %s" % entry["path"])
                fetched += 1
                continue

            try:
                blob = get(url + "/storage/v1/object/narration/" + entry["path"],
                           key, binary=True)
            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
                # The row says there is audio and the bucket disagrees. Leaving
                # it out of the manifest is the safe answer: the next run
                # speaks that section rather than assuming a file it cannot
                # find is fine.
                print("  MISSING       %s  (%s)" % (entry["path"], exc), file=sys.stderr)
                manifest[gid].pop(sid, None)
                missing += 1
                continue

            os.makedirs(os.path.dirname(local), exist_ok=True)
            with open(local, "wb") as fh:
                fh.write(blob)
            print("  fetched       %s  %d KB" % (entry["path"], len(blob) // 1024))
            fetched += 1

        if not manifest[gid]:
            del manifest[gid]

    if args.dry_run:
        print("\n%d to fetch, %d already here, %d guides in the manifest."
              % (fetched, skipped, len(manifest)))
        print("Nothing was written.")
        return 0

    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    sections = sum(len(v) for v in manifest.values())
    print("\nmanifest      %d guides, %d sections" % (len(manifest), sections))
    print("fetched       %d, already here %d" % (fetched, skipped))
    if missing:
        print("missing       %d, left out so the next run speaks them" % missing)
    print("\nNow `npm run narrate` speaks only what is genuinely new.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
