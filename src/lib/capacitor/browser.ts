/**
 * Open a URL in the system browser on Capacitor native shells, or via
 * window navigation on web. Used for Stripe Checkout and OAuth flows that
 * must not run inside the in-app WebView.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
      return;
    }
  } catch {
    /* fall through to web */
  }

  window.location.assign(url);
}

/** True when the URL should leave the in-app WebView (Stripe, OAuth, etc.). */
export function shouldOpenExternally(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "checkout.stripe.com" || host.endsWith(".stripe.com")) {
      return true;
    }
    if (host === "accounts.google.com" || host === "appleid.apple.com") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
