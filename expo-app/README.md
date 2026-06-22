# SpecialCarer — Native (Expo)

WebView-shell native app that wraps **specialcarers.com** for iOS + Android, with native background location for live shift tracking.

Architecture chosen: **WebView + native location** — fastest path to App Store review (≈2 weeks) while keeping a single product codebase moving forward.

## What this app does natively

- Hosts the entire web UI inside a `react-native-webview`, with shared cookies so login persists.
- Owns **background GPS** via `expo-location` + `expo-task-manager`. Continues pinging `POST /api/shifts/[id]/ping` while a shift is active even if the app is backgrounded — required for App Store-grade UX.
- Owns **push tokens** via `expo-notifications` (Apple APNs + Firebase FCM under the hood).
- Persists session/token in `expo-secure-store` so the background task can authenticate without the React tree being mounted.

The web app detects the native shell via `window.SpecialCarerNative` (see `src/lib/native-bridge.ts` in the web project) and delegates location + push to the native runtime when available; falls back to the existing browser implementation otherwise.

## Push token registration contract

The native shell registers / revokes push tokens with the web backend on auth transitions:

1. The web app posts `{ type: "auth.session", payload: { userId, role, accessToken? } }` whenever the Supabase session changes (sign-in, sign-out, refresh).
2. On sign-in (transition from `userId: null` → some id) the native shell calls `Notifications.getExpoPushTokenAsync()` and then injects a `fetch('/api/m/push/register', ...)` into the WebView. The fetch piggybacks on the WebView's session cookie — the native side never handles the access token.
3. On sign-out (transition to `userId: null`) the shell injects `fetch('/api/m/push/unregister', { token })`.
4. The web app can also explicitly request a token via `window.SpecialCarerNative.requestPushToken()` — same register path is followed when one is issued.

Endpoints accept `{ platform: 'ios'|'android'|'web', token, device_id?, app_version? }` and upsert on `(user_id, token)`. See `src/lib/push/tokens.ts` and `src/app/api/m/push/*` in the web repo.

## Files

| File | Responsibility |
|------|----------------|
| `App.tsx` | Root, mounts `WebShell`, registers the location task |
| `src/WebShell.tsx` | The `WebView`, postMessage bridge handler |
| `src/bridge.ts` | Web ↔ native message protocol + injected userscript |
| `src/location.ts` | `TaskManager` background location task + permission helpers |
| `src/notifications.ts` | Push token registration + foreground handler |
| `src/deeplink.ts` | Pure helpers for classifying + injecting push deeplinks |
| `__tests__/deeplink.test.ts` | Unit tests for the deeplink helpers |
| `src/storage.ts` | `SecureStore` helpers (session + active booking) |
| `app.json` | Expo config: bundle IDs, permissions, plugins |
| `eas.json` | EAS build profiles + submit credentials |

## Permissions

### iOS (set automatically by `expo-location` plugin)

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `UIBackgroundModes` → `location`, `fetch`

### Android

- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE_LOCATION`
- `POST_NOTIFICATIONS`

A persistent foreground notification appears on Android while tracking is active (Android 8+ requirement for foreground services).

## Push-notification deeplink contract

Every push event delivered to the device — produced by `src/lib/push/notify.ts` on the backend (PR-A2) — **must include a `data.deeplink` string** in its APNs/FCM payload. The Expo shell reads that field in `src/WebShell.tsx` via `Notifications.addNotificationResponseReceivedListener` and routes the tap as follows:

| `data.deeplink` shape | Behaviour |
|---|---|
| `"/m/chat/<id>"` (any in-app path starting with `/`) | `webRef.injectJavaScript("window.location.href = …; true;")` — escaped with `JSON.stringify` so apostrophes/quotes in the path can't break out of the JS string |
| `"https://specialcarers.com/m/track/xyz"` (absolute URL on the configured `webOrigin`) | Same as above — origin stripped, navigated in-WebView |
| `"tel:+44…"`, `"mailto:…"`, `"sms:…"` | `Linking.openURL` → system handler |
| any other `http(s)://` host | `Linking.openURL` → system browser |
| missing / non-string / `"javascript:…"` | dropped |

Cold-start (app launched by tapping the notification) is handled via `Notifications.getLastNotificationResponseAsync()` + a `pendingDeeplinkRef`: if the WebView isn't yet mounted, the path is stashed and replayed inside the first `onLoadEnd`. Subsequent loads do not re-trigger the cold-start path.

The foreground notification handler in `src/notifications.ts` returns `shouldShowBanner: true` / `shouldShowList: true` / `shouldPlaySound: true` / `shouldSetBadge: true` so push events are **not** suppressed while the app is open — the user still sees the banner and can tap it.

The deeplink helpers live in `src/deeplink.ts` and are unit-tested in `__tests__/deeplink.test.ts`.

## Local development

```bash
cd expo-app
npm install
# iOS Simulator (requires macOS + Xcode)
npm run ios
# Android emulator
npm run android
# Or scan with Expo Go on a physical device
npm start
```

Local dev points the WebView at `https://specialcarers.com` by default. To point at a local Next dev server, set the `webOrigin` in `app.json` → `extra` to `http://localhost:3000` (and run `npx expo start --tunnel` if testing on a real device).

## EAS build + submit

```bash
# One-time setup
npm install -g eas-cli
eas login                  # use Expo account: allcare4u
eas init                   # creates EAS project, fills in projectId/updates URL
eas credentials            # configure iOS Apple cert + Android keystore

# Internal testing builds
npm run build:ios:preview     # produces .ipa for TestFlight internal
npm run build:android:preview # produces .apk for direct install

# Production builds
npm run build:production      # both platforms

# Submit
npm run submit:ios            # → App Store Connect → TestFlight
npm run submit:android        # → Google Play Console internal track
```

After `eas init`, replace these placeholders in `app.json`:

- `extra.eas.projectId`
- `updates.url`

And in `eas.json`, fill in:

- `submit.production.ios.ascAppId` (App Store Connect app ID)
- `submit.production.ios.appleTeamId`
- `submit.production.android.serviceAccountKeyPath` (drop `play-service-account.json` into this folder — already gitignored)

## App Store / Play Store prerequisites

See `STORE-PREREQUISITES.md` for the full enrollment + asset checklist.
