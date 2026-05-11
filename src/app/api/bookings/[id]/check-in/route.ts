import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEventOnce } from "@/lib/journal/system-events";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "journal-photos";
const SIGNED_URL_TTL_S = 60 * 60;
const FORCE_REASON_MIN = 5;
const FORCE_REASON_MAX = 500;

type Body = {
  lat?: number | null;
  lng?: number | null;
  selfie_path?: string;
  force?: boolean;
  force_reason?: string;
};

/**
 * POST /api/bookings/[id]/check-in
 *
 * Carer-initiated geofenced arrival check-in. Combines the existing
 * arrival-selfie + tracking-start flow into a single tap:
 *   1. Validates lat/lng inside the booking's geofence
 *      (default 200 m, override via bookings.geofence_radius_m).
 *   2. Validates the selfie path lives in the carer's storage folder.
 *   3. Stamps `arrival_selfie_path`, sets `actual_started_at`,
 *      promotes status paid|accepted → in_progress.
 *   4. Drops an "arrival" system journal event (idempotent — won't
 *      double-fire if the carer re-taps after a flaky network).
 *
 * Force-override (added 2026-05-11):
 *   If `force=true` is sent with a typed `force_reason` (5–500 chars),
 *   the geofence + distance checks are skipped. `lat`/`lng` may be null.
 *   The booking row is stamped with `check_in_forced=true`,
 *   `check_in_forced_reason=<reason>`, and `flagged_for_review=true`,
 *   and the journal entry uses the `arrival_forced` kind (which renders
 *   the reason inline for the seeker).
 *
 *   Selfie validation still runs — the carer must still upload an
 *   arrival selfie even when forcing.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const force = body.force === true;
  const forceReasonRaw =
    typeof body.force_reason === "string" ? body.force_reason.trim() : "";

  if (force) {
    if (
      forceReasonRaw.length < FORCE_REASON_MIN ||
      forceReasonRaw.length > FORCE_REASON_MAX
    ) {
      return NextResponse.json(
        {
          error: `force_reason must be ${FORCE_REASON_MIN}–${FORCE_REASON_MAX} characters.`,
        },
        { status: 400 },
      );
    }
  } else {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "invalid_coords" }, { status: 400 });
    }
  }

  const path = String(body.selfie_path ?? "").trim();
  if (!path || !path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "invalid_selfie_path" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, actual_started_at, geofence_radius_m",
    )
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      caregiver_id: string | null;
      status: string;
      actual_started_at: string | null;
      geofence_radius_m: number | null;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (booking.caregiver_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (
    booking.status !== "paid" &&
    booking.status !== "accepted" &&
    booking.status !== "in_progress"
  ) {
    return NextResponse.json(
      { error: `cannot_check_in_${booking.status}` },
      { status: 400 },
    );
  }

  let distance: number | null = null;
  if (!force) {
    // Geofence check via SQL RPC + companion distance. Skipped on forced
    // check-in — `flagged_for_review` already drives admin attention.
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const [insideRes, distRes] = await Promise.all([
      admin.rpc("is_inside_geofence", {
        p_booking_id: bookingId,
        p_lat: lat,
        p_lng: lng,
      }),
      admin.rpc("distance_to_booking", {
        p_booking_id: bookingId,
        p_lat: lat,
        p_lng: lng,
      }),
    ]);
    const inside = insideRes.data === true;
    distance =
      typeof distRes.data === "number" && Number.isFinite(distRes.data)
        ? Math.round(distRes.data)
        : null;
    if (!inside) {
      return NextResponse.json(
        {
          error:
            distance != null
              ? `You're not at the booking location yet (${distance} m away). Please move closer to check in.`
              : "You're not at the booking location yet. Please move closer to check in.",
          distance_m: distance,
        },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { arrival_selfie_path: path };
  if (!booking.actual_started_at) update.actual_started_at = now;
  if (booking.status !== "in_progress") update.status = "in_progress";
  if (force) {
    update.check_in_forced = true;
    update.check_in_forced_reason = forceReasonRaw;
    update.flagged_for_review = true;
  }

  const { error: updErr } = await admin
    .from("bookings")
    .update(update)
    .eq("id", bookingId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Best-effort arrival event in the activity feed (dedup'd by helper).
  try {
    const { data: prof } = await admin
      .from("caregiver_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle<{ display_name: string | null }>();
    await recordSystemEventOnce(admin, {
      bookingId,
      kind: force ? "arrival_forced" : "arrival",
      actorName: prof?.display_name ?? null,
      authorId: user.id,
      forceReason: force ? forceReasonRaw : null,
    });
  } catch (e) {
    console.error("[check-in] journal event failed", e);
  }

  // Fresh signed URL so the seeker can render the selfie immediately.
  let signedUrl: string | null = null;
  try {
    const { data: signed } = await admin.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_S);
    signedUrl = signed?.signedUrl ?? null;
  } catch {
    signedUrl = null;
  }

  return NextResponse.json({
    ok: true,
    status: "in_progress",
    distance_m: distance,
    signed_url: signedUrl,
    forced: force,
  });
}
