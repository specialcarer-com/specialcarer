# Android development — SpecialCarer

Capacitor 8 thin shell that loads the live Next.js mobile surface at `https://www.specialcarers.com/m` — same strategy as iOS. Web content updates ship via Vercel; native rebuilds are only needed for plugin, permission, or shell changes.

## Architecture

| Layer | Technology |
|-------|------------|
| Mobile UI | Next.js 15 `/m/*` routes (remote WebView) |
| Native shell | Capacitor 8 (`capacitor.config.ts`) |
| Auth | Supabase cookie session in WebView |
| Native plugins | Push, geolocation, biometrics, status bar, browser, haptics, preferences |
| Bundle ID | `com.allcare4ugroup.specialcarer` |

The `expo-app/` directory is a **legacy/alternate** WebView shell design. Production iOS uses Capacitor (Codemagic). Android follows the same Capacitor path for parity.

## Prerequisites

1. **Node.js 22** (matches CI)
2. **Android Studio** (latest stable) with:
   - Android SDK Platform 36
   - Android SDK Build-Tools
   - Android Emulator (API 34+ recommended)
3. **Java 17** (bundled with Android Studio)

Set environment variables (add to `~/.bashrc` or `~/.zshrc`):

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

## First-time setup

```bash
# From repo root
npm ci

# Generate android/ if missing (already committed after foundation slice)
npx cap add android   # idempotent — skips if android/ exists

# Brand icons + splash from mobile/resources/
npx capacitor-assets generate --android --assetPath mobile/resources

# Sync Capacitor plugins + offline fallback bundle
npx cap sync android

# Re-apply permissions, deep links, brand colours
./scripts/apply-android-overlay.sh
```

### Firebase / push (optional for local dev)

Push requires `android/app/google-services.json` from the Firebase project linked to `com.allcare4ugroup.specialcarer`. Place the file locally (gitignored). Without it:

- The app **builds and runs**
- `CapacitorShell` skips push registration gracefully

Obtain from: Firebase Console → Project settings → Your apps → Android → Download `google-services.json`.

### App Links verification (production)

Serve `/.well-known/assetlinks.json` with the app signing certificate SHA-256:

```bash
# Debug keystore fingerprint (local emulator)
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA256
```

Set on Vercel:

```
ANDROID_APP_LINKS_SHA256=AB:CD:EF:...
```

Multiple fingerprints (debug + release) can be comma-separated.

## Run on emulator or device

```bash
# Open Android Studio
npm run cap:open:android

# Or CLI build + deploy to a running emulator
npm run cap:run:android
```

In Android Studio: select a device → **Run** (▶).

The WebView loads `https://www.specialcarers.com/m`. Sign in with a test account to verify session cookies persist across app restarts.

### Point at a local Next.js dev server (optional)

Edit `capacitor.config.ts` temporarily:

```ts
server: {
  url: "http://10.0.2.2:3000/m",  // Android emulator → host machine
  cleartext: true,
  androidScheme: "http",
},
```

Run `npm run dev` on the host, then `npx cap sync android` and rebuild.

## npm scripts

| Script | Action |
|--------|--------|
| `npm run cap:add:android` | `cap add android` (first time) |
| `npm run cap:sync:android` | `cap sync android` + overlay |
| `npm run cap:open:android` | Open project in Android Studio |
| `npm run cap:run:android` | Build and deploy to device/emulator |
| `npm run cap:assets:android` | Regenerate icons/splash |
| `npm run mobile:android:setup` | Full setup chain (deps → assets → sync → overlay) |

## Debug signing

Debug builds use the default Android debug keystore (`~/.android/debug.keystore`). No extra config needed for emulator testing.

Release signing (Play Store) uses a dedicated upload keystore — see Phase 4 in the delivery plan below.

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED` | Vercel + Codemagic (future) | Biometric app-lock on `/m` |
| `ANDROID_APP_LINKS_SHA256` | Vercel | App Links `assetlinks.json` fingerprints |
| `FCM_SERVER_KEY` / Firebase Admin | Vercel (Phase 3) | Server-side FCM push delivery |
| `EXPO_ACCESS_TOKEN` | Vercel (today) | iOS push via Expo — **not** used for Capacitor Android tokens |

Client-side auth uses Supabase public keys already configured for web (`NEXT_PUBLIC_SUPABASE_*`).

## Platform feature status (foundation slice)

| Feature | Android status | Notes |
|---------|----------------|-------|
| Sign in / sign out | ✅ Ready | Supabase cookie auth in WebView |
| Session restore | ✅ Ready | Same as iOS remote WebView |
| Navigation | ✅ Ready | Next.js `/m/*` client routing |
| Deep linking | 🟡 Partial | `specialcarer://` + intent filters wired; App Links need `assetlinks.json` + release cert |
| Push notifications | 🟡 Partial | Client registration wired; **server FCM sender not yet implemented** |
| Permissions | ✅ Declared | Runtime prompts on first use |
| Camera / photo upload | ✅ Ready | WebView file input + manifest permissions |
| Location | 🟡 Partial | Foreground via browser geolocation API; background native tracking is Phase 3 |
| Payments (Stripe) | ✅ Ready | Checkout opens system browser via `CapacitorShell` |
| Biometrics (app lock) | ✅ Ready | Fingerprint / face via `@capgo/capacitor-native-biometric` when flag enabled |

## Known limitations

1. **Push delivery**: Backend `notify.ts` dispatches via Expo Push API. Capacitor Android registers FCM tokens — a dedicated FCM sender (or unified dispatcher) is required before Android push works end-to-end.
2. **Background location**: iOS declares `UIBackgroundModes: location`; Android needs a foreground service for parity during active shifts. Web geolocation pauses when the app is backgrounded.
3. **No Android CI yet**: iOS has Codemagic workflows; Android CI (Gradle build on Linux) is Phase 4.
4. **`google-services.json` not in repo**: Each developer / CI runner must add it for push.
5. **Sign in with Apple**: Available on iOS; Android users use email/password (no change needed).
6. **`native-bridge.ts` / Expo shell**: `window.SpecialCarerNative` bridge is Expo-only. Capacitor uses plugins directly via `CapacitorShell`.

## Phased delivery plan

### Phase 1 — Android foundation / buildable app (this PR)
- [x] Capacitor `android/` project generated and committed
- [x] Permissions, deep-link intent filters, brand assets
- [x] `CapacitorShell` — push register, deeplinks, Stripe external browser
- [x] `assetlinks.json` route stub
- [x] Local dev documentation

### Phase 2 — Core feature parity
- FCM server-side push dispatcher (route `platform=android` tokens to FCM, iOS to APNs/Expo)
- End-to-end push tap → deeplink QA on physical device
- Memberships / carer checkout flows QA on Android
- Biometric lock QA with `NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED=true`
- App Links verified on production with release + debug fingerprints

### Phase 3 — Native integrations hardening
- Background location foreground service (active shift tracking parity with iOS)
- SOS + shift ping reliability when screen locked
- File upload / camera edge cases (WebView permission grants)
- ProGuard / R8 rules if needed
- Firebase Cloud Messaging production project + server keys on Vercel

### Phase 4 — Play Store readiness and release ops
- Codemagic or GitHub Actions `android-build` workflow
- Play Console app record, internal testing track
- Upload keystore + Play App Signing
- Data safety form + privacy policy alignment (`mobile/APP_PRIVACY_QUESTIONNAIRE.md`)
- `android-v*` tag discipline (mirror iOS `ios-v*` guard)
- Play Store listing assets

## Troubleshooting

**Gradle sync fails** — Open Android Studio → SDK Manager → install API 36 platform.

**White screen** — Check device network; WebView loads remote URL. Try offline fallback: airplane mode at cold start should show `mobile/web/index.html`.

**Push never registers** — Confirm `google-services.json` is present and `POST_NOTIFICATIONS` was granted.

**App Links open in Chrome** — `assetlinks.json` must include the **same signing cert** as the installed APK. Debug builds need the debug fingerprint on Vercel.

## Related docs

- `capacitor.config.ts` — shared iOS/Android Capacitor config
- `mobile/ios-overlay/README.md` — iOS permission parity reference
- `docs/ios-release-runbook.md` — iOS release discipline (mirror for Android in Phase 4)
- `mobile/APP_PRIVACY_QUESTIONNAIRE.md` — store privacy answers
