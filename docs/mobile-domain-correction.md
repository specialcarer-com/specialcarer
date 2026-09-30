# Mobile singular-domain correction

Prepared from `main` for `fix/mobile-singular-domain`. This is a source correction only: no native build, release, deployment, DNS, secret or live automation change is included.

## Changed

- Android App Links: both the committed manifest and overlay now declare `specialcarer.com` and `www.specialcarer.com`, retaining their existing HTTPS `/m` scope.
- Capacitor: default server URL is `https://www.specialcarer.com/m`; navigation entries use the singular domain and are deduplicated. Stripe, Apple and Google entries and the local-development override are unchanged.
- Expo: configured web origin and WebShell, location and deep-link fallbacks use `https://specialcarer.com`.
- Deep links: Capacitor recognises singular apex and www hosts. Neither helper treats the old plural domain as an in-app host by default.
- Offline shell: retry points to the singular Capacitor URL.
- iOS setup instructions: Associated Domains now specify `applinks:specialcarer.com` and `applinks:www.specialcarer.com`.

## iOS limitation

There is no tracked iOS project or `.entitlements` file on this branch. The checked-in Associated Domains entries are setup instructions, not evidence of the currently signed app's entitlements. This change does not claim to modify an existing binary or Apple Developer configuration. The generated Xcode project's actual entitlements must be verified separately before the next authorised native release.

## Verification

- `npm run test:mobile-domains`: 26 tests passed.
- `npm run typecheck -- --incremental false`: passed.
- Scoped search: no plural-domain references remain in the modified native/mobile runtime configuration, except intentional legacy-host negative tests.
- No device-level App Links or Universal Links verification was performed.

Historical documents, store-listing copy, test-account email addresses and unrelated server-side URLs were not bulk-rewritten. The singular apex/www distinction follows the existing configuration: Capacitor uses www, Expo uses apex.
