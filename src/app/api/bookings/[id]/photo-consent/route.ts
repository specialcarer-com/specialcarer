import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEvent } from "@/lib/journal/system-events";

export const dynamic = "force-dynamic";

type Body = { enabled?: unknown };

/**
 * PATCH /api/bookings/[id]/photo-consent
 *
 * Seeker toggles whether the carer is allowed to upload photo updates
 * for this booking. Drops a system journal event so the activity feed
 * shows when the toggle flipped.
 */
export async function PATCH(
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
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "`enabled` must be boolean" },
      { status: 400 },
    );
  }
  const enabled = body.enabled;

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id")
    .eq("id", bookingId)
    .maybeSingle<{ id: string; seeker_id: string }>();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json(
      { error: "Only the seeker can change photo consent" },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("bookings")
    .update({ photo_updates_consent: enabled })
    .eq("id", bookingId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: log the toggle as a system journal entry authored by
  // the seeker so the carer + family see it in the feed.
  await recordSystemEvent(admin, {
    bookingId,
    kind: enabled ? "photo_consent_on" : "photo_consent_off",
    authorId: user.id,
  });

  return NextResponse.json({ ok: true, photo_updates_consent: enabled });
}
