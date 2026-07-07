import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Optional override for local Android/iOS emulator dev.
 * Production builds leave this unset so the WebView loads live Vercel.
 *
 * Android emulator → host machine:  CAPACITOR_SERVER_URL=http://10.0.2.2:3000/m
 * iOS simulator → host machine:     CAPACITOR_SERVER_URL=http://localhost:3000/m
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ?? "https://www.specialcarers.com/m";
const cleartext = serverUrl.startsWith("http://");

/**
 * SpecialCarer iOS / Android shell.
 *
 * v1 strategy: thin Capacitor wrapper that loads the live Next.js site
 * directly from https://www.specialcarers.com. This keeps the mobile app
 * in lockstep with web releases (every Vercel deploy is instantly live
 * inside the app — no resubmission needed for content/UX changes).
 *
 * Native plugins (push, geolocation, haptics, status bar) are still
 * available because Capacitor injects its bridge into the WebView even
 * when the page is hosted remotely.
 */
const config: CapacitorConfig = {
  appId: "com.allcare4ugroup.specialcarer",
  appName: "Special Carers",
  // Required by the CLI even when using a remote server URL.
  // We ship a tiny offline fallback bundle from `mobile/web` so the app
  // shows brand chrome if the device is offline at first launch.
  webDir: "mobile/web",

  server: {
    // Live web app — Capacitor loads this URL inside the native WebView.
    // Canonical production hostname is www.specialcarers.com (plural).
    // The singular specialcarers.com 308-redirects here; pointing the
    // WebView directly at the canonical host avoids a cross-domain
    // bounce that would be blocked by allowNavigation.
    url: serverUrl,
    // Allow https everywhere; permit http only when CAPACITOR_SERVER_URL is http (local dev).
    androidScheme: cleartext ? "http" : "https",
    iosScheme: cleartext ? "http" : "https",
    cleartext,
    // Domains the WebView is allowed to navigate to without bouncing
    // out to Safari. Stripe Checkout / OAuth redirects need to stay
    // inside the app for the success callback to work.
    allowNavigation: [
      "specialcarers.com",
      "*.specialcarers.com",
      "specialcarers.com",
      "*.specialcarers.com",
      "checkout.stripe.com",
      "*.stripe.com",
      "appleid.apple.com",
      "accounts.google.com",
    ],
  },

  ios: {
    // Allow remote pages to access JS bridge (required for plugins).
    limitsNavigationsToAppBoundDomains: false,
    contentInset: "automatic",
    // Brand teal background while web content is loading. Any sliver of
    // native chrome around the WebView at cold launch reads as brand
    // teal, matching the hands-open splash stage with no colour seam.
    backgroundColor: "#039EA0",
  },

  android: {
    backgroundColor: "#039EA0",
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      // 2500ms holds the native teal splash long enough for the
      // remote WebView bundle to land, eliminating the white flash
      // between native splash dismissal and React mount.
      launchShowDuration: 2500,
      launchAutoHide: true,
      // Brand teal stage matches the in-app SpecialCarerHandsOpenSplash
      // overlay so the handoff from native splash → web splash is
      // pixel-identical (both paint #039EA0 with the closed-hands pose).
      backgroundColor: "#039EA0",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      // We register on first launch after the user signs in.
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      // LIGHT glyphs read on the brand-teal splash stage. The
      // StatusBarController flips to DARK once the splash fades and
      // the app's white surfaces take over.
      style: "LIGHT",
      backgroundColor: "#039EA0",
      // Let the WebView paint behind the status bar so the splash overlay
      // is truly edge-to-edge — no coloured strip at the top.
      overlaysWebView: true,
    },
  },
};

export default config;
