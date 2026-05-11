#!/usr/bin/env bash
#
# cut-ios-tag.sh — Guarded creator for `ios-v*` TestFlight tags.
#
# ============================================================================
# Why this script exists — ITMS-90382 incident (2026-05-09 → 2026-05-10)
# ============================================================================
# Between Sat 2026-05-09 19:08 UTC and Sun 2026-05-10 01:02 UTC, 15 `ios-v*`
# tags were cut in roughly six hours. Almost none of those commits touched
# native iOS code — they were web/CMS/nav/FAQ/marketing changes. Each tag
# triggered the Codemagic `ios-testflight` workflow, which uploaded a build
# to App Store Connect. Apple's daily upload cap is per-bundle-id, and we
# burned through it; the next legitimate upload was rejected with
# `ITMS-90382 "Upload limit reached"` and the bundle was locked out for
# ~24 hours.
#
# Root cause was tagging discipline, not pipeline design. `codemagic.yaml`
# already gates TestFlight on the `ios-v*` tag pattern. What was missing
# was a guard that prevented the tag itself from being cut for web-only
# changes (those should go to Vercel and never reach Apple).
#
# This script is the guard. Use it instead of raw `git tag ios-v...`:
#
#     ./scripts/cut-ios-tag.sh             # cuts + pushes the tag
#     ./scripts/cut-ios-tag.sh --dry-run   # rehearses; does not push
#     ./scripts/cut-ios-tag.sh --force     # bypass (emergency only)
#
# Native-relevant paths (the only kinds of change that justify a TestFlight
# upload) are listed in NATIVE_PATTERNS below. Web/CMS/nav/marketing
# changes go to Vercel only.
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
      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
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
# Keep in lock-step with .github/workflows/ios-tag-guard.yml.
NATIVE_PATTERNS='^(ios/|mobile/|expo-app/|capacitor\.config(\.[a-z]+)?$)|(Info\.plist$)|(PrivacyInfo[^/]*$)|(\.entitlements$)|(^pubspec\.yaml$)'

# ---- Locate previous ios-v* tag --------------------------------------------
# Prefer creator-date order so we get the most recently *created* tag, not
# the highest lexicographic version (the suffix is a unix timestamp, so the
# two usually agree — but creator-date is the source of truth).
LAST_TAG="$(git tag --sort=-creatordate --list 'ios-v*' | head -1 || true)"

if [ -z "$LAST_TAG" ]; then
  echo "⚠️  No prior ios-v* tag found — treating this as the first iOS tag."
  echo "    Skipping diff check; proceeding with tag creation."
  CHANGED_FILES=""
else
  echo "🔎 Last ios-v* tag: $LAST_TAG"
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
❌ Refusing to cut an ios-v* tag.

   No commits since $LAST_TAG touched native-iOS paths. Cutting a tag now
   would trigger a Codemagic TestFlight upload for web-only changes and
   risks re-tripping Apple's daily upload limit (ITMS-90382).

   Policy: ios-v* tags are reserved for changes under:
     - ios/**
     - mobile/**
     - expo-app/** (with native config)
     - capacitor.config*
     - **/Info.plist
     - **/PrivacyInfo*
     - **/*.entitlements
     - pubspec.yaml

   Web/CMS/marketing changes ship via Vercel — no tag, no Apple upload.

   Files changed since $LAST_TAG:
EOF
    printf '     %s\n' $CHANGED_FILES >&2

    if [ "$FORCE" -eq 1 ]; then
      echo "" >&2
      echo "⚠️  --force supplied — bypassing native-path check. Reason should be" >&2
      echo "    documented in the commit message / release notes." >&2
    else
      echo "" >&2
      echo "   To override (rare, e.g. signing/profile fix that doesn't show in diff):" >&2
      echo "     $0 --force" >&2
      exit 1
    fi
  else
    echo "✅ Native-relevant changes detected:"
    printf '     %s\n' $NATIVE_MATCHES
  fi
fi

# ---- Compute new tag name --------------------------------------------------
NEW_TAG="ios-v1.0.$(date +%s)"
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
echo "🚀 Pushed $NEW_TAG — Codemagic ios-testflight will pick it up."
