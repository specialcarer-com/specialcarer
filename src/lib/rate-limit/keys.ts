/**
 * Canonical key builders for the distributed limiter (Phase C — PR C2).
 *
 * Centralising the shape here means the waitlist route can't accidentally
 * diverge from the calendar-feed route (e.g. `waitlist_ip:` vs `waitlist:ip:`)
 * and blow the invariant that the same key ALWAYS represents the same bucket
 * across deploys. Every caller of `check(...)` MUST use one of these builders.
 *
 * Namespace shape: `<surface>:<sub>:<identity>` — the surface prefix keeps
 * unrelated tables (e.g. waitlist vs support) in disjoint Redis keyspaces.
 */

/**
 * Lowercase + strip whitespace so different callers get one shared bucket for
 * `Alice@Example.com` and `alice@example.com` (waitlist email dedupe already
 * lowercases at insert time; we mirror it here for the rate-limit key).
 */
function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** IP is treated opaquely — trim to guard against upstream `x-forwarded-for` slop. */
function normIp(ip: string): string {
  return ip.trim() || "unknown";
}

/** Token is opaque; strip whitespace so a stray `\r\n` doesn't split buckets. */
function normToken(token: string): string {
  return token.trim();
}

/** Vendor label is a short caller-supplied string (e.g. "postmark", "sendgrid"). */
function normVendor(vendor: string): string {
  return vendor.trim().toLowerCase() || "unknown";
}

/** Waitlist — per source IP (bulk blast protection). */
export function waitlistIp(ip: string): string {
  return `waitlist:ip:${normIp(ip)}`;
}

/** Waitlist — per candidate email address (prevents a single spoofed sender flooding one row). */
export function waitlistEmail(email: string): string {
  return `waitlist:email:${normEmail(email)}`;
}

/** Calendar feed — per opaque token (authorised subscriber budget). */
export function calendarFeedToken(token: string): string {
  return `calendar:feed:token:${normToken(token)}`;
}

/** Calendar feed — per IP for UNKNOWN tokens (prevents token enumeration). */
export function calendarFeedIp(ip: string): string {
  return `calendar:feed:ip:${normIp(ip)}`;
}

/** Support-ingest — per vendor label (per-relay budget matching PR #199 shape). */
export function supportInboundVendor(vendor: string): string {
  return `support:inbound:vendor:${normVendor(vendor)}`;
}

/**
 * Candour case open — per authenticated user id.
 *
 * A carer legitimately filing a fresh notifiable-event report should not
 * be doing more than a handful in a short window; the 5-per-hour ceiling
 * is deliberately generous. If a real incident cluster needs more, admin
 * can file on behalf of the carer (that path does not go through this
 * limiter).
 */
export function candourOpenUser(userId: string): string {
  return `candour:open:user:${userId.trim()}`;
}

/**
 * Account-deletion submit — per authenticated user id.
 *
 * A legitimate user submits a deletion at most once (before verifying).
 * The 5-per-hour ceiling matches C3a's candour surface and is
 * deliberately generous — a user retrying after a validation error or
 * a stale form should still succeed. A hostile session spamming
 * submissions is prevented from firing arbitrary verification emails
 * to the user's inbox.
 */
export function accountDeletionSubmitUser(userId: string): string {
  return `account-deletion:submit:user:${userId.trim()}`;
}
