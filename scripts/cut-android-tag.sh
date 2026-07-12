#!/usr/bin/env bash
#
# cut-android-tag.sh — Guarded creator for `android-v*` Play Console tags.
#
# ============================================================================
# Why this script exists
# ============================================================================
# Direct mirror of cut-ios-tag.sh. The Play Store doesn't have the same
# per-day upload cap as Apple, but it does enforce strictly monotonic
# versionCodes (set by Codemagic from $BUILD_NUMBER on every tag) and
# every upload triggers a rebuild + signing + Play Console artifact slot
# — so accidental tag spam still wastes time and creates churn in the
# Internal Testing track.
#
# More importantly: keeping iOS and Android tagging discipline symmetric
# means engineers only learn ONE workflow. `cut-ios-tag.sh` for iOS
# changes, `cut-android-tag.sh` for Android changes, both guarded.
#
# Usage:
#     ./scripts/cut-android-tag.sh             # cuts + pushes the tag
#     ./scripts/cut-android-tag.sh --dry-run   # rehearses; does not push
#     ./scripts/cut-android-tag.sh --force     # bypass (emergency only)
#
# Native-relevant paths for Android = mobile/, capacitor.config*, android/
# (when committed), package.json (Capacitor deps), and the codemagic.yaml
# Android workflow itself. Web/CMS/marketing changes ship via Vercel and
# are visible inside the app instantly via the WebView at /m, so they
# never justify an Android tag.
# ============================================================================

set -euo pipefail

# ---- Flags -----------------------------------------------------------------
DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    -h|--help)
      sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dry-run] [--force]" >&2
      exit 2
      ;;
  esac
done

# ---- Native-relevant path regex (extended POSIX) ---------------------------
# Keep in lock-step with .github/workflows/android-tag-guard.yml.
NATIVE_PATTERNS='^(android/|mobile/|scripts/(apply-android-overlay|ci/)|expo-app/|capacitor\.config(\.[a-z]+)?$)|(^codemagic\.yaml$)|(^package(-lock)?\.json$)'

# ---- Locate previous android-v* tag ----------------------------------------
LAST_TAG="$(git tag --sort=-creatordate --list 'android-v*' | head -1 || true)"

if [ -z "$LAST_TAG" ]; then
  echo "⚠️  No prior android-v* tag found — treating this as the first Android tag."
  echo "    Skipping diff check; proceeding with tag creation."
  CHANGED_FILES=""
else
  echo "🔎 Last android-v* tag: $LAST_TAG"
  CHANGED_FILES="$(git diff --name-only "$LAST_TAG"..HEAD || true)"
fi

# ---- Native-path check -----------------------------------------------------
if [ -n "$LAST_TAG" ]; then
  if [ -z "$CHANGED_FILES" ]; then
    echo "❌ No changes between $LAST_TAG and HEAD — refusing to cut an identical tag."
    echo "   If you really need to re-upload the same commits, use --force."
    [ "$FORCE" -eq 1 ] || exit 1
  fi

  NATIVE_MATCHES="$(printf '%s\n' "$CHANGED_FILES" | grep -E "$NATIVE_PATTERNS" || true)"

  if [ -z "$NATIVE_MATCHES" ]; then
    cat >&2 <<EOF
❌ Refusing to cut an android-v* tag.

   No commits since $LAST_TAG touched native-Android paths. Cutting a tag
   now would trigger a Codemagic Play Internal upload for web-only changes.

   Policy: android-v* tags are reserved for changes under:
     - android/**
     - mobile/**
     - scripts/apply-android-overlay.sh, scripts/ci/**
     - expo-app/**
     - capacitor.config*
     - codemagic.yaml
     - package.json / package-lock.json

   Web/CMS/marketing changes ship via Vercel — no tag, no Play upload.
   The Android app is a WebView wrapping specialcarer.com/m, so web
   changes are visible inside the app instantly without a re-release.

   Files changed since $LAST_TAG:
EOF
    printf '     %s\n' $CHANGED_FILES >&2

    if [ "$FORCE" -eq 1 ]; then
      echo "" >&2
      echo "⚠️  --force supplied — bypassing native-path check. Reason should be" >&2
      echo "    documented in the commit message / release notes." >&2
    else
      echo "" >&2
      echo "   To override (rare, e.g. signing/keystore fix that doesn't show in diff):" >&2
      echo "     $0 --force" >&2
      exit 1
    fi
  else
    echo "✅ Native-relevant changes detected:"
    printf '     %s\n' $NATIVE_MATCHES
  fi
fi

# ---- Compute new tag name --------------------------------------------------
NEW_TAG="android-v1.0.$(date +%s)"
echo "🏷  New tag: $NEW_TAG"

# ---- Cut / push (or rehearse) ----------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  echo "💧 --dry-run set — would run:"
  echo "     git tag $NEW_TAG"
  echo "     git push origin $NEW_TAG"
  exit 0
fi

git tag "$NEW_TAG"
git push origin "$NEW_TAG"
echo "🚀 Pushed $NEW_TAG — Codemagic android-internal will pick it up."
