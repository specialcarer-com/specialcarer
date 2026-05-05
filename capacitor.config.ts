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
      // White matches mobile/resources/splash.png. The dark variant
      // (splash-dark.png) ships with its own teal background baked in.
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
      style: "DARK",
      backgroundColor: "#FFFFFF",
      overlaysWebView: false,
    },
  },
};

export default config;
