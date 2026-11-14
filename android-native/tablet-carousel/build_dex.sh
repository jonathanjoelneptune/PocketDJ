#!/usr/bin/env bash
# Reproducible tablet-only DEX build using the Android SDK.
# Produces one new classes20.dex. Does not patch the working classes19.dex.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK location}"
API="${POCKETDJ_ANDROID_API:-35}"
TOOLS="${POCKETDJ_BUILD_TOOLS:-35.0.0}"
ANDROID_JAR="$ANDROID_HOME/platforms/android-$API/android.jar"
D8="$ANDROID_HOME/build-tools/$TOOLS/d8"
[[ -f "$ANDROID_JAR" && -x "$D8" ]] || { echo "Missing android.jar or d8 ($ANDROID_JAR, $D8)" >&2; exit 1; }
OUT="${1:-$ROOT/build}"
mkdir -p "$OUT" "$OUT/stubs" "$OUT/classes" "$OUT/dex"
mapfile -t STUBS < <(find "$ROOT/compile-stubs" -name '*.java' | sort)
mapfile -t SOURCES < <(find "$ROOT/src" -name '*.java' | sort)
javac -source 8 -target 8 -encoding UTF-8 -cp "$ANDROID_JAR" -d "$OUT/stubs" "${STUBS[@]}"
jar cf "$OUT/compile-only-stubs.jar" -C "$OUT/stubs" .
javac -source 8 -target 8 -encoding UTF-8 -cp "$ANDROID_JAR:$OUT/compile-only-stubs.jar" -d "$OUT/classes" "${SOURCES[@]}"
mapfile -t CLASSES < <(find "$OUT/classes" -name '*.class' | sort)
"$D8" --min-api 26 --lib "$ANDROID_JAR" --classpath "$OUT/compile-only-stubs.jar" --output "$OUT/dex" "${CLASSES[@]}"
# Deliberately exclude all compile-only stubs. APK's existing classes19.dex
# must provide the SwipeRouter and SwipePageEffects symbols at runtime.
[[ -s "$OUT/dex/classes.dex" ]] || { echo 'DEX missing'; exit 1; }
cp "$OUT/dex/classes.dex" "$OUT/classes20.dex"
sha256sum "$OUT/classes20.dex"
echo "Compiled only the new tablet host and animator; no APK has been produced."
