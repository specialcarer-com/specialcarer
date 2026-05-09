import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEventOnce } from "@/lib/journal/system-events";

export const runtime = "nodejs";

async function fetchCarerName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: ReturnType<typeof createAdminClient>,
  carerId: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("caregiver_profiles")
      .select("display_name")
      .eq("user_id", carerId)
      .maybeSingle<{ display_name: string | null }>();
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /api/shifts/[id]/tracking/start
 *
 * Caregiver starts a tracking session for a confirmed booking. Idempotent.
 * Creates a session row if one does not exist; otherwise returns the existing one.
 *
 * Tracking window: scheduled_start → scheduled_end + 15 minutes.
 * Cannot start before scheduled_start - 15 min, cannot start after tracking_window_end.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, paid_at, actual_started_at"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.caregiver_id !== user.id) {
    return NextResponse.json(
      { error: "Only the assigned caregiver can start tracking" },
      { status: 403 }
    );
  }
  if (!booking.paid_at) {
    return NextResponse.json(
      { error: "Booking is not paid yet" },
      { status: 400 }
    );
  }

  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const trackingWindowEnd = new Date(endsAt.getTime() + 15 * 60_000);
  const now = new Date();

  // Allow starting up to 15 min before the scheduled start
  if (now.getTime() < startsAt.getTime() - 15 * 60_000) {
    return NextResponse.json(
      { error: "Too early to start tracking — opens 15 min before shift" },
      { status: 400 }
    );
  }
  if (now.getTime() > trackingWindowEnd.getTime()) {
    return NextResponse.json(
      { error: "Tracking window has closed" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("shift_tracking_sessions")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "ended" || existing.status === "cancelled") {
      return NextResponse.json(
        { error: `Tracking already ${existing.status}` },
        { status: 400 }
      );
    }
    // Promote pending → active if needed
    if (existing.status === "pending") {
      const { data: updated, error } = await admin
        .from("shift_tracking_sessions")
        .update({ status: "active", started_at: now.toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // Mirror to bookings.actual_started_at (only if not already set) so
      // the on-time metric reflects true arrival time.
      if (!booking.actual_started_at) {
        await admin
          .from("bookings")
          .update({ actual_started_at: now.toISOString() })
          .eq("id", bookingId);
      }
      const actorName = await fetchCarerName(admin, booking.caregiver_id);
      await recordSystemEventOnce(admin, {
        bookingId,
        kind: "arrival",
        actorName,
        authorId: booking.caregiver_id,
      });
      return NextResponse.json({ session: updated });
    }
    return NextResponse.json({ session: existing });
  }

  const { data: created, error } = await admin
    .from("shift_tracking_sessions")
    .insert({
      booking_id: bookingId,
      caregiver_id: booking.caregiver_id,
      seeker_id: booking.seeker_id,
      status: "active",
      scheduled_start: booking.starts_at,
      scheduled_end: booking.ends_at,
      tracking_window_end: trackingWindowEnd.toISOString(),
      started_at: now.toISOString(),
    })
    .select()
    .single();

  // Mirror arrival to bookings.actual_started_at for the on-time metric.
  if (!error && !booking.actual_started_at) {
    await admin
      .from("bookings")
      .update({ actual_started_at: now.toISOString() })
      .eq("id", bookingId);
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: record an "arrival" system event the first time
  // tracking starts. recordSystemEventOnce dedupes so a re-entry into
  // this route after a momentary failure doesn't spam the feed.
  const actorName = await fetchCarerName(admin, booking.caregiver_id);
  await recordSystemEventOnce(admin, {
    bookingId,
    kind: "arrival",
    actorName,
    authorId: booking.caregiver_id,
  });

  return NextResponse.json({ session: created });
}
