import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import { createShiftInvoice } from "@/lib/stripe/invoicing";
import type { OrgBooking } from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/org-invoice/create
 *
 * Creates and finalises a Stripe Invoice for a completed org booking.
 *
 * Architecture note:
 *   - This is a DIRECT charge to All Care 4 U Group Ltd's Stripe balance.
 *   - No Stripe Connect, no transfer_data, no application_fee_amount.
 *   - The org pays via the Stripe-hosted invoice page (link in email).
 *   - Carer payout is accrued separately and paid on the weekly cycle from
 *     All Care 4 U Group Ltd's own funds, independently of org payment.
 *
 * Access: admin only, OR org member with owner/admin role (internal ops trigger).
 *
 * Body: { booking_id: string, days_until_due?: number }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Allow admin or org owner/admin
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  let isOrgAdmin = false;
  let orgId: string | null = null;

  if (!isAdmin) {
    const member = await getMyOrgMembership(admin, user.id);
    if (!member || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    isOrgAdmin = true;
    orgId = member.organization_id;
  }

  const { booking_id, days_until_due } = (await req.json()) as {
    booking_id: string;
    days_until_due?: number;
  };

  if (!booking_id) {
    return NextResponse.json({ error: "booking_id is required" }, { status: 400 });
  }

  // Load booking
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // Org admin can only invoice their own org's bookings
  if (isOrgAdmin && booking.organization_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (booking.booking_source !== "org") {
    return NextResponse.json(
      { error: "Only org bookings can be invoiced via this route" },
      { status: 400 }
    );
  }

  if (!["completed", "invoiced"].includes(booking.status) && booking.status !== "completed") {
    return NextResponse.json(
      { error: `Cannot invoice a booking in status '${booking.status}'. Shift must be completed first.` },
      { status: 400 }
    );
  }

  if (booking.stripe_invoice_id) {
    return NextResponse.json(
      { error: "An invoice already exists for this booking", stripe_invoice_id: booking.stripe_invoice_id },
      { status: 409 }
    );
  }

  // Resolve net_terms_days from org billing settings
  let daysUntilDue = days_until_due ?? 14;
  const { data: billing } = await admin
    .from("organization_billing")
    .select("net_terms_days")
    .eq("organization_id", booking.organization_id)
    .maybeSingle();
  if (billing?.net_terms_days) {
    daysUntilDue = billing.net_terms_days as number;
  }

  const result = await createShiftInvoice(
    admin,
    booking as OrgBooking,
    daysUntilDue
  );

  return NextResponse.json({
    ok: true,
    stripe_invoice_id: result.stripeInvoiceId,
    hosted_invoice_url: result.hostedInvoiceUrl,
    invoice_pdf_url: result.invoicePdfUrl,
    amount_due_cents: result.amountDueCents,
  });
}
