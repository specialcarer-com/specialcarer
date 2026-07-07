#!/usr/bin/env bash
# Apply SpecialCarer Android overlay onto a Capacitor-generated android/ project.
# Run AFTER `npx cap sync android` so plugin wiring is in place.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OVERLAY="$ROOT/mobile/android-overlay"
ANDROID_APP="$ROOT/android/app"

if [ ! -d "$ANDROID_APP/src/main" ]; then
  echo "❌ android/app/src/main not found — run 'npm run mobile:bootstrap:android' first"
  exit 1
fi

echo "📋 Applying Android overlay from mobile/android-overlay/ …"

cp "$OVERLAY/App/src/main/AndroidManifest.xml" \
   "$ANDROID_APP/src/main/AndroidManifest.xml"

mkdir -p "$ANDROID_APP/src/main/res/values"
mkdir -p "$ANDROID_APP/src/main/res/xml"

cp "$OVERLAY/App/src/main/res/values/colors.xml" \
   "$ANDROID_APP/src/main/res/values/colors.xml"

cp "$OVERLAY/App/src/main/res/xml/network_security_config.xml" \
   "$ANDROID_APP/src/main/res/xml/network_security_config.xml"

# Merge brand colors into styles if colorPrimary refs exist
STYLES="$ANDROID_APP/src/main/res/values/styles.xml"
if [ -f "$STYLES" ] && ! grep -q 'colorPrimary' "$STYLES"; then
  echo "  (styles.xml unchanged — color refs already present or absent)"
fi

echo "✅ Android overlay applied"
