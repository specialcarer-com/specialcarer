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
    // Teal #0E7C7B — matches LaunchScreen.storyboard so cold-launch has
    // no colour seam between native splash and SplashScreen plugin frame.
    backgroundColor: "#0E7C7B",
  },

  android: {
    // Teal #0E7C7B — matches LaunchScreen.storyboard so cold-launch has
    // no colour seam between native splash and SplashScreen plugin frame.
    backgroundColor: "#0E7C7B",
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      // Teal #0E7C7B — matches LaunchScreen.storyboard so cold-launch has
      // no colour seam between native splash and SplashScreen plugin frame.
      backgroundColor: "#0E7C7B",
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
      // LIGHT glyphs read on the teal splash stage. Switched from DARK
      // when the cold-launch background moved to teal to remove the
      // white flash before the SplashScreen plugin frame.
      style: "LIGHT",
      // Teal #0E7C7B — matches LaunchScreen.storyboard so cold-launch has
      // no colour seam between native splash and SplashScreen plugin frame.
      backgroundColor: "#0E7C7B",
      // Let the WebView paint behind the status bar so the splash overlay
      // is truly edge-to-edge — no coloured strip at the top.
      overlaysWebView: true,
    },
  },
};

export default config;
