import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SpecialCarer iOS / Android shell.
 *
 * v1 strategy: thin Capacitor wrapper that loads the live Next.js site
 * directly from https://www.specialcarer.com. This keeps the mobile app
 * in lockstep with web releases (every Vercel deploy is instantly live
 * inside the app — no resubmission needed for content/UX changes).
 *
 * Native plugins (push, geolocation, haptics, status bar) are still
 * available because Capacitor injects its bridge into the WebView even
 * when the page is hosted remotely.
 */
const config: CapacitorConfig = {
  appId: "com.allcare4ugroup.specialcarer",
  appName: "Special Carer",
  // Required by the CLI even when using a remote server URL.
  // We ship a tiny offline fallback bundle from `mobile/web` so the app
  // shows brand chrome if the device is offline at first launch.
  webDir: "mobile/web",

  server: {
    // Live web app — Capacitor loads this URL inside the native WebView.
    url: "https://www.specialcarer.com/m",
    // Allow https everywhere; reject mixed content.
    androidScheme: "https",
    iosScheme: "https",
    cleartext: false,
    // Domains the WebView is allowed to navigate to without bouncing
    // out to Safari. Stripe Checkout / OAuth redirects need to stay
    // inside the app for the success callback to work.
    allowNavigation: [
      "specialcarer.com",
      "*.specialcarer.com",
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
    // Show a small white background while web content is loading.
    // White to match the in-app splash overlay (light-themed). Any sliver
    // of native chrome around the WebView at cold launch reads as white,
    // matching the splash stage with no colour seam.
    backgroundColor: "#FFFFFF",
  },

  android: {
    backgroundColor: "#FFFFFF",
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      // White stage matches the in-app SpecialCarerMobileSplash overlay
      // (light theme) so the handoff from native splash → web splash has
      // no colour flash.
      backgroundColor: "#FFFFFF",
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
      // DARK glyphs read on the white splash stage and on the app's
      // white surfaces afterwards — no runtime flip needed.
      style: "DARK",
      backgroundColor: "#FFFFFF",
      // Let the WebView paint behind the status bar so the splash overlay
      // is truly edge-to-edge — no coloured strip at the top.
      overlaysWebView: true,
    },
  },
};

export default config;
