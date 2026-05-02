# App Store + Play Store launch checklist

Generated for SpecialCarer (All Care 4 U Group Ltd). Items marked **YOU** require user action; items marked **DEV** are codebase-side.

## 1. Apple Developer enrollment — **YOU**

- [ ] Sign up at <https://developer.apple.com/programs/enroll/> as **organisation** (not individual).
- [ ] Cost: **$99/year**.
- [ ] Required: Apple ID, D-U-N-S number for All Care 4 U Group Ltd. Get a free D-U-N-S at <https://developer.apple.com/enroll/duns-lookup/>. Lookup itself is free; if not in the database, request one (takes 5 working days).
- [ ] Verification by Apple typically takes 24–48h after enrolment fee is paid; can take longer if D-U-N-S has to be issued.
- [ ] Once approved, note down your **Team ID** (10-character code, top-right of <https://developer.apple.com/account/>) — paste into `eas.json` → `submit.production.ios.appleTeamId`.

## 2. Apple App Store Connect setup — **YOU**

- [ ] At <https://appstoreconnect.apple.com>, create a new app.
- [ ] Bundle ID: `co.uk.allcare4u.specialcarer` (matches `app.json`).
- [ ] App name: SpecialCarer.
- [ ] Primary language: English (UK).
- [ ] SKU: `specialcarer-001` (any unique string).
- [ ] Note the **Apple ID** that App Store Connect generates (10-digit number) — paste into `eas.json` → `submit.production.ios.ascAppId`.
- [ ] Under **Privacy → Data collection**, declare:
  - Location (precise) — *App Functionality*, linked to user identity (caregivers only, during shifts).
  - Contact info (name, email, phone) — *App Functionality*.
  - Identifiers (User ID) — *App Functionality, Analytics*.
  - Financial info (collected by Stripe, not us) — *App Functionality*.
- [ ] Under **App Privacy → Account Deletion**, link to `https://specialcarer.com/account/delete` (already shipped).

## 3. Google Play Console enrollment — **YOU**

- [ ] Sign up at <https://play.google.com/console/signup> as **organisation**.
- [ ] Cost: **$25 one-time**.
- [ ] Required: D-U-N-S number (same as Apple) + a personal credit card for verification (Google does not charge it beyond the $25).
- [ ] Verification typically takes 1–3 business days.

## 4. Google Play Console app setup — **YOU**

- [ ] Create new app.
- [ ] App name: SpecialCarer.
- [ ] Default language: English (United Kingdom).
- [ ] App or game: App.
- [ ] Free or paid: Free.
- [ ] Package name: `co.uk.allcare4u.specialcarer` (matches `app.json`).
- [ ] **Account deletion URL**: `https://specialcarer.com/account/delete` (Play Console requires this; already shipped).
- [ ] Generate a **service account JSON** in Google Cloud Console for EAS to upload builds:
  1. Cloud Console → IAM → Service Accounts → Create.
  2. Grant role **Service Account User**.
  3. Create key → JSON → download.
  4. In Play Console → Setup → API access → link the service account → grant **Release manager** permission.
  5. Save the JSON as `expo-app/play-service-account.json` (already gitignored).

## 5. Privacy policy + terms — **YOU + DEV**

- [ ] **Privacy policy** — required by both stores. Hosted at `https://specialcarer.com/privacy`. *Status: not yet built — recommend a generated baseline (Termly / iubenda) reviewed by counsel.*
- [ ] **Terms of service** — `https://specialcarer.com/terms`. *Status: not yet built.*
- [ ] **Account deletion page** — `https://specialcarer.com/account/delete`. ✅ Shipped.
- [ ] **Background location justification** — Apple now flags background location aggressively. The submission must explain *why* in plain language. Recommended copy is in `app.json` `infoPlist` strings already; mirror in the App Store Connect "App Privacy" section under each location key.

## 6. Store assets — **YOU**

### iOS

- [ ] App icon: 1024×1024 PNG, no transparency, no rounded corners (Apple applies them).
- [ ] Screenshots: at least one set for each required device class — 6.7" iPhone (1290×2796), iPad Pro 12.9" (2048×2732). Easy path: take screenshots from a 6.7" Simulator running the WebView shell.
- [ ] Marketing assets (App Preview video) optional.

### Android

- [ ] App icon: 512×512 PNG.
- [ ] Feature graphic: 1024×500 PNG.
- [ ] Screenshots: at least 2 phone screenshots (16:9 or 9:16, 320–3840 px on each side).

## 7. Background-location pre-flight (Apple) — **DEV (done) + YOU**

Apple rejects ~30% of first-time submissions that request background location. Mitigations:

- **DEV done**: We only request `Always` permission *after* `When in Use` is granted, and only when the user taps "Start sharing my location" on a paid + active booking.
- **DEV done**: Window is hard-clamped server-side to `shift_start - 15min … shift_end + 15min`.
- **DEV done**: Foreground service notification on Android.
- **YOU**: In App Store Connect "App Review" notes, paste:
  > SpecialCarer is a marketplace for in-home caregivers. Background location is only requested for the caregiver role, only after a paid booking is confirmed, and is automatically clamped to the booking's scheduled hours plus 15 minutes. Test caregiver account: caregiver-test@specialcarer.com / TestCare!2026. Test booking ID is pre-confirmed for review.

## 8. EAS submit credentials — **DEV + YOU**

After steps 1–4 are complete:

- [ ] `eas credentials` → iOS → upload Apple distribution cert + provisioning profile (or let EAS generate them for you, recommended).
- [ ] `eas credentials` → Android → generate or upload upload-keystore.

## 9. Post-launch monitoring — **DEV**

- [ ] Sentry / Bugsnag native crash reporting (not yet wired — small follow-up).
- [ ] Expo Updates channel mapped to `production` (config already in `app.json`).
- [ ] Stripe webhook + uCheck/Checkr webhooks should fan out push notifications via the new Expo push token registration flow (server-side wiring is the next dev iteration after first build).

---

**Estimated end-to-end timeline**: 14–21 days from today, gated mostly on Apple (D-U-N-S + enrolment 1 week, build + review 1 week). Google can ship in parallel and is usually ready in 5–7 days.
