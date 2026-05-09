import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "meal",
  "medication",
  "nap",
  "incident",
  "activity",
  "note",
]);

const DEFAULT_BODY: Record<string, string> = {
  meal: "Meal/snack offered.",
  medication: "Medication given.",
  nap: "Settled for a nap or rest.",
  incident: "Incident logged — see notes.",
  activity: "Activity completed.",
  note: "Update from on-shift.",
};

type Body = {
  kind?: string;
  body?: string;
  photo_path?: string;
};

/**
 * POST /api/m/active-job/[id]/quick-log
 *
 * Carer convenience wrapper for journal entries during an active
 * shift. Validates the caller is the carer on the booking, then
 * inserts into `care_journal_entries` (the existing journal table).
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

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = String(payload.kind ?? "").trim();
  if (!ALLOWED.has(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const bodyText =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim().slice(0, 2000)
      : DEFAULT_BODY[kind];
  const photo =
    typeof payload.photo_path === "string" && payload.photo_path.trim()
      ? payload.photo_path.trim()
      : null;
  if (photo && !photo.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "invalid_photo_path" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, caregiver_id, photo_updates_consent")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      caregiver_id: string | null;
      photo_updates_consent: boolean | null;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (booking.caregiver_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (photo && booking.photo_updates_consent === false) {
    return NextResponse.json(
      { error: "photo_updates_disabled" },
      { status: 403 },
    );
  }

  const { data: row, error } = await admin
    .from("care_journal_entries")
    .insert({
      author_id: user.id,
      booking_id: bookingId,
      kind,
      body: bodyText,
      photos: photo ? [photo] : [],
    })
    .select("id, kind, body, photos, created_at")
    .single();
  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ entry: row });
}
