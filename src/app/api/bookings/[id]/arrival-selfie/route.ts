import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEventOnce } from "@/lib/journal/system-events";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "journal-photos";
const SIGNED_URL_TTL_S = 60 * 60; // 1 hour

type Body = { path?: string };

/**
 * POST /api/bookings/[id]/arrival-selfie
 *
 * The carer uploads a selfie to the journal-photos bucket then posts
 * the storage path here. We:
 *   1. Verify the caller is the carer of this booking.
 *   2. Validate the path lives under the carer's user folder.
 *   3. Stamp `bookings.arrival_selfie_path` and set `actual_started_at`
 *      if it isn't already.
 *   4. Drop a system journal event "Sarah arrived at HH:MM".
 *   5. Return a fresh 1-hour signed URL for the seeker to view it.
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
  const path = String(body.path ?? "").trim();
  if (!path || !path.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: "Invalid storage path" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id, actual_started_at")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      caregiver_id: string | null;
      actual_started_at: string | null;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.caregiver_id !== user.id) {
    return NextResponse.json(
      { error: "Only the carer can upload the arrival selfie" },
      { status: 403 },
    );
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { arrival_selfie_path: path };
  if (!booking.actual_started_at) update.actual_started_at = nowIso;

  const { error: updateErr } = await admin
    .from("bookings")
    .update(update)
    .eq("id", bookingId);
  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 },
    );
  }

  // System journal event — best effort (don't fail the request if the
  // journal insert can't land for whatever reason).
  let actorName: string | null = null;
  try {
    const { data: prof } = await admin
      .from("caregiver_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle<{ display_name: string | null }>();
    actorName = prof?.display_name ?? null;
  } catch {
    /* ignore */
  }
  await recordSystemEventOnce(admin, {
    bookingId,
    kind: "arrival",
    actorName,
    authorId: user.id,
  });

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
    arrival_selfie_path: path,
    signed_url: signedUrl,
  });
}
