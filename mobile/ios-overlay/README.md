# iOS Overlay — SpecialCarer

These files must be merged into the native iOS project **after** `npx cap add ios` has generated `ios/App/App/` on a Mac.

## Files

- **`App/App/PrivacyInfo.xcprivacy`** — Apple Privacy Manifest. Declares all collected data types and required-reason API usage. Required for App Store submission since 1 May 2024.
- **`App/App/Info.plist`** — Full Info.plist with all required `*UsageDescription` strings. **MERGE** the usage strings into your existing Info.plist (do not blindly overwrite — Capacitor adds keys you want to keep).

## How to install on the Mac

After running `npx cap add ios` for the first time, copy these files in:

```bash
cp mobile/ios-overlay/App/App/PrivacyInfo.xcprivacy ios/App/App/
# Open ios/App/App/Info.plist in Xcode and merge the keys from
# mobile/ios-overlay/App/App/Info.plist (the *UsageDescription block
# and UIBackgroundModes are the critical additions).
```

Then in Xcode:

1. Right-click the **App** group in the Project Navigator → **Add Files to "App"** → select `PrivacyInfo.xcprivacy`. Make sure **Target Membership: App** is checked.
2. Open **App ▸ Signing & Capabilities** and add:
   - **Push Notifications**
   - **Sign in with Apple**
   - **Associated Domains** (`applinks:specialcarer.com`, `applinks:www.specialcarer.com`)
   - **Background Modes** → tick *Remote notifications*, *Background fetch*, *Location updates*

## What's covered

### Privacy manifest data types
- Account: name, email, phone
- Address (home location for matching)
- Location: precise + coarse (live shift tracking)
- Contacts (refer-a-friend, optional)
- Payment info (Stripe customer/account IDs only)
- Sensitive info (ID document for DBS/Checkr)
- Photos/videos (profile + ID upload)
- Other user content (booking messages)
- Device ID (APNs push token)
- Product interaction, crash data, performance data (analytics)

### Required-reason APIs
- `UserDefaults` (CA92.1) — Capacitor Preferences plugin
- `FileTimestamp` (C617.1) — WKWebView caching, file plugin
- `SystemBootTime` (35F9.1) — JWT/timestamp helpers
- `DiskSpace` (E174.1) — WKWebView cache management

### Info.plist usage strings
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationAlwaysUsageDescription` (legacy compat)
- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription`
- `NSPhotoLibraryAddUsageDescription`
- `NSContactsUsageDescription`
- `NSFaceIDUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSUserTrackingUsageDescription` (declared but not requested)

Plus `UIBackgroundModes` (remote-notification, fetch, location) and the URL scheme `specialcarer://` for deep links.

## When to revise

Update **PrivacyInfo.xcprivacy** whenever you:
- Add a plugin that calls a new required-reason API
- Start collecting a new data type (e.g. health data, browsing history)
- Add an analytics/marketing SDK (each SDK declares its own manifest, but check it doesn't mark `NSPrivacyTracking = true`)

Update **Info.plist** whenever you add a capability that prompts the OS for permission (e.g. HealthKit, Calendar, Reminders, Bluetooth).
