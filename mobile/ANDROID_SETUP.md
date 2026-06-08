# Codemagic → Google Play Internal Testing setup guide

This is a **one-time, ~45 minute** setup. After it's done, every push to `main` will build an Android App Bundle (`.aab`), and every `android-v*` git tag will upload it to the Play Console Internal Testing track.

You do not need an Android phone or Android Studio installed locally.

---

## What you'll do (high level)

1. Enrol in Google Play Console (£20 / $25 one-time)
2. Create the SpecialCarer app in Play Console
3. Generate an upload keystore (one-off)
4. Generate a Google Cloud service account for Codemagic
5. Wire credentials into Codemagic
6. Cut the first `android-v*` tag

---

## Prerequisites you already have ✅

- `codemagic.yaml` has the `android-build` and `android-internal` workflows
- `capacitor.config.ts` has Android settings (`androidScheme: https`, brand-teal background)
- `mobile/resources/icon.png` + `splash.png` are the canonical brand source — `@capacitor/assets` will generate all density buckets at build time
- Package name reserved: `com.allcare4ugroup.specialcarer`

---

## Step 1 — Enrol in Google Play Console — **YOU**

1. Go to <https://play.google.com/console/signup>
2. Sign up as **organisation** (not individual)
3. Cost: **£20 one-time** (Google bills £20 in the UK, equivalent to $25 elsewhere)
4. You'll need:
   - The D-U-N-S number for **All Care 4 U Group Ltd** (free from <https://developer.apple.com/enroll/duns-lookup/> — same DUNS as Apple)
   - A personal credit card for verification (Google charges the £20 then never charges again)
5. Verification typically takes **1–3 business days**

---

## Step 2 — Create the app in Play Console — **YOU**

Once enrolment is approved:

1. Open Play Console → **Create app**
2. Fill in:
   - **App name**: `Special Carer`
   - **Default language**: `English (United Kingdom)`
   - **App or game**: `App`
   - **Free or paid**: `Free`
   - Tick both declarations (Developer Programme Policies + US export laws)
3. Click **Create app**
4. Go to **App information** → set:
   - **Package name**: `com.allcare4ugroup.specialcarer` (must match `capacitor.config.ts`)
5. Go to **App content** → complete:
   - **Privacy Policy URL**: `https://specialcarer.com/privacy`
   - **Account deletion URL**: `https://specialcarer.com/account/delete`
   - **Data safety questionnaire** (matches your iOS App Privacy answers)
   - **Content rating** (run the questionnaire, get "PEGI 3" or similar)
   - **Target audience** (adults — not children)
   - **News app** declaration (No)

---

## Step 3 — Generate an upload keystore — **DEV (one-time, run locally)**

Every Android app signs its uploads with a **upload keystore** held by you. Google then re-signs the app with their **app-signing key** (which lives in Google's HSM). Lose your upload keystore → request a key reset from Google (a slow process). Treat it like a root credential.

**Easiest path: let Codemagic generate one for you.**

1. In Codemagic, open the app → **Settings** → **Environment variables**
2. Click **Generate Android keystore**
3. Fill in:
   - **Reference name**: `keystore` (this is what `codemagic.yaml` references)
   - **Alias**: `specialcarer`
   - **Password**: generate a strong password (save it somewhere safe — e.g. 1Password)
   - **Key password**: same as above
4. Codemagic generates the `.jks`, base64-encodes it, and stores it as `CM_KEYSTORE` in the `android_keystore` group.

**Alternative — generate locally with `keytool`:**

```bash
keytool -genkey -v \
  -keystore specialcarer-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias specialcarer
```

Then base64-encode and paste:

```bash
base64 -i specialcarer-upload.jks | pbcopy  # macOS
```

In Codemagic UI: **Environment variables** → group `android_keystore` → add:

- `CM_KEYSTORE` (paste base64, mark as secure)
- `CM_KEYSTORE_PASSWORD` (the storepass)
- `CM_KEY_ALIAS` (`specialcarer`)
- `CM_KEY_PASSWORD` (the keypass)

---

## Step 4 — Generate the Google Play service account JSON — **YOU**

This is the credential Codemagic uses to upload `.aab` files to Play Console on your behalf.

### Part A — Create the service account in Google Cloud Console

1. Go to <https://console.cloud.google.com/>
2. Create a new project (or use existing): `specialcarer-play-uploads`
3. Enable the **Google Play Android Developer API**:
   - APIs & Services → Library → search "Google Play Android Developer" → Enable
4. IAM & Admin → Service Accounts → **Create service account**
5. Name: `codemagic-play-uploader`
6. **No** project role needed (Play Console handles permissions)
7. Click **Done**
8. On the new service account: **Keys** → **Add key** → **Create new key** → **JSON** → **Create**
9. **Download the JSON file immediately** (this is the credential)

### Part B — Link the service account to Play Console

1. Open Play Console → **Setup** → **API access**
2. Find the service account you just created (it should appear automatically after a few minutes; if not, click **Link** under "Service accounts")
3. Click **Grant access** on the row
4. Permissions: tick at minimum:
   - **Releases** → **Release to testing tracks**
   - **App access** → **Internal app sharing**
5. Click **Invite user** → **Save changes**

---

## Step 5 — Add Play credentials to Codemagic — **YOU**

1. Codemagic → app → **Environment variables**
2. Create group: `google_play`
3. Add variable:
   - **Name**: `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`
   - **Value**: paste the **entire contents** of the JSON file from Step 4 Part A (including `{` and `}`)
   - **Group**: `google_play`
   - Mark as **secure** ✅

---

## Step 6 — Upload the first .aab manually (Play Store quirk) — **YOU**

Google Play requires the **first** release in a track to be uploaded manually via the Play Console web UI before automated uploads work. You only do this once.

1. Trigger an `android-build` workflow:
   - Push any tiny commit to `main`, OR
   - Codemagic → **Start new build** → select `android-build` → branch `main`
2. When the build completes, download the `.aab` from the artifacts tab
3. Play Console → **Testing** → **Internal testing** → **Create new release**
4. Upload the `.aab` (drag and drop)
5. Add release notes (e.g. "Initial internal release")
6. **Save** → **Review release** → **Roll out to internal testing**

After this, automated uploads work — Codemagic will publish straight to the same track on every `android-v*` tag.

---

## Step 7 — Add internal testers — **YOU**

1. Play Console → **Testing** → **Internal testing** → **Testers** tab
2. Create email list: `SpecialCarer Internal`
3. Add tester emails (yourself, anyone else who should test)
4. Copy the **opt-in URL** from the same page
5. Send the opt-in URL to the testers — they click it, accept, then install via Play Store

Internal testers see builds within minutes of upload. No Play Store review needed for the internal track.

---

## Step 8 — Cut your first release tag — **DEV**

```bash
./scripts/cut-android-tag.sh
```

The script:

1. Checks the diff since the last `android-v*` tag (skipped on first run)
2. Verifies the changes touch native-Android paths
3. Creates `android-v1.0.<timestamp>` and pushes it

Codemagic picks up the tag within ~30s and the new build appears in your Internal Testing track ~12 min later.

---

## Troubleshooting

### Build fails with `Cannot resolve symbol BuildConfig`

Stale Capacitor generation. Force a fresh `android/` rebuild by deleting it before the build:

In Codemagic → app → **Settings** → **Build settings** → "Clean build cache" → enable. Or push an empty commit and `cap add android` will regenerate.

### Play upload fails with `403 The caller does not have permission`

The service account isn't linked to Play Console (Step 4 Part B), or it doesn't have **Release to testing tracks** permission.

### Versioning conflict — "version code already exists"

The Codemagic `BUILD_NUMBER` should always increase, but if you re-run an old build you'll hit this. Always push a new tag rather than re-running.

### Brand teal drift in the splash

The build asserts the xxxhdpi adaptive icon's top-left averages to `#039EA0`. If you change `mobile/resources/icon.png` and the colour drifts, the build fails fast (mirror of the iOS guard).

---

## What's NOT in this guide

- **Production track release** — once you're happy with internal testing, the `android-internal` workflow can be cloned to `android-production` with `track: production` (and likely a `rollout_fraction` for staged rollout). Add when you're ready to ship publicly.
- **Crashlytics / Firebase** — not configured. The app is a thin WebView, so most error reporting happens server-side via Vercel + Supabase.
- **Play App Signing key rotation** — Google manages this. You only manage the upload keystore.
