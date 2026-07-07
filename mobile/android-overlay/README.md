# Android Overlay — SpecialCarer

These files are merged into the Capacitor Android project **after** `npx cap add android` and on every `npx cap sync android`.

Run:

```bash
npx cap sync android && ./scripts/apply-android-overlay.sh
```

## Files

| File | Purpose |
|------|---------|
| `AndroidManifest.xml` | Permissions, deep-link intent filters (`specialcarer://` + App Links), `singleTask` launch mode |
| `colors.xml` | Brand teal `#039EA0` primary colour for native chrome |
| `ic_launcher_background.xml` | Adaptive icon background — brand teal |

## What's covered

### Permissions declared
- `INTERNET` — remote WebView loads `https://www.specialcarers.com/m`
- `POST_NOTIFICATIONS` — FCM push (Android 13+ runtime prompt)
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` — shift tracking + search
- `ACCESS_BACKGROUND_LOCATION` — reserved for active-shift background tracking (Phase 3)
- `CAMERA`, `READ_MEDIA_IMAGES` — profile photo + ID upload via WebView
- `USE_BIOMETRIC` — app-lock via `@capgo/capacitor-native-biometric`
- `VIBRATE` — haptics plugin

### Deep links
- Custom scheme: `specialcarer://m/...` (parity with iOS URL scheme)
- Verified App Links: `https://www.specialcarers.com/m/*` and `https://specialcarers.com/m/*`
  - Requires `/.well-known/assetlinks.json` on production (see `src/app/.well-known/assetlinks.json/route.ts`)
  - Set `ANDROID_APP_LINKS_SHA256` on Vercel with the signing cert fingerprint(s)

### Push notifications
- Requires `android/app/google-services.json` from Firebase Console (gitignored)
- Without it the app builds and runs; push registration is skipped at runtime

## When to revise

Update **AndroidManifest.xml** when you:
- Add a Capacitor plugin that needs a new permission
- Change deep-link hosts or path prefixes
- Add a foreground service for background location (Phase 3)

Re-run `./scripts/apply-android-overlay.sh` after every `cap sync android`.
