import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/shifts/[id]/track?since=ISO
 *
 * Returns the tracking session and recent location pings for a booking.
 * Both seeker and caregiver may read (RLS enforced).
 *
 * Query params:
 *   since (optional) — ISO timestamp; only returns pings after this time.
 *                      Use for incremental polling.
 *   limit (optional) — max pings (default 200, max 500).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const limitRaw = Number(url.searchParams.get("limit") || "200");
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // RLS will filter to only sessions visible to this user (caregiver or seeker)
  const { data: session } = await supabase
    .from("shift_tracking_sessions")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ session: null, pings: [], latest: null });
  }

  let q = supabase
    .from("shift_locations")
    .select("id, lat, lng, accuracy_m, heading, speed_mps, recorded_at")
    .eq("session_id", session.id)
    .order("recorded_at", { ascending: true })
    .limit(limit);

  if (since) {
    q = q.gt("recorded_at", since);
  }

  const { data: pings } = await q;
  const list = pings ?? [];
  const latest = list.length > 0 ? list[list.length - 1] : null;

  return NextResponse.json({
    session,
    pings: list,
    latest,
    server_time: new Date().toISOString(),
  });
}
