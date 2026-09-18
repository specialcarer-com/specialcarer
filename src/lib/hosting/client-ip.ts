/**
 * Provider-neutral trusted client-IP extraction, for audit trails (admin
 * actions, contract signing, reference consent, timesheet approval) and
 * best-effort rate limiting.
 *
 * Vercel and Cloudflare disagree about which forwarding header is safe to
 * trust as the real client IP:
 *
 * - On Vercel, the platform's own edge sets `x-forwarded-for`; the leftmost
 *   entry is the real client IP and a client cannot get in front of it.
 * - On Cloudflare Workers, `x-forwarded-for` is NOT rewritten the same way —
 *   a client can send its own `X-Forwarded-For` header and Cloudflare
 *   appends the real IP rather than replacing what is already there, so
 *   blindly trusting the first entry lets a client spoof any IP it likes.
 *   Cloudflare instead guarantees `CF-Connecting-IP`: its edge always
 *   overwrites this header with the true connecting IP before the Worker
 *   sees the request, so a client cannot forge it.
 *
 * Trust order: `CF-Connecting-IP` (Cloudflare, unspoofable) >
 * `X-Forwarded-For`'s first entry (Vercel/Node) > `X-Real-IP` (legacy
 * reverse-proxy convention, kept for parity with the existing call sites).
 *
 * Returns `null` when none are present. Callers decide their own fallback
 * (e.g. a literal `"unknown"` rate-limit bucket, or `null` in an audit row)
 * rather than this module silently picking one.
 */

export type ClientIpHeaders = {
  get(name: string): string | null;
};

export function extractClientIp(headers: ClientIpHeaders): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  return null;
}
