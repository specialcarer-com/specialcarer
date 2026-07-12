#!/usr/bin/env bash
# Apply SpecialCarer Android overlay after `npx cap sync android`.
#
# Capacitor regenerates parts of the Android project on sync. This script
# re-applies our custom AndroidManifest (permissions, intent filters) and
# brand colours so local builds and CI stay aligned with iOS parity.
#
# Usage:
#   ./scripts/apply-android-overlay.sh
#   npx cap sync android && ./scripts/apply-android-overlay.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAY="$ROOT/mobile/android-overlay"
MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"

if [[ ! -f "$OVERLAY/AndroidManifest.xml" ]]; then
  echo "❌ missing $OVERLAY/AndroidManifest.xml"
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "❌ Android project not found — run: npx cap add android"
  exit 1
fi

cp "$OVERLAY/AndroidManifest.xml" "$MANIFEST"
echo "✅ Applied AndroidManifest overlay"

if [[ -f "$OVERLAY/colors.xml" ]]; then
  cp "$OVERLAY/colors.xml" "$ROOT/android/app/src/main/res/values/colors.xml"
  echo "✅ Applied colors.xml overlay"
fi

if [[ -f "$OVERLAY/ic_launcher_background.xml" ]]; then
  cp "$OVERLAY/ic_launcher_background.xml" \
    "$ROOT/android/app/src/main/res/values/ic_launcher_background.xml"
  echo "✅ Applied ic_launcher_background overlay"
fi

if [[ -f "$OVERLAY/network_security_config.xml" ]]; then
  mkdir -p "$ROOT/android/app/src/main/res/xml"
  cp "$OVERLAY/network_security_config.xml" \
    "$ROOT/android/app/src/main/res/xml/network_security_config.xml"
  echo "✅ Applied network_security_config overlay"
fi

echo "Done. Run: npx cap open android"
