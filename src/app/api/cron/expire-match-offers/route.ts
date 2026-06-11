import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authorize,
  handleExpire,
  type ExpireClient,
  type ExpiredBooking,
} from "./expire-handler";

export const dynamic = "force-dynamic";

/** Row shape returned by the expire_stale_match_offers() RPC (one per booking). */
type ExpireRow = {
  booking_id: string;
  seeker_id: string;
  expired_count: number;
  shortlisted_carer_ids: string[] | null;
};

/**
 * GET /api/cron/expire-match-offers
 *
 * Vercel cron sweep (gap 17 follow-up). Flips booking_match_offers rows whose
 * window has passed (status pending/accepted, expires_at < now) to 'expired'
 * via the SECURITY DEFINER RPC expire_stale_match_offers().
 *
 * Idempotent — safe to run every couple of minutes.
 */
export async function GET(req: Request) {
  if (!authorize(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const client: ExpireClient = {
    async expireStale() {
      const { data, error } = await admin.rpc("expire_stale_match_offers");
      if (error) {
        return { bookings: [], error: error.message };
      }
      // RPC returns table(booking_id, seeker_id, expired_count,
      // shortlisted_carer_ids) → one row per affected booking.
      const rows = (Array.isArray(data) ? data : []) as ExpireRow[];
      const bookings: ExpiredBooking[] = rows.map((r) => ({
        bookingId: r.booking_id,
        seekerId: r.seeker_id,
        expiredCount: Number(r.expired_count ?? 0),
        shortlistedCaregiverIds: r.shortlisted_carer_ids ?? [],
      }));
      return { bookings, error: null };
    },
    onExpired: (bookings) => dispatchExpired(bookings),
  };

  const res = await handleExpire(client);
  if (res.body.ok) {
    console.log(
      `[cron.expire-match-offers] expired ${res.body.expired_count} stale offer(s)`,
    );
  } else {
    console.error("[cron.expire-match-offers] failed:", res.body.error);
  }
  return NextResponse.json(res.body, { status: res.status });
}

/**
 * Best-effort push fan-out after the sweep: one 'offer.expired' to each
 * affected seeker. Mirrors pick-offer's onConfirmed — never throws into the
 * cron response, and doesn't block the sweep's success path on push delivery.
 *
 * Seeker-only for now. The shortlisted carers ride along on the event payload
 * (shortlistedCaregiverIds) so a later PR can notify them without re-querying;
 * see PR body follow-up.
 */
async function dispatchExpired(bookings: ExpiredBooking[]): Promise<void> {
  try {
    const { dispatch } = await import("@/lib/push/notify");
    for (const b of bookings) {
      await dispatch({
        type: "offer.expired",
        bookingId: b.bookingId,
        seekerId: b.seekerId,
        shortlistedCaregiverIds: b.shortlistedCaregiverIds,
      });
    }
  } catch (err) {
    console.error("[cron.expire-match-offers] push fan-out failed", err);
  }
}
