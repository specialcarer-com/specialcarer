# Android release runbook — Codemagic + Play Internal Testing

CI-only signing and Play upload pipeline. **Not** part of foundation PR #163 — merge after [#163](https://github.com/specialcarer-com/specialcarer/pull/163) lands, as the revival of [#66](https://github.com/specialcarer-com/specialcarer/pull/66).

## Workflows

| Workflow | Trigger | Signing | Upload |
|----------|---------|---------|--------|
| `android-build` | push to `main` | debug (no `CM_KEYSTORE` required) | none — `.aab` artifact only |
| `android-internal` | `android-v*` tag | release upload keystore required | Play Internal track |

Cut a release tag with `./scripts/cut-android-tag.sh` (guarded — mirrors `cut-ios-tag.sh`).

## Two credential types (do not conflate)

### 1. Upload keystore (app signing) — `android_keystore` group

Used to **sign** the `.aab` before upload. This is a Java keystore (`.jks`) you generate once.

| Variable | Description |
|----------|-------------|
| `CM_KEYSTORE` | Base64-encoded `.jks` file |
| `CM_KEYSTORE_PASSWORD` | Store password |
| `CM_KEY_ALIAS` | Key alias (default: `specialcarer`) |
| `CM_KEY_PASSWORD` | Key password |

**No Google Cloud service account is involved in keystore generation or storage.**

### 2. Play Console upload API — `google_play` group

Used by Codemagic to **upload** the signed `.aab` to Play Console. Separate from the keystore.

| Variable | Description |
|----------|-------------|
| `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` | JSON key for a Play Console–linked service account |

Only `android-internal` needs this group. `android-build` does not.

## One-time keystore bootstrap

Do **not** use Codemagic’s “Generate Android keystore” UI if you want the guarded bootstrap in-repo.

1. Start a **manual** `android-internal` build in Codemagic.
2. Add a temporary workflow env var: `ALLOW_KEYSTORE_BOOTSTRAP=true`.
3. Leave `CM_KEYSTORE` unset.
4. Run the build. `scripts/ci/setup-android-signing.sh`:
   - generates a keystore with `keytool`
   - copies it directly to `/tmp/keystore.jks` (no base64 round-trip during generation)
   - prints `CM_KEYSTORE` as base64 plus hex passwords (`openssl rand -hex 16`)
5. Copy the printed values into Codemagic group `android_keystore` (mark secure).
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

Required for `android-internal` uploads, not for keystore bootstrap:

1. Google Cloud Console → create service account → download JSON key.
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

Store passwords in a password manager; use hex strings to avoid shell/Gradle escaping issues.
