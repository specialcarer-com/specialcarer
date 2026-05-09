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
    // Dark teal so any sliver of native chrome around the WebView matches
    // the in-app splash overlay (#06151a). Previously white — caused white
    // strips above/below the splash on iOS during cold launch.
    backgroundColor: "#06151a",
  },

  android: {
    backgroundColor: "#06151a",
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      // Dark teal stage matches the in-app SpecialCarerMobileSplash
      // overlay (src/app/m/_components/SplashIntro.tsx) so the handoff
      // from native splash → web splash has no colour flash. The native
      // PNG (mobile/resources/splash-dark.png) already has teal baked in.
      backgroundColor: "#06151a",
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
      // Light glyphs on the dark teal splash. Cold launch lands on a
      // dark stage; once the splash fades into the app the device's
      // light theme keeps these readable on the white app chrome
      // (white-on-light is still legible in iOS due to glyph weight,
      // and most signed-in surfaces use a tinted brand header).
      style: "LIGHT",
      backgroundColor: "#06151a",
      // Let the WebView paint behind the status bar so the splash overlay
      // is truly edge-to-edge — no white strip at the top.
      overlaysWebView: true,
    },
  },
};

export default config;
