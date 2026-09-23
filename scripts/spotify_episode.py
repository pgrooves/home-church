#!/usr/bin/env python3
"""Read the latest Spotify episode, or a named one, without a key or a login.

`NEW_PODCAST_PROCESS.md` Step 1 used to say: fetch the show page, and when that
fails, ask the pastor to paste four things. The fetch fails every time in a web
session and the asking became the normal path, which is how a command that is
supposed to find the episode itself ended up asking for it every week.

It is not the network that fails. It is the page. Three routes and what each
one actually does from a session like this:

  open.spotify.com/show/<id>          loads, but the episode list is drawn by
                                      JavaScript, so the HTML holds a title and
                                      nothing else
  feeds.buzzsprout.com, buzzsprout    EGRESS_BLOCKED by the proxy, both of them,
                                      so the RSS feed is out
  open.spotify.com/embed/show/<id>    server renders the episode into a
                                      __NEXT_DATA__ blob. This is the one.

So the embed is the route, and this script is it: the show embed carries the
latest episode, the episode embed carries any episode by id. No API key, no
client secret, no developer app, same as `resolve_songs.js` and for the same
reason.

**Do not reach for WebFetch here.** It converts to markdown and hands the page
to a summarizer, which drops the JSON and returns prose. It answers "what is
the latest episode called" and loses the id, the date and the length, which are
the fields worth having. Read the bytes and parse them.

What comes back: title, episode_url, published_on, duration, id.

What does not: the episode notes. They live on Buzzsprout, which is blocked,
and Spotify's embed payload has no description field at all. That is the one
thing still worth asking for, and `summary` stays as it is until somebody
pastes them. Four fields found beats four fields asked for.

    python3 scripts/spotify_episode.py
    python3 scripts/spotify_episode.py --episode 1qauWwHicbapUZMSbXOAJJ
    python3 scripts/spotify_episode.py --show 7iJGZvY5MVm7CjPggvvPOa

Exit codes: 0 found it, 1 could not reach or could not parse.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"


def show_id_from_repo():
    """The show is named once, in js/data.js. Read it rather than hard coding."""
    try:
        with open(os.path.join(REPO, "js", "data.js"), encoding="utf-8") as fh:
            m = re.search(r"open\.spotify\.com/show/([A-Za-z0-9]{22})", fh.read())
            return m.group(1) if m else None
    except OSError:
        return None


def fetch_entity(kind, spotify_id):
    """Pull one embed page and return its entity object."""
    url = "https://open.spotify.com/embed/%s/%s" % (kind, spotify_id)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        body = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        raise SystemExit("could not reach %s: %s" % (url, exc))

    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', body, re.S)
    if not m:
        raise SystemExit(
            "no __NEXT_DATA__ in %s. Spotify changed the embed page, so this "
            "script needs a look rather than a retry." % url
        )
    try:
        return json.loads(m.group(1))["props"]["pageProps"]["state"]["data"]["entity"]
    except (ValueError, KeyError) as exc:
        raise SystemExit("could not read the episode out of %s: %s" % (url, exc))


def as_row(entity):
    """The entity, in the shape the `podcasts` columns want."""
    uri = entity.get("uri") or ""
    episode_id = entity.get("id") or uri.rsplit(":", 1)[-1]
    if entity.get("type") not in (None, "episode") or not episode_id:
        raise SystemExit("that embed is not an episode: %r" % (entity.get("type"),))

    iso = (entity.get("releaseDate") or {}).get("isoString") or ""
    ms = entity.get("duration")

    return {
        "id": episode_id,
        "title": entity.get("name") or entity.get("title"),
        "episode_url": "https://open.spotify.com/episode/%s" % episode_id,
        # The day it posted, which is podcasts.published_on. Not the Sunday.
        "published_on": iso[:10] or None,
        # Whole minutes, nearest, matching every other row in the table.
        "duration": ("%d min" % int(ms / 60000.0 + 0.5)) if ms else None,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--show", help="show id; defaults to the one in js/data.js")
    ap.add_argument("--episode", help="episode id or URL, instead of the latest")
    args = ap.parse_args()

    if args.episode:
        ep = args.episode.rstrip("/").rsplit("/", 1)[-1].split("?")[0]
        row = as_row(fetch_entity("episode", ep))
    else:
        show = args.show or show_id_from_repo()
        if not show:
            raise SystemExit("no show id given and none found in js/data.js")
        row = as_row(fetch_entity("show", show))

    json.dump(row, sys.stdout, indent=2)
    sys.stdout.write("\n")

    missing = [k for k, v in row.items() if not v]
    if missing:
        sys.stderr.write("! nothing came back for: %s\n" % ", ".join(missing))
    sys.stderr.write(
        "! no episode notes here, the embed payload has no description. "
        "Leave `summary` alone unless somebody pastes them.\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
