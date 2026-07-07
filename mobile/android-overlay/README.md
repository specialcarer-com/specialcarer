# Android Overlay — SpecialCarer

These files are merged into the Capacitor-generated `android/` project **after**
`npx cap add android` and `npx cap sync android`.

Run `npm run mobile:bootstrap:android` to generate the project, apply overlays,
and sync plugins in one step.

## Files

| Path | Purpose |
|------|---------|
| `App/src/main/AndroidManifest.xml` | Permissions, deep-link intent filters, FileProvider |
| `App/src/main/res/values/colors.xml` | Brand teal `#039EA0` for native chrome |
| `App/src/main/res/xml/network_security_config.xml` | HTTPS-only in prod; cleartext allowed for `10.0.2.2` / `localhost` local dev |

## Permissions declared

- `INTERNET` — remote WebView (`https://www.specialcarers.com/m`)
- `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` — shift tracking, carer search (browser geolocation in WebView)
- `POST_NOTIFICATIONS` — Android 13+ push (plugin registered; FCM wiring is Sprint 2)
- `USE_BIOMETRIC` — app-lock via `@capgo/capacitor-native-biometric`
- `CAMERA` — ID verification / profile photo (WebView file picker)
- `READ_MEDIA_IMAGES` — photo library picker (Android 13+)
- `VIBRATE` — haptics plugin

## Deep links

- **Custom scheme:** `specialcarer://` (parity with iOS URL scheme)
- **App Links (HTTPS):** `https://www.specialcarers.com/m/*` — requires
  `/.well-known/assetlinks.json` on the domain (Play Store Sprint 4).

## When to revise

- Add a permission whenever a new Capacitor plugin or WebView capability prompts the OS.
- Update `network_security_config.xml` if local dev hostnames change.
- Add `google-services.json` to `android/app/` when FCM push is wired (do not commit secrets).
