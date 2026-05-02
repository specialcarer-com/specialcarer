import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidCoord } from "@/lib/mapbox/server";

export const runtime = "nodejs";

/**
 * POST /api/shifts/[id]/ping
 *
 * Caregiver sends a GPS ping. Body:
 *   { lat, lng, accuracy_m?, heading?, speed_mps?, battery_pct?, recorded_at? }
 *
 * Validates that an active tracking session exists for this booking and that
 * the caller is the assigned caregiver. Auto-ends the session if the tracking
 * window has expired.
 */
export async function POST(
  req: Request,
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isValidCoord(lat, lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("shift_tracking_sessions")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { error: "No tracking session — call /tracking/start first" },
      { status: 404 }
    );
  }
  if (session.caregiver_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.status === "ended" || session.status === "cancelled") {
    return NextResponse.json(
      { error: `Tracking ${session.status}` },
      { status: 400 }
    );
  }

  const now = new Date();
  const windowEnd = new Date(session.tracking_window_end);
  if (now.getTime() > windowEnd.getTime()) {
    // auto-close
    await admin
      .from("shift_tracking_sessions")
      .update({ status: "ended", ended_at: now.toISOString() })
      .eq("id", session.id);
    return NextResponse.json(
      { error: "Tracking window expired — session auto-ended" },
      { status: 400 }
    );
  }

  const recordedAt =
    typeof body.recorded_at === "string"
      ? new Date(body.recorded_at).toISOString()
      : now.toISOString();

  const { error: insertErr } = await admin.from("shift_locations").insert({
    session_id: session.id,
    booking_id: bookingId,
    caregiver_id: user.id,
    lat,
    lng,
    accuracy_m: typeof body.accuracy_m === "number" ? body.accuracy_m : null,
    heading: typeof body.heading === "number" ? body.heading : null,
    speed_mps: typeof body.speed_mps === "number" ? body.speed_mps : null,
    battery_pct:
      typeof body.battery_pct === "number" ? Math.round(body.battery_pct) : null,
    recorded_at: recordedAt,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await admin
    .from("shift_tracking_sessions")
    .update({ last_ping_at: recordedAt })
    .eq("id", session.id);

  return NextResponse.json({ ok: true, recorded_at: recordedAt });
}
