#!/usr/bin/env python3
"""
Home Church, where each paragraph starts in a recording that is already made.

WHAT IT IS FOR. Tapping a paragraph of a guide section while that section is
playing jumps the recording to that paragraph (js/narration.js). To do that
the app needs to know when each paragraph starts, the "marks" on a section's
guides.narration entry. scripts/build_narration.py writes them for everything
it speaks from now on. This finds them in the recordings it spoke before it
knew how, without speaking anything again.

HOW. build_narration.py speaks a section as sentence groups and puts exactly
0.35s of zeros after each one. A sentence group never runs across a paragraph,
so every paragraph starts right after one of those runs of zeros. Kokoro also
pauses between sentences, and some of those are as long, so silence alone is
not enough: this predicts where each group boundary should fall from how many
characters each group has, and picks the runs of near digital silence that
fit those predictions best, in order (a small dynamic program). Then each
paragraph's mark is the end of the silence before its first group.

ONLY WHERE THE WORDS STILL MATCH. A section whose text was edited after it
was recorded has a hash that no longer matches the live row, and its
paragraphs may not be the ones in the audio. Those are skipped and the app
estimates for them instead.

  node scripts/narration_text.js --out narration-text.json
  python3 scripts/narration_marks.py --text narration-text.json --out marks.json

Reads the live guides.narration and the public mp3s, writes a JSON file, and
changes nothing anywhere. Needs numpy and ffmpeg.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

# The same chunking build_narration.py does, kept in step by hand. If one
# changes, change both, or every mark found here is for the wrong boundary.
CHUNK_CHARS = 380

# Analysis rate and window. 8kHz is plenty to find silence, and 10ms windows
# put a mark within a hundredth of a second of where it belongs.
RATE = 8000
WIN = 80

# What counts as the inserted gap: a run this long of windows this quiet. The
# gap is 0.35s of zeros, which mp3 smears a little at each end.
QUIET = 1.0
MIN_RUN = 0.2


def groups(text, limit=CHUNK_CHARS):
    """build_narration.sentences(), returning each group's paragraph too."""
    parts, buf = [], ""
    for pi, line in enumerate(text.split("\n\n")):
        for s in re.split(r"(?<=[.!?])\s+", line.strip()):
            if not s:
                continue
            if len(buf) + len(s) + 1 < limit:
                buf = (buf + " " + s).strip()
            else:
                if buf:
                    parts.append((buf, pi))
                buf = s
        if buf:
            parts.append((buf, pi))
            buf = ""
    return parts


def config():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "..", "js", "config.js")) as fh:
        src = fh.read()
    url = re.search(r"SUPABASE_URL:\s*'([^']*)'", src).group(1)
    key = re.search(r"SUPABASE_ANON_KEY:\s*'([^']*)'", src).group(1)
    return url, key


def fetch(url, key=None):
    req = urllib.request.Request(url)
    if key:
        req.add_header("apikey", key)
        req.add_header("Authorization", "Bearer " + key)
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def silences(mp3):
    import numpy as np
    pcm = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", mp3, "-f", "s16le",
         "-ac", "1", "-ar", str(RATE), "-"],
        capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    n = len(x) // WIN
    energy = np.sqrt((x[:n * WIN].reshape(n, WIN) ** 2).mean(1))
    quiet = energy < QUIET
    step = WIN / RATE
    runs, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * step >= MIN_RUN:
                runs.append((i * step, j * step))
            i = j
        else:
            i += 1
    return runs, n * step


def align(lengths, runs, total):
    """Pick len(lengths) - 1 runs, in order, that best fit the boundaries.

    The cost of each group is how far its spoken length is from its share of
    the recording by characters. Returns the chosen runs, or None when there
    are not enough to choose from."""
    need = len(lengths) - 1
    if need == 0:
        return [], 0.0
    if len(runs) < need:
        return None
    gaps = need * 0.35
    speech = max(total - gaps, 1.0)
    chars = float(sum(lengths))
    dur = [l / chars * speech for l in lengths]

    INF = float("inf")
    J = len(runs)
    cost = [[INF] * J for _ in range(need)]
    back = [[-1] * J for _ in range(need)]
    for j in range(J):
        cost[0][j] = abs(runs[j][0] - dur[0])
    for k in range(1, need):
        for j in range(k, J):
            best, arg = INF, -1
            for i in range(k - 1, j):
                if cost[k - 1][i] == INF:
                    continue
                c = cost[k - 1][i] + abs(runs[j][0] - runs[i][1] - dur[k])
                if c < best:
                    best, arg = c, i
            cost[k][j], back[k][j] = best, arg
    end, last = INF, -1
    for j in range(need - 1, J):
        c = cost[need - 1][j]
        if c == INF:
            continue
        c += abs(total - runs[j][1] - dur[-1])
        if c < end:
            end, last = c, j
    if last < 0:
        return None
    chosen = [last]
    for k in range(need - 1, 0, -1):
        chosen.append(back[k][chosen[-1]])
    chosen.reverse()
    return [runs[j] for j in chosen], end / len(lengths)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", default="narration-text.json")
    ap.add_argument("--out", default="narration-marks.json")
    ap.add_argument("--only", metavar="GUIDE_ID")
    args = ap.parse_args()

    with open(args.text) as fh:
        payload = json.load(fh)
    url, key = config()
    live = {r["id"]: r.get("narration") or {} for r in json.loads(
        fetch(url + "/rest/v1/guides?select=id,narration", key))}

    out, found, skipped = {}, 0, 0
    with tempfile.TemporaryDirectory() as tmp:
        for g in payload["guides"]:
            gid = g["guideId"]
            if args.only and gid != args.only:
                continue
            for sec in g["sections"]:
                sid = sec["id"]
                entry = live.get(gid, {}).get(sid)
                why = None
                if not entry:
                    why = "no recording"
                elif entry.get("hash") != sec["hash"]:
                    why = "text changed since it was recorded"
                elif not sec.get("keys"):
                    why = "paragraphs do not line up"
                if why:
                    skipped += 1
                    print("  skip  %-26s %-14s %s" % (gid, sid, why), flush=True)
                    continue

                mp3 = os.path.join(tmp, "a.mp3")
                with open(mp3, "wb") as fh:
                    fh.write(fetch(url + "/storage/v1/object/public/narration/" +
                                   entry["path"]))
                runs, total = silences(mp3)
                parts = groups(sec["text"])
                fit = align([len(p) for p, _ in parts], runs, total)
                if fit is None:
                    skipped += 1
                    print("  skip  %-26s %-14s not enough silences" % (gid, sid), flush=True)
                    continue
                chosen, err = fit

                # Each group starts where the silence before it ends, less a
                # breath so the first syllable is not clipped.
                starts = [0.0] + [max(0.0, b - 0.08) for _, b in chosen]
                marks = {}
                for (_, pi), t in zip(parts, starts):
                    k = sec["keys"][pi]
                    if k not in marks:
                        marks[k] = round(t, 2)
                out.setdefault(gid, {})[sid] = marks
                found += 1
                print("  mark  %-26s %-14s %2d paragraphs, fit within %.1fs a group"
                      % (gid, sid, len(marks), err), flush=True)

    with open(args.out, "w") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
    print("\n%d sections marked, %d skipped, wrote %s" % (found, skipped, args.out))


if __name__ == "__main__":
    sys.exit(main())
