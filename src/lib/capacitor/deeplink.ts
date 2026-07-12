/**
 * Capacitor WebView deeplink helpers.
 *
 * Push notifications and App Links deliver a `deeplink` string (see
 * `src/lib/push/notify.ts`). These pure functions classify the target so
 * CapacitorShell can route inside the WebView or hand off to the OS browser.
 */

export const WEB_DEEPLINK_ORIGIN_DEFAULT = "https://www.specialcarers.com";

export type DeeplinkRoute =
  | { kind: "web"; path: string }
  | { kind: "external"; url: string }
  | { kind: "invalid" };

/**
 * Classify a deeplink. Paths starting with "/" stay in-app. Known external
 * schemes and non-site https URLs open via the system browser.
 */
export function classifyDeeplink(
  raw: unknown,
  webOrigin: string = WEB_DEEPLINK_ORIGIN_DEFAULT,
): DeeplinkRoute {
  if (typeof raw !== "string" || raw.length === 0) return { kind: "invalid" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "invalid" };

  if (trimmed.startsWith("/")) return { kind: "web", path: trimmed };

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    return { kind: "invalid" };
  }

  const externalSchemes = ["tel:", "mailto:", "sms:", "facetime:"];
  for (const scheme of externalSchemes) {
    if (lower.startsWith(scheme)) {
      return { kind: "external", url: trimmed };
    }
  }

  if (trimmed.startsWith("specialcarer://")) {
    try {
      const u = new URL(trimmed.replace("specialcarer://", "https://specialcarer.local/"));
      const path = `${u.pathname}${u.search}${u.hash}`;
      return path.length > 0 ? { kind: "web", path } : { kind: "web", path: "/m" };
    } catch {
      return { kind: "invalid" };
    }
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      const allowedHosts = new Set([
        new URL(webOrigin).host,
        "specialcarers.com",
        "www.specialcarers.com",
      ]);
      if (allowedHosts.has(u.host)) {
        return { kind: "web", path: `${u.pathname}${u.search}${u.hash}` };
      }
      return { kind: "external", url: trimmed };
    } catch {
      return { kind: "invalid" };
    }
  }

  return { kind: "invalid" };
}

/** Normalize an App / universal link URL into an in-app path when possible. */
export function pathFromAppUrl(
  url: string,
  webOrigin: string = WEB_DEEPLINK_ORIGIN_DEFAULT,
): string | null {
  const route = classifyDeeplink(url, webOrigin);
  if (route.kind === "web") return route.path;
  return null;
}
