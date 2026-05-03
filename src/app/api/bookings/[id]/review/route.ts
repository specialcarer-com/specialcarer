import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/[id]/review { rating: 1..5, body?: string }
 * Only the seeker of a completed/paid_out booking can leave one review per booking.
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
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { rating, body } = (await req.json()) as { rating?: number; body?: string };
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }
  if (body !== undefined && (typeof body !== "string" || body.length > 2000)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("seeker_id, caregiver_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json({ error: "Only the seeker can review" }, { status: 403 });
  }
  if (!["completed", "paid_out"].includes(booking.status)) {
    return NextResponse.json(
      { error: "Reviews open after the shift completes" },
      { status: 400 },
    );
  }

  // Use the user-scoped supabase client so RLS policy applies
  const { error } = await supabase.from("reviews").upsert(
    {
      booking_id: bookingId,
      reviewer_id: user.id,
      caregiver_id: booking.caregiver_id,
      rating: rating as number,
      body: body?.trim() || null,
    },
    { onConflict: "booking_id,reviewer_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
