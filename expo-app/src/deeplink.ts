/**
 * Push-notification deeplink handling.
 *
 * Every push event produced by the backend (see `src/lib/push/notify.ts` in the
 * web app, landed in PR-A2) includes a `data.deeplink` string. That string is
 * either:
 *   - an in-app path like "/m/chat/abc-123" → routed inside the WebView
 *   - an external scheme (tel:, mailto:, sms:) or a non-specialcarer http(s) URL
 *     → opened via `Linking.openURL`
 *
 * This module is intentionally a set of *pure* helpers so they can be unit
 * tested without spinning up the RN bridge. The wiring into `Notifications`
 * lives in `WebShell.tsx`.
 */
export const WEB_DEEPLINK_ORIGIN_DEFAULT = "https://specialcarer.com";

export type DeeplinkRoute =
  | { kind: "web"; path: string }
  | { kind: "external"; url: string }
  | { kind: "invalid" };

/**
 * Classify a deeplink. We treat anything starting with "/" as an in-app path,
 * known external schemes as external, and full URLs as external unless their
 * origin matches the configured web origin (in which case we strip to a path
 * and route inside the WebView).
 */
export function classifyDeeplink(
  raw: unknown,
  webOrigin: string = WEB_DEEPLINK_ORIGIN_DEFAULT,
): DeeplinkRoute {
  if (typeof raw !== "string" || raw.length === 0) return { kind: "invalid" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "invalid" };

  if (trimmed.startsWith("/")) return { kind: "web", path: trimmed };

  const externalSchemes = ["tel:", "mailto:", "sms:", "facetime:"];
  for (const scheme of externalSchemes) {
    if (trimmed.toLowerCase().startsWith(scheme)) {
      return { kind: "external", url: trimmed };
    }
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      const o = new URL(webOrigin);
      if (u.origin === o.origin) {
        return { kind: "web", path: `${u.pathname}${u.search}${u.hash}` };
      }
      return { kind: "external", url: trimmed };
    } catch {
      return { kind: "invalid" };
    }
  }

  return { kind: "invalid" };
}

/**
 * Build the JS snippet that navigates the WebView to the given path. Uses
 * `JSON.stringify` so single quotes, backslashes, unicode and newlines in the
 * deeplink can't break out of the string literal. The trailing `true;` is the
 * RN-WebView convention to suppress a console warning about the return value.
 */
export function buildNavigationScript(path: string): string {
  return `window.location.href = ${JSON.stringify(path)}; true;`;
}
