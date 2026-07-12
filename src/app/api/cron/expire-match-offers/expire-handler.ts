/**
 * Pure handler for the expire-stale-match-offers cron (gap 17 follow-up).
 *
 * The DB work lives in the SECURITY DEFINER RPC expire_stale_match_offers()
 * (see supabase/migrations/20260610_expire_match_offers_rpc.sql). This module
 * holds the parts worth unit-testing without a live DB:
 *
 *   - authorize(): the Vercel cron secret check.
 *   - isExpiryEligible(): the same predicate the RPC's WHERE clause uses, so we
 *     can assert which of a mixed set of offers should flip.
 *   - handleExpire(): orchestration over a narrow client surface (a stub in
 *     tests, the real RPC call in route.ts).
 */

export type ExpireResult =
  | { status: number; body: { ok: true; expired_count: number } }
  | { status: number; body: { ok: false; error: string } };

/**
 * Standard Vercel cron auth: the platform sends `Authorization: Bearer
 * <CRON_SECRET>`. We mirror the existing cron routes (see
 * api/cron/expire-agency-optin-grace) — if CRON_SECRET is unset we allow the
 * call (local/dev), otherwise the bearer token must match exactly.
 */
export function authorize(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

/** Minimal shape of an offer row for the eligibility predicate. */
export type OfferLike = {
  status: "pending" | "accepted" | "declined" | "expired";
  expires_at: string;
};

/**
 * Mirrors the RPC WHERE clause: an offer expires when it is still live
 * (pending OR accepted) and its window has passed. 'declined'/'expired' rows
 * are terminal and never re-touched.
 */
export function isExpiryEligible(offer: OfferLike, now: number): boolean {
  if (offer.status !== "pending" && offer.status !== "accepted") return false;
  const expiresAt = new Date(offer.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < now;
}

/**
 * One affected booking from the sweep: the booking whose offers just expired,
 * its seeker (the push recipient), how many offers flipped, and the carers who
 * were shortlisted (offers that just expired) — carried for downstream use.
 */
export type ExpiredBooking = {
  bookingId: string;
  seekerId: string;
  expiredCount: number;
  shortlistedCaregiverIds: string[];
};

/** Narrow client surface; tests pass a stub, route.ts wraps the real RPC. */
export type ExpireClient = {
  expireStale: () => Promise<{
    bookings: ExpiredBooking[];
    error: string | null;
  }>;
  /**
   * Fire-and-forget push fan-out for the affected bookings. Best-effort — it
   * must never block or fail the sweep response (mirrors pick-offer's
   * onConfirmed). Optional so tests can omit it.
   */
  onExpired?: (bookings: ExpiredBooking[]) => Promise<void> | void;
};

export async function handleExpire(client: ExpireClient): Promise<ExpireResult> {
  const { bookings, error } = await client.expireStale();
  if (error) {
    return { status: 500, body: { ok: false, error } };
  }

  if (client.onExpired && bookings.length > 0) {
    await client.onExpired(bookings);
  }

  const expiredCount = bookings.reduce((sum, b) => sum + b.expiredCount, 0);
  return { status: 200, body: { ok: true, expired_count: expiredCount } };
}
