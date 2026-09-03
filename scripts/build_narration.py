#!/usr/bin/env python3
"""
Home Church, saying the guide out loud.

WHAT THIS IS. The speech half of the narration pipeline. It reads
narration-text.json, written by scripts/narration_text.js, and produces one
mp3 per guide section plus a manifest describing what it made. It decides
nothing about wording: every word it speaks was chosen on the Node side, where
the tests are.

WHAT IT COSTS. Nothing. Kokoro-82M is an 82 million parameter model under
Apache 2.0 that runs on a CPU. There is no API, no key, no account and no
quota, so there is no per-guide or per-play charge and nothing that a vendor
can reprice. The whole current catalogue, three guides and eighteen sections,
took eleven minutes and produced 17MB.

SETUP, once:

    python3 -m venv .venv
    .venv/bin/pip install kokoro-onnx soundfile imageio-ffmpeg
    curl -L -o models/kokoro-v1.0.onnx \\
      https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -L -o models/voices-v1.0.bin \\
      https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

RUN:

    node scripts/narration_text.js
    .venv/bin/python scripts/build_narration.py
    node scripts/upload_narration.js          # needs the service role key

Only sections whose text hash has changed are regenerated, so a normal week
re-speaks one new guide and leaves the rest alone.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time

VOICE = "af_heart"

# Slightly under natural pace. These are not headlines, they are paragraphs
# somebody is trying to think alongside, and 1.0 reads faster than a person
# would say the same words in a living room. The app can speed it up at play
# time and costs nothing to do so, but it cannot slow down what was rushed.
SPEED = 0.95

# Kokoro tops out around 510 phoneme tokens per call, which is a few hundred
# characters of English. Splitting on sentences rather than a fixed width
# keeps the model from taking a breath in the middle of a clause.
CHUNK_CHARS = 380

# The pause between sentence groups. Long enough to hear a paragraph land,
# short enough that a list of questions does not feel like buffering.
GAP_SECONDS = 0.35

BITRATE = "48k"


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    from shutil import which
    found = which("ffmpeg")
    if not found:
        sys.exit("No ffmpeg. pip install imageio-ffmpeg, or install ffmpeg.")
    return found


def sentences(text, limit=CHUNK_CHARS):
    """Sentence groups under the model's token ceiling."""
    parts, buf = [], ""
    for line in text.split("\n\n"):
        for s in re.split(r"(?<=[.!?])\s+", line.strip()):
            if not s:
                continue
            if len(buf) + len(s) + 1 < limit:
                buf = (buf + " " + s).strip()
            else:
                if buf:
                    parts.append(buf)
                buf = s
        if buf:
            parts.append(buf)
            buf = ""
    if buf:
        parts.append(buf)
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", default="narration-text.json")
    ap.add_argument("--out", default="narration")
    ap.add_argument("--models", default="models")
    ap.add_argument("--voice", default=VOICE)
    ap.add_argument("--force", action="store_true",
                    help="regenerate every section, not only changed ones")
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    from kokoro_onnx import Kokoro

    onnx = os.path.join(args.models, "kokoro-v1.0.onnx")
    voices = os.path.join(args.models, "voices-v1.0.bin")
    for f in (onnx, voices):
        if not os.path.exists(f):
            sys.exit("Missing %s. See the setup block at the top of this file." % f)

    with open(args.text) as fh:
        payload = json.load(fh)

    manifest_path = os.path.join(args.out, "manifest.json")
    previous = {}
    if os.path.exists(manifest_path) and not args.force:
        with open(manifest_path) as fh:
            previous = json.load(fh)

    kokoro = Kokoro(onnx, voices)
    ff = ffmpeg_exe()

    manifest = {}
    started = time.time()
    made, skipped, audio_seconds, total_bytes = 0, 0, 0.0, 0

    for guide in payload["guides"]:
        gid = guide["guideId"]
        gdir = os.path.join(args.out, gid, args.voice)
        os.makedirs(gdir, exist_ok=True)
        manifest[gid] = {}

        for section in guide["sections"]:
            sid, text, digest = section["id"], section["text"], section["hash"]
            mp3 = os.path.join(gdir, sid + ".mp3")
            was = previous.get(gid, {}).get(sid)

            # Unchanged text with a file still on disk is left alone. This is
            # what makes a weekly run cheap: one new guide, not the catalogue.
            if was and was.get("hash") == digest and os.path.exists(mp3) and not args.force:
                manifest[gid][sid] = was
                audio_seconds += was.get("seconds", 0)
                total_bytes += was.get("bytes", 0)
                skipped += 1
                print("  skip  %-22s %s" % (gid, sid), flush=True)
                continue

            t0 = time.time()
            chunks, rate = [], 24000
            for part in sentences(text):
                samples, rate = kokoro.create(
                    part, voice=args.voice, speed=SPEED, lang="en-us")
                chunks.append(samples)
                chunks.append(np.zeros(int(rate * GAP_SECONDS), dtype=samples.dtype))
            audio = np.concatenate(chunks)

            wav = mp3 + ".wav"
            sf.write(wav, audio, rate)
            subprocess.run(
                [ff, "-y", "-loglevel", "error", "-i", wav,
                 "-codec:a", "libmp3lame", "-b:a", BITRATE, "-ac", "1", mp3],
                check=True)
            os.remove(wav)

            secs = round(len(audio) / rate, 1)
            size = os.path.getsize(mp3)
            manifest[gid][sid] = {
                "path": "%s/%s/%s.mp3" % (gid, args.voice, sid),
                "seconds": secs,
                "bytes": size,
                "voice": args.voice,
                "hash": digest,
            }
            audio_seconds += secs
            total_bytes += size
            made += 1
            print("  made  %-22s %-14s %6.1fs audio  %5.1fs cpu  %6.0f KB"
                  % (gid, sid, secs, time.time() - t0, size / 1024), flush=True)

    os.makedirs(args.out, exist_ok=True)
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=1)

    wall = time.time() - started
    print("\n" + "=" * 70)
    print("generated       %d sections" % made)
    print("reused          %d sections" % skipped)
    print("audio           %.1f min" % (audio_seconds / 60))
    print("wall clock      %.1f min" % (wall / 60))
    if wall > 0 and made:
        print("speed           %.2fx faster than real time" % (audio_seconds / wall))
    print("total size      %.1f MB" % (total_bytes / 1048576))
    print("api tokens      0")
    print("manifest        %s" % manifest_path)
    print("=" * 70)


if __name__ == "__main__":
    main()
