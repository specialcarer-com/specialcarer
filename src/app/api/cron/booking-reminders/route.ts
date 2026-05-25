import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatch } from "@/lib/push/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/booking-reminders
 *
 * Fires a 24h-ahead booking reminder to both seeker and caregiver for
 * any booking starting between now+23h and now+25h whose status is
 * still active (accepted or paid). Idempotency is left to the cron
 * schedule (hourly window straddles each booking once); a stricter
 * dedupe via a reminder_sent_at column is a follow-up.
 *
 * NOTE: schedule needs to be added to vercel.json in a follow-up PR.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = Date.now();
  const windowStart = new Date(now + 23 * 3600 * 1000).toISOString();
  const windowEnd = new Date(now + 25 * 3600 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id, starts_at, status")
    .in("status", ["accepted", "paid"])
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd)
    .limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let dispatched = 0;
  for (const b of (rows ?? []) as Array<{
    id: string;
    seeker_id: string;
    caregiver_id: string | null;
    starts_at: string;
    status: string;
  }>) {
    if (!b.caregiver_id) continue;
    void dispatch({
      type: "booking.reminder_24h",
      recipientId: b.seeker_id,
      bookingId: b.id,
      otherPartyId: b.caregiver_id,
      startsAt: b.starts_at,
    });
    void dispatch({
      type: "booking.reminder_24h",
      recipientId: b.caregiver_id,
      bookingId: b.id,
      otherPartyId: b.seeker_id,
      startsAt: b.starts_at,
    });
    dispatched += 2;
  }

  return NextResponse.json({ ok: true, dispatched });
}
