#!/usr/bin/env bash
# Idempotent Android project bootstrap for SpecialCarer (Capacitor 8).
#
# Generates android/ if missing, copies offline web shell, syncs plugins,
# generates icons/splash, and applies the Android overlay (permissions,
# deep links, network security).
#
# Prerequisites:
#   - Node 22+, npm ci
#   - Android Studio + SDK (API 36), ANDROID_HOME set
#   - Java 17+
#
# Usage:
#   npm run mobile:bootstrap:android
#   cd android && ./gradlew assembleDebug
#   npx cap run android
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "── SpecialCarer Android bootstrap ──"

mkdir -p mobile/web
if [ ! -f mobile/web/index.html ]; then
  echo "❌ mobile/web/index.html missing"
  exit 1
fi

if [ -f android/app/build.gradle ] && [ -f android/app/src/main/AndroidManifest.xml ]; then
  echo "✅ android/ project already exists — skipping cap add android"
else
  echo "⚠️  Generating fresh android/ project via Capacitor CLI"
  rm -rf android
  npx cap add android
  test -f android/app/build.gradle || { echo "❌ cap add android failed"; exit 1; }
fi

if [ -f mobile/resources/icon.png ]; then
  echo "🎨 Generating Android icons + splash from mobile/resources/"
  npx capacitor-assets generate --android --assetPath mobile/resources
else
  echo "⚠️  mobile/resources/icon.png missing — skipping asset generation"
fi

echo "🔄 Running cap sync android …"
npx cap sync android

bash scripts/apply-android-overlay.sh

echo ""
echo "✅ Android bootstrap complete."
echo ""
echo "Next steps:"
echo "  1. Ensure ANDROID_HOME is set"
echo "  2. cd android && ./gradlew assembleDebug"
echo "  3. npx cap run android"
echo ""
echo "Local dev against Next.js on the host:"
echo "  CAPACITOR_SERVER_URL=http://10.0.2.2:3000/m npm run mobile:bootstrap:android"
echo "  npm run dev   # separate terminal"
echo ""
