#!/bin/sh
# Home Church, install the debug build on the running emulator, open it, and
# hand its WebView to scripts/android_screens.js. Run by the GitHub Action
# inside the emulator step; see .github/workflows/android.yml.
#
#   sh scripts/android_emulator.sh <debug apk> <output dir>

set -e

APK="$1"
OUT="${2:-android-screens}"
APP=com.homechurchnola.app
mkdir -p "$OUT"

adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$APP/.MainActivity"

# The WebView's DevTools socket appears once the page has started loading.
PID=""
for i in $(seq 1 60); do
  PID=$(adb shell pidof "$APP" | tr -d '\r')
  if [ -n "$PID" ] && adb shell cat /proc/net/unix | grep -q "webview_devtools_remote_$PID"; then
    break
  fi
  sleep 1
done
adb forward tcp:9222 "localabstract:webview_devtools_remote_$PID"

STATUS=0
node scripts/android_screens.js "$OUT" || STATUS=$?

# Anything the app or Android complained about, for when a screenshot is wrong.
adb logcat -d -v time > "$OUT/logcat.txt" || true
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  echo "FAIL  the app crashed; see logcat.txt"
  STATUS=1
fi

exit $STATUS
