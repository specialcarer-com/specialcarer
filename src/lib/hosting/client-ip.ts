/**
 * Provider-neutral trusted client-IP extraction, for audit trails (admin
 * actions, contract signing, reference consent, timesheet approval) and
 * best-effort rate limiting.
 *
 * Vercel and Cloudflare disagree about which forwarding header is safe to
 * trust as the real client IP:
 *
 * - On Vercel, the platform's own edge sets `x-forwarded-for`; the leftmost
 *   entry is the real client IP and a client cannot get in front of it. There
 *   is no Cloudflare in front, so nothing strips a `CF-Connecting-IP` header a
 *   client sends: it is attacker-controlled and MUST be ignored here.
 * - On Cloudflare Workers, `x-forwarded-for` is NOT rewritten the same way —
 *   a client can send its own `X-Forwarded-For` header and Cloudflare
 *   appends the real IP rather than replacing what is already there, so
 *   blindly trusting the first entry lets a client spoof any IP it likes.
 *   Cloudflare instead guarantees `CF-Connecting-IP`: its edge always
 *   overwrites this header with the true connecting IP before the Worker
 *   sees the request, so a client cannot forge it.
 *
 * So `CF-Connecting-IP` is trusted ONLY when this code is actually running on
 * Cloudflare Workers, detected from the runtime (`navigator.userAgent ===
 * "Cloudflare-Workers"`), which a request cannot influence. Everywhere else
 * (Vercel, Node, tests) it is ignored.
 *
 * Trust order when on Cloudflare: `CF-Connecting-IP` > `X-Forwarded-For`'s
 * first non-empty entry > `X-Real-IP`. Elsewhere: `X-Forwarded-For`'s first
 * non-empty entry > `X-Real-IP` (legacy reverse-proxy convention, kept for
 * parity with the existing call sites).
 *
 * Returns `null` when none are present. Callers decide their own fallback
 * (e.g. a literal `"unknown"` rate-limit bucket, or `null` in an audit row)
 * rather than this module silently picking one.
 */

export type ClientIpHeaders = {
  get(name: string): string | null;
};

export type ExtractClientIpOptions = {
  /**
   * Whether `CF-Connecting-IP` may be trusted. Defaults to
   * `isCloudflareRuntime()`. Exposed so tests can exercise both platforms
   * without faking the global `navigator`.
   */
  trustCfConnectingIp?: boolean;
};

/**
 * True only when running inside Cloudflare Workers (workerd), where the
 * platform edge guarantees `CF-Connecting-IP`. Derived from the runtime, not
 * from request data, so a client cannot make it true.
 */
export function isCloudflareRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

export function extractClientIp(
  headers: ClientIpHeaders,
  options: ExtractClientIpOptions = {},
): string | null {
  const trustCf = options.trustCfConnectingIp ?? isCloudflareRuntime();

  if (trustCf) {
    const cf = headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",").map((entry) => entry.trim()).find((entry) => entry.length > 0);
    if (first) return first;
  }

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  return null;
}
