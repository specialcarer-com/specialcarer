import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPendingConfirmations } from "@/lib/timesheet/approve";

export const dynamic = "force-dynamic";

/**
 * GET /api/bookings/[id]/timesheet/payments/pending
 *
 * Used by the resume-payment flow: when the user clicks the retry email
 * link (`/m/bookings/[id]?resume_payment=1`), the page calls this to
 * rebuild the Elements step from scratch. Each row carries a fresh
 * client_secret pulled live from Stripe.
 *
 * Auth: same rules as /timesheet/approve.
 */
export async function GET(
  _req: Request,
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
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, organization_id, booking_source")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      organization_id: string | null;
      booking_source: string;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }

  let authorised = false;
  if (booking.booking_source === "org") {
    if (booking.organization_id) {
      const { data: member } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", booking.organization_id)
        .eq("user_id", user.id)
        .maybeSingle<{ role: string }>();
      authorised = !!member && ["owner", "admin"].includes(member.role);
    }
  } else {
    authorised = booking.seeker_id === user.id;
  }
  if (!authorised) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pending = await loadPendingConfirmations(admin, bookingId);
  return NextResponse.json({ pending_confirmations: pending });
}
