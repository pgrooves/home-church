#!/bin/sh
# The speech model and its venv, once per machine. Idempotent: run it every
# Sunday and it does nothing on the second run.
#
# WHY THIS IS A SCRIPT. A web session gets a fresh container, so "once per
# machine" is once per Sunday in practice. As four separate commands that is
# four permission prompts in front of the pastor every week; as one npm script
# it is covered by the `Bash(npm run:*)` rule already in .claude/settings.json
# and asks nobody anything.
#
# It costs about three minutes and 340MB the first time, nothing after.
# supabase/ACCESS.md and /new-sermon have the surrounding reasoning.
set -e

cd "$(dirname "$0")/.."

ONNX=models/kokoro-v1.0.onnx
VOICES=models/voices-v1.0.bin
BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0

if [ ! -x .venv/bin/python ]; then
  echo "  creating .venv"
  python3 -m venv .venv
fi

# Cheap to re-check, and the one that actually proves the venv is usable.
if ! .venv/bin/python -c "import kokoro_onnx, soundfile" 2>/dev/null; then
  echo "  installing kokoro-onnx, soundfile, imageio-ffmpeg"
  .venv/bin/pip install -q kokoro-onnx soundfile imageio-ffmpeg
fi

mkdir -p models

# Size checked, not just existence: a half finished download is worse than no
# download, because it looks done and fails later inside the model loader.
fetch() {
  path=$1; url=$2; least=$3
  if [ -f "$path" ] && [ "$(wc -c < "$path")" -gt "$least" ]; then
    return 0
  fi
  echo "  downloading $path"
  curl -fsSL --retry 3 -o "$path.part" "$url"
  mv "$path.part" "$path"
}

fetch "$ONNX"   "$BASE/kokoro-v1.0.onnx"  100000000
fetch "$VOICES" "$BASE/voices-v1.0.bin"    10000000

echo "  ready: $(du -sh models | cut -f1) of model, venv at .venv"
