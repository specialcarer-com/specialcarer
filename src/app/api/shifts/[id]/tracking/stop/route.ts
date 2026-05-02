import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/shifts/[id]/tracking/stop
 *
 * Caregiver explicitly ends the tracking session (e.g. early shift wrap).
 * Idempotent. Either party may call it; service role updates the row.
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

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("shift_tracking_sessions")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "No tracking session" }, { status: 404 });
  }
  if (session.caregiver_id !== user.id && session.seeker_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.status === "ended" || session.status === "cancelled") {
    return NextResponse.json({ session });
  }

  const { data: updated, error } = await admin
    .from("shift_tracking_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", session.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ session: updated });
}
