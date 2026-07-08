# Android release runbook — Codemagic + Play Internal Testing

CI-only signing and Play upload pipeline. **Not** part of foundation PR #163 — merge after [#163](https://github.com/specialcarer-com/specialcarer/pull/163) lands, as the revival of [#66](https://github.com/specialcarer-com/specialcarer/pull/66).

## Workflows

| Workflow | Trigger | Signing | Upload |
|----------|---------|---------|--------|
| `android-build` | push to `main` | debug (no `CM_KEYSTORE` required) | none — `.aab` artifact only |
| `android-internal` | `android-v*` tag | release upload keystore required | Play Internal track |

Cut a release tag with `./scripts/cut-android-tag.sh` (guarded — mirrors `cut-ios-tag.sh`).

## First-run checklist (ordered)

Complete these steps once, in order, after [#163](https://github.com/specialcarer-com/specialcarer/pull/163) has merged to `main` and #164 has been rebased onto `main`:

1. **Verify compile CI** — push to `main` (or wait for the next native change) and confirm Codemagic `android-build` succeeds. No `CM_KEYSTORE` or Play credentials are required; output is a debug-signed `.aab` artifact only.
2. **Create Codemagic groups** (empty initially):
   - `android_keystore` — upload keystore material (signing only)
   - `google_play` — Play Console upload API (upload only; separate from keystore)
3. **One-time keystore bootstrap** — follow [One-time keystore bootstrap](#one-time-keystore-bootstrap) below. Use a **manual `android-internal` build only** with `ALLOW_KEYSTORE_BOOTSTRAP=true`. Never set this on `android-build` or as a persistent team variable.
4. **Save bootstrap output** — copy printed `CM_KEYSTORE`, passwords, and alias into `android_keystore` (mark secure). Remove `ALLOW_KEYSTORE_BOOTSTRAP` immediately.
5. **Play upload credentials** — obtain `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` via the [approved org/security process](#play-console-service-account-upload-only) (see GCP policy note below). Store in `google_play` group. This is **not** used for keystore generation.
6. **Rehearse a tag** — `./scripts/cut-android-tag.sh --dry-run` from a commit that touches native Android paths.
7. **Cut first release tag** — `./scripts/cut-android-tag.sh` (or `--force` only in emergencies).
8. **Verify in Play Console** — confirm Codemagic `android-internal` uploaded to **Internal testing** and the build appears for the app.

## Two credential types (do not conflate)

Signing material and Play upload credentials solve different problems. **Never mix them** — the upload keystore signs the `.aab`; the Play service account only uploads an already-signed bundle.

### 1. Upload keystore (app signing) — `android_keystore` group

Used to **sign** the `.aab` before upload. This is a Java keystore (`.jks`) you generate once with local `keytool` (or the one-time bootstrap script).

| Variable | Description |
|----------|-------------|
| `CM_KEYSTORE` | Base64-encoded `.jks` file |
| `CM_KEYSTORE_PASSWORD` | Store password |
| `CM_KEY_ALIAS` | Key alias (default: `specialcarer`) |
| `CM_KEY_PASSWORD` | Key password — **must match store password for PKCS12 keystores** |

**No Google Cloud service account is involved in keystore generation or storage.**

### 2. Play Console upload API — `google_play` group

Used by Codemagic to **upload** the signed `.aab` to Play Console. Completely separate from the keystore — you cannot sign an app with this credential.

| Variable | Description |
|----------|-------------|
| `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` | JSON key for a Play Console–linked service account |

Only `android-internal` needs this group. `android-build` does not.

## One-time keystore bootstrap

> **⚠️ `ALLOW_KEYSTORE_BOOTSTRAP` is for one-time manual `android-internal` use only.**
>
> - Set it on a **single manual** `android-internal` build in Codemagic.
> - **Never** set it on `android-build`, on `main` push workflows, or as a persistent team/workflow variable.
> - `android-build` on `main` **never** generates an upload keystore, even if this flag is accidentally set.
> - Remove the flag immediately after copying the printed secrets.

Do **not** use Codemagic’s “Generate Android keystore” UI if you want the guarded bootstrap in-repo.

1. Start a **manual** `android-internal` build in Codemagic (not `android-build`).
2. Add a temporary workflow env var: `ALLOW_KEYSTORE_BOOTSTRAP=true`.
3. Leave `CM_KEYSTORE` unset.
4. Run the build. `scripts/ci/setup-android-signing.sh --require-release`:
   - generates a keystore with `keytool`
   - copies it directly to `/tmp/keystore.jks` (no base64 round-trip during generation)
   - prints `CM_KEYSTORE` as base64 plus a single hex password used for **both** store and key (PKCS12)
5. Copy the printed values into Codemagic group `android_keystore` (mark secure). Set `CM_KEY_PASSWORD` to the **same value** as `CM_KEYSTORE_PASSWORD`.
6. Remove `ALLOW_KEYSTORE_BOOTSTRAP` — normal CI must not have it set.

If `CM_KEYSTORE` is missing and `ALLOW_KEYSTORE_BOOTSTRAP` is not `true`, `android-internal` **fails** with a clear message. `android-build` on `main` continues with debug signing.

## Gradle injection (CI-only)

`setup-android-signing.sh` writes a generated file (gitignored):

`android/app/signing.release.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('/tmp/keystore.jks')
            storePassword System.getenv('CM_KEYSTORE_PASSWORD') ?: ''
            keyAlias System.getenv('CM_KEY_ALIAS') ?: 'specialcarer'
            keyPassword System.getenv('CM_KEY_PASSWORD') ?: ''
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

It appends **only** this line to `android/app/build.gradle` (idempotent):

```gradle
apply from: 'signing.release.gradle'
```

Passwords are never interpolated into Gradle heredocs — only read via `System.getenv(...)`.

## Play Console service account (upload only)

Required for `android-internal` uploads, **not** for keystore bootstrap. This credential is unrelated to `android_keystore` — it only uploads an already-signed `.aab`.

> **GCP org policy note:** SpecialCarers GCP policy may **block service account key creation**. Do not assume you can create a new SA and download a JSON key. Follow the approved org/security process for Play upload credentials — e.g. use an existing Play-linked service account, a security-approved exception, or whatever path your org mandates. Keystore bootstrap never requires a GCP service account key.

Typical setup (when policy allows):

1. Google Cloud Console → create or select service account → obtain JSON key per org policy.
2. Play Console → Users and permissions → invite service account with “Release to testing tracks”.
3. Store JSON in Codemagic `google_play` group as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.

## Local alternative

```bash
keytool -genkeypair -v \
  -keystore specialcarer-upload.jks \
  -alias specialcarer \
  -keyalg RSA -keysize 2048 -validity 10000

base64 -w0 specialcarer-upload.jks   # paste into CM_KEYSTORE
```

Use the **same password** for store and key (PKCS12 default). Store passwords in a password manager; hex strings avoid shell/Gradle escaping issues.
