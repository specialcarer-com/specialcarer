# Codemagic → TestFlight setup guide

This is a **one-time, ~30 minute** setup. After it's done, every push to `main` will automatically build, sign, and upload a new TestFlight build for SpecialCarer.

You will not need a Mac at any point.

---

## What you'll do (high level)

1. Create a Codemagic account (free tier — no card)
2. Generate an **App Store Connect API key** (one .p8 file from Apple)
3. Add the key to Codemagic
4. Connect the GitHub repo to Codemagic
5. Trigger the first build

That's it. Codemagic auto-creates the iOS Distribution certificate, provisioning profile, and uploads to TestFlight on its own.

---

## Prerequisites you already have ✅

- Apple Developer account, paid through 18 Feb 2027
- Team ID `2HU3MZAKN7` (ALL CARE 4 U GROUP LTD)
- Bundle ID `com.allcare4ugroup.specialcarer` registered with Push, Sign in with Apple, Associated Domains
- App Store Connect record (Apple ID `6766242271`, name "Special Carer")
- `codemagic.yaml` committed to the repo

---

## Step 1 — Create the App Store Connect API key

This key lets Codemagic talk to App Store Connect on your behalf — uploading builds, managing certificates, fetching provisioning profiles. **Free, takes 3 minutes.**

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>
2. Click the **Team Keys** tab
3. Click the **+** button next to "Active"
4. Fill in:
   - **Name**: `Codemagic CI`
   - **Access**: `App Manager` (this is the lowest role that can upload builds — do **not** pick Admin)
5. Click **Generate**
6. **Download the .p8 file immediately.** It can only be downloaded once. Save it somewhere safe (you'll upload it to Codemagic in step 3).
7. From the same page, copy:
   - **Issuer ID** (a UUID at the top of the page — looks like `69a6de76-…`)
   - **Key ID** (a 10-character code — looks like `ABCD1234EF`)

Make a note of both. You'll paste them into Codemagic next.

---

## Step 2 — Sign up for Codemagic

1. Go to <https://codemagic.io/signup>
2. Sign up with **GitHub** (use the same account that owns `specialcarer-com/specialcarer`)
3. Authorise Codemagic to read your repos when prompted
4. On the dashboard, click **Add application** → pick `specialcarer-com/specialcarer` → **Add application**

Codemagic will detect the `codemagic.yaml` automatically.

---

## Step 3 — Add the App Store Connect API key to Codemagic

1. In Codemagic, click **Teams** (top-left dropdown) → **Personal Account** → **Integrations**
2. Find **Developer Portal** → click **Connect**
3. Fill in:
   - **Name**: `SpecialCarer ASC API key` (this exact name is what `codemagic.yaml` references)
   - **Issuer ID**: paste the UUID from Step 1
   - **Key ID**: paste the 10-char code from Step 1
   - **API key**: drag in the `.p8` file from Step 1
4. Click **Save**

Codemagic will validate the key. If the validation succeeds, you're done with auth setup.

---

## Step 4 — Add internal TestFlight testers

Before the first build, add yourself (and anyone else who should test) as **internal testers** in App Store Connect:

1. Go to <https://appstoreconnect.apple.com/apps>
2. Open **Special Carer**
3. **TestFlight** tab → **Internal Testing** (left sidebar) → **+** next to "Internal Testing"
4. Group name: `SpecialCarer Internal` (this name matches `beta_groups` in `codemagic.yaml`)
5. Add the testers (your own Apple ID, and anyone else with access to the team)

Internal testers can install builds **immediately** — no Beta App Review wait.

---

## Step 5 — Trigger the first build

You have two options:

### Option A: Manual trigger from Codemagic
1. In Codemagic, open the SpecialCarer app
2. Click **Start new build** → select branch `main`, workflow `iOS · TestFlight`
3. Click **Start new build**

### Option B: Push a commit
Just push any commit to `main` — the workflow runs automatically.

---

## What happens during the build

The first build takes ~25–35 minutes because Codemagic has to:
- Install npm dependencies
- Run `npx cap add ios` (generates the native iOS project on the build machine)
- Generate icons + splash from `mobile/resources/`
- Apply the privacy manifest + Info.plist usage strings via the workflow
- Run `pod install` (CocoaPods can be slow on the first run)
- Build, archive, and sign the app
- Upload to App Store Connect
- Submit the build to the **SpecialCarer Internal** TestFlight group

You'll get an email when it's done. Subsequent builds take 12–20 minutes.

---

## Step 6 — Install the build on your iPhone

When the build appears in TestFlight (you'll get a "TestFlight: Special Carer was added" email):

1. Install **TestFlight** from the App Store on your iPhone if you haven't already
2. Open the email on the phone, tap **View in TestFlight**
3. Tap **Accept** → **Install**

The app will install. Open it — Capacitor loads `https://www.specialcarer.com` inside the native shell, with push notifications, geolocation, and biometric login wired up.

---

## After the first successful build

You'll need to do these two things **once**, in App Store Connect:

### App Privacy questionnaire
Apple shows a yellow banner saying "App Privacy details required". Click into it and answer the questions. The answers mirror exactly what's in `mobile/ios-overlay/App/App/PrivacyInfo.xcprivacy`. I'll prepare a verbatim crib sheet for you to paste in (separate task).

### Submit for App Review (when ready for public release)
Internal TestFlight does **not** require Apple review. But to ship publicly:
1. Add screenshots (we'll generate these)
2. Fill in app description, keywords, support URL
3. Provide demo account credentials (test family + test caregiver — already in the database)
4. Submit for review

That's the next milestone after we're happy with TestFlight.

---

## Free-tier quota

Codemagic's free plan gives you **500 build minutes per month** on M2 Mac mini instances. Each iOS build uses ~20 minutes, so you can ship roughly **25 builds/month** for free — far more than needed.

If you exceed 500 minutes, builds queue until next month or you can buy a one-off pack. **Do not** purchase anything without checking with me first (per the no-paid-tier rule).

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| "No matching profiles found" | Bundle ID not registered or capabilities missing | Check Apple Developer portal → Identifiers → `com.allcare4ugroup.specialcarer` has Push + Sign in with Apple + Associated Domains ticked |
| "Invalid API key" | Key ID/Issuer ID typo, or key was revoked | Re-check the values in Codemagic Teams → Integrations → Developer Portal |
| "ITMS-90683: Missing purpose string in Info.plist" | A new plugin was added without an updated usage string | Add the missing key to the `merge_string` block in `codemagic.yaml` |
| Build hits CocoaPods version conflict | Capacitor 8 requires a newer Pod | Bump `cocoapods: default` to `cocoapods: 1.15.2` in the YAML |
| TestFlight rejects with "ITMS-90809: Deprecated API Usage" | New required-reason API used | Add it to `PrivacyInfo.xcprivacy` |

---

## Files involved

- [`codemagic.yaml`](../codemagic.yaml) — workflow definition (committed)
- [`mobile/ios-overlay/App/App/PrivacyInfo.xcprivacy`](ios-overlay/App/App/PrivacyInfo.xcprivacy) — applied during build
- [`mobile/ios-overlay/App/App/Info.plist`](ios-overlay/App/App/Info.plist) — usage strings merged via PlistBuddy in the workflow
- [`capacitor.config.ts`](../capacitor.config.ts) — Capacitor config
- `mobile/resources/` — icon + splash source files
