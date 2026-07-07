# Android — SpecialCarer Mobile

SpecialCarer Android uses the **same Capacitor 8 thin-shell architecture as iOS**: a native WebView loads the live Next.js `/m` surface from Vercel. Web UX ships instantly on every deploy; the native APK only needs rebuilding when native config or plugins change.

**Bundle ID:** `com.allcare4ugroup.specialcarer` (matches iOS)

---

## Architecture summary

| Layer | Technology | Notes |
|-------|------------|-------|
| UI | Next.js 15 `/m/*` (remote) | Shared with iOS and mobile web |
| Shell | Capacitor 8 | `@capacitor/android` |
| Auth | Supabase cookie session | Same as web; `flow=mobile` on email links |
| Offline fallback | `mobile/web/index.html` | Brand chrome when network unavailable at cold start |

The legacy `expo-app/` directory is **not** the production path. Do not build a separate Android app from it.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | Same as web repo |
| Java | 17+ | Required by Android Gradle Plugin |
| Android Studio | Latest stable | Install SDK Platform 36, Build-Tools, Emulator |
| ANDROID_HOME | Set in shell | e.g. `~/Library/Android/sdk` (macOS) or `$HOME/Android/Sdk` (Linux) |

### Android Studio setup

1. Install **Android Studio** from https://developer.android.com/studio
2. SDK Manager → install **Android 16 (API 36)** platform + **Android SDK Build-Tools**
3. AVD Manager → create a Pixel device (API 34+ recommended)
4. Add to `~/.bashrc` or `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"   # adjust path for your OS
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

---

## Quick start — run on emulator

```bash
# 1. Install dependencies
npm ci

# 2. Bootstrap Android project (generates android/, syncs plugins, applies overlay)
npm run mobile:bootstrap:android

# 3. Build debug APK
cd android && ./gradlew assembleDebug

# 4. Run on connected device or emulator
cd .. && npx cap run android
```

Or open `android/` in Android Studio → **Run ▶**.

The app loads **production** `https://www.specialcarers.com/m` by default (same as TestFlight).

---

## Local dev against Next.js

Point the WebView at your local dev server:

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — re-sync Capacitor with local URL + rebuild
CAPACITOR_SERVER_URL=http://10.0.2.2:3000/m npm run mobile:bootstrap:android
npx cap run android
```

| Platform | Host loopback alias |
|----------|---------------------|
| Android emulator | `10.0.2.2` → host machine `localhost` |
| Physical device (USB) | Use your machine's LAN IP, e.g. `http://192.168.1.x:3000/m` |

Cleartext HTTP is permitted **only** for `10.0.2.2`, `localhost`, and `127.0.0.1` via `network_security_config.xml`. Production remains HTTPS-only.

---

## Environment variables

### Build-time (Capacitor sync)

| Variable | Default | Purpose |
|----------|---------|---------|
| `CAPACITOR_SERVER_URL` | `https://www.specialcarers.com/m` | WebView entry URL baked into `capacitor.config.json` at sync time |

### Runtime (Vercel — affects `/m` inside WebView)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | — | Auth (required) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Auth (required) |
| `NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED` | `false` | Biometric app-lock (`BiometricLockProvider`) |
| `NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED` | — | Mobile UI redesign gate |

Set `NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED=true` in Vercel production to match iOS TestFlight behaviour.

### Push (Sprint 2 — not wired yet)

| Variable | Purpose |
|----------|---------|
| `google-services.json` | Place in `android/app/` (never commit) |
| FCM server key / service account | Backend dispatch (today uses Expo Push API for iOS tokens) |

---

## Signing & debug setup

### Debug builds

No signing config needed. `./gradlew assembleDebug` produces an installable APK signed with the automatic debug keystore.

### Release builds (Play Store — Phase 4)

1. Generate upload keystore (once, store securely):

```bash
keytool -genkey -v -keystore specialcarer-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias specialcarer
```

2. Create `android/keystore.properties` (gitignored):

```properties
storeFile=../specialcarer-upload.jks
storePassword=<secret>
keyAlias=specialcarer
keyPassword=<secret>
```

3. Wire into `android/app/build.gradle` `signingConfigs` (Phase 4 PR).

**Do not commit keystores or passwords.**

---

## npm scripts

| Script | Action |
|--------|--------|
| `npm run mobile:bootstrap:android` | Full bootstrap: `cap add android`, assets, sync, overlay |
| `npm run cap:add:android` | Add Android platform only |
| `npm run cap:sync:android` | Sync plugins + web assets |
| `npm run cap:assets:android` | Generate icons/splash from `mobile/resources/` |
| `npm run cap:sync` | Sync all platforms |

---

## Platform feature status (Android)

Status as of Android foundation (Phase 1). The `/m` UI is shared; gaps are native-shell wiring.

| Feature | Status | Notes |
|---------|--------|-------|
| **Sign in / sign out** | ✅ Ready | Supabase cookie auth in WebView |
| **Session restore** | ✅ Ready | Cookie persistence in WebView |
| **Navigation** | ✅ Ready | Next.js App Router `/m/*` |
| **Deep linking** | 🟡 Partial | `specialcarer://` + HTTPS intent filters declared; `assetlinks.json` not yet on domain |
| **Push notifications** | ❌ Sprint 2 | Plugin installed; no FCM `google-services.json`; client registration not wired in Capacitor web code |
| **Permissions** | ✅ Declared | Location, camera, biometrics, notifications in overlay manifest |
| **Camera / photo upload** | ✅ Ready | WebView `<input type="file">` proxies to OS picker |
| **Location** | ✅ Ready | Browser `navigator.geolocation` in WebView; Capacitor Geolocation plugin available but unused |
| **Payments (Stripe)** | ✅ Ready | Stripe Checkout stays in WebView (`allowNavigation` includes `checkout.stripe.com`) |
| **Biometrics (app lock)** | 🟡 Ready when flagged | `@capgo/capacitor-native-biometric` + `lock-native.ts` support Android; requires `NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED=true` |
| **Background location** | ❌ iOS-only today | Expo-app had background GPS; Capacitor shell does not |
| **Sign in with Apple** | ❌ N/A on Android | Google OAuth available via web flow |
| **Offline shell** | ✅ Ready | `mobile/web/index.html` |

Legend: ✅ works today · 🟡 partial / flag-gated · ❌ not yet implemented

---

## Known limitations (Phase 1)

1. **No CI build** — iOS has Codemagic; Android CI workflow is Phase 4.
2. **No Play Store listing** — internal testing only until Phase 4.
3. **Push not wired** — backend accepts `platform: 'android'` tokens but Capacitor client never registers.
4. **App Links verification** — HTTPS deep links need `/.well-known/assetlinks.json` on `www.specialcarers.com`.
5. **`native-bridge.ts`** — typed for Expo `SpecialCarerNative`; unused in Capacitor production shell.
6. **`expo-app/` bundle ID differs** — `co.uk.allcare4u.specialcarer` vs Capacitor `com.allcare4ugroup.specialcarer`; do not mix.

---

## iOS-only items needing Android equivalents

| iOS | Android equivalent | Phase |
|-----|-------------------|-------|
| `mobile/ios-overlay/` PrivacyInfo.xcprivacy | Play Data Safety form | Phase 4 |
| Codemagic `ios-build` / TestFlight | Codemagic `android-build` / Play internal testing | Phase 4 |
| APNs push dispatch | FCM + `google-services.json` | Phase 2 |
| Associated Domains (`applinks:`) | `assetlinks.json` + intent filters (declared) | Phase 2 |
| Sign in with Apple capability | Google Sign-In (web OAuth already in `allowNavigation`) | Phase 2 |
| Background location (UIBackgroundModes) | Foreground Service + `ACCESS_BACKGROUND_LOCATION` | Phase 3 |
| `ios-v*` release tags | `android-v*` release tags (proposed) | Phase 4 |

---

## Phased delivery plan

### Phase 1 — Android foundation / buildable app ← **this PR**

- [x] Capacitor Android project bootstrap script
- [x] Android overlay (permissions, deep links, network security, brand colors)
- [x] npm scripts (`cap:add:android`, `cap:sync:android`, `mobile:bootstrap:android`)
- [x] `CAPACITOR_SERVER_URL` for local emulator dev
- [x] Documentation (this file)
- [ ] Manual smoke test on physical device / emulator (requires Android SDK on dev machine)

### Phase 2 — Core feature parity

- Wire Capacitor Push Notifications → `POST /api/m/push/register` with `platform: 'android'`
- Add FCM `google-services.json` + backend FCM dispatch (or unify on Expo push for both)
- Publish `assetlinks.json` for verified App Links
- Enable biometric app-lock in Vercel prod (`NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED=true`)
- Smoke test: auth, bookings, chat, payments, profile on Android

### Phase 3 — Native integrations hardening

- Evaluate Capacitor Geolocation vs browser API for shift tracking accuracy
- Background location (if product requires parity with Expo prototype)
- Haptics on key actions (`@capacitor/haptics`)
- In-app browser for OAuth edge cases (`@capacitor/browser`)
- Sentry Android native crash reporting

### Phase 4 — Play Store readiness & release ops

- Codemagic `android-build` workflow (mirror `ios-build`)
- Play Console app creation + Data Safety questionnaire
- Upload keystore + signing config
- Internal testing track → closed testing → production
- `android-v*` release tag convention
- Play Store listing (reuse `mobile/APP_STORE_LISTING.md` copy, adapted)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `SDK location not found` | Set `ANDROID_HOME` and/or create `android/local.properties` with `sdk.dir=...` |
| White screen on launch | Check network; offline shell should appear. Verify `CAPACITOR_SERVER_URL` if using local dev |
| `cleartext not permitted` | Use `CAPACITOR_SERVER_URL=http://10.0.2.2:3000/m` and re-run bootstrap (not `https://localhost`) |
| Gradle sync fails | Ensure Java 17+, run `cd android && ./gradlew --version` |
| Plugins missing after sync | Re-run `npm run mobile:bootstrap:android` |

---

## Related docs

- `capacitor.config.ts` — shared iOS/Android Capacitor config
- `mobile/ios-overlay/README.md` — iOS overlay (parity reference)
- `mobile/CODEMAGIC_SETUP.md` — iOS CI setup
- `codemagic.yaml` — iOS build workflows
- `.cursorrules` — `/m/*` is the Capacitor mobile flow
