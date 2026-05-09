import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTrackingEligibility } from "@/lib/tracking/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/carer-phone/[bookingId]
 *
 * Returns the carer's phone number (or null) for the booking. Reuses
 * the live-tracking eligibility check so seekers, family members, and
 * the carer themselves can all hit it; anyone else gets 403.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const eligibility = await getTrackingEligibility(bookingId);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.reason ?? "Not eligible" },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("caregiver_id")
    .eq("id", bookingId)
    .maybeSingle<{ caregiver_id: string | null }>();
  if (!booking?.caregiver_id) {
    return NextResponse.json({ phone: null });
  }
  const { data: prof } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", booking.caregiver_id)
    .maybeSingle<{ phone: string | null }>();
  return NextResponse.json({ phone: prof?.phone ?? null });
}
