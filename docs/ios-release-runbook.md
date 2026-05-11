# iOS TestFlight release runbook

## TL;DR — cutting an iOS TestFlight build

```bash
./scripts/cut-ios-tag.sh             # cut + push the tag
./scripts/cut-ios-tag.sh --dry-run   # rehearse without pushing
```

**Never run `git tag ios-v...` directly.** The script enforces the policy
below; raw `git tag` skips the guard and risks tripping Apple's daily
upload limit (ITMS-90382 — see incident note below).

## Policy

An `ios-v*` tag triggers the Codemagic `ios-testflight` workflow, which
uploads a build to App Store Connect. Apple enforces a per-bundle-id
daily upload cap, and burning through it locks the bundle out for ~24h
with `ITMS-90382 "Upload limit reached"`.

Therefore: only cut `ios-v*` tags for changes that actually affect the
native iOS app. Native-relevant paths:

- `ios/**`
- `mobile/**`
- `expo-app/**` (when it has native config)
- `capacitor.config*`
- `**/Info.plist`
- `**/PrivacyInfo*`
- `**/*.entitlements`
- `pubspec.yaml`

Web/CMS/nav/FAQ/marketing changes ship via Vercel — push to `main`, no
tag, no Apple upload.

## Two layers of guard

1. **`scripts/cut-ios-tag.sh`** — the canonical, human-driven tool. Checks
   the diff between the most recent `ios-v*` tag and `HEAD` against the
   native path patterns above. Refuses to tag if nothing native changed.
   Supports `--dry-run` (rehearse) and `--force` (emergency bypass — log a
   reason in the next commit message or release notes).

2. **`.github/workflows/ios-tag-guard.yml`** — a GitHub Actions workflow
   that re-runs the same check on every `ios-v*` tag push. CI cannot
   delete a tag, and Codemagic listens to the tag independently, so this
   workflow does NOT prevent an unwanted upload that's already in flight.
   Its purpose is paper trail and review surface: a red check on the tag
   is a visible signal that the policy was bypassed.

Both layers use the same regex; keep them in sync if either is edited.

## ITMS-90382 incident (2026-05-09 → 2026-05-10)

Between **Sat 2026-05-09 19:08 UTC** and **Sun 2026-05-10 01:02 UTC**, 15
`ios-v*` tags were cut in roughly six hours. Sampling showed almost none
of the underlying commits touched native iOS — the work was web/CMS,
navigation, FAQ, and marketing. Each tag still uploaded a build, and we
hit Apple's daily upload cap. The next legitimate build was rejected
with `ITMS-90382` and the bundle was locked for ~24h.

Root cause: tagging discipline, not pipeline design. `codemagic.yaml`
correctly gates TestFlight on the `ios-v*` tag pattern; the missing
piece was a check on the tag itself.

The guards above are the corrective action. Don't disable them.

## Build numbers

`codemagic.yaml` sets `CFBundleVersion` to `$BUILD_NUMBER` (Codemagic's
auto-incrementing build sequence counter) via `agvtool new-version`. The
build number is NOT stored in source — it ratchets up automatically with
every Codemagic run. `MARKETING_VERSION` stays at `1.0`.

If you ever need to force a specific build number, override `BUILD_NUMBER`
in the Codemagic UI for the next run; do not commit it.

### Post-ITMS-90382 build-number floor

The Apple-side build number reached **119** during the 2026-05-09/10
incident (the last successful upload before the rate-limit lock). The
next legitimate TestFlight tag should produce build **120 or higher**.

Because `BUILD_NUMBER` is Codemagic's own counter, this is normally
automatic — Codemagic's counter has already advanced past 119. Verify
before the next tag:

1. Open Codemagic ▸ ios-testflight workflow ▸ Builds — confirm the next
   build sequence is ≥ 120.
2. If it is not (rare — only if the workflow was deleted/recreated),
   set `BUILD_NUMBER` to `120` in the workflow's environment variables
   for one run, then unset it so auto-increment resumes.

Do **not** edit `agvtool new-version -all "$BUILD_NUMBER"` in
`codemagic.yaml` to hard-code a value — that defeats the auto-increment
and will cause duplicate-build-number rejections on later uploads.

## Emergency override

If you absolutely must cut a tag without a native-path change (e.g. a
signing/profile fix that exists only in Codemagic's UI), use:

```bash
./scripts/cut-ios-tag.sh --force
```

Then immediately follow up: write a one-line note in the next commit or
in `#mobile-releases` explaining the reason. `--force` is for exceptions,
not workflow.
