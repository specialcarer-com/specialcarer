import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import { computeCancellationPreview } from "@/lib/org/booking-types";
import type { OrgBooking } from "@/lib/org/booking-types";
import { computeOrgChargeTotalCents } from "@/lib/stripe/invoicing";

export const dynamic = "force-dynamic";

/**
 * GET  /api/m/org/bookings/[id]/cancel
 *   Returns a cancellation fee preview without committing the cancellation.
 *   Use this to populate the confirmation modal before the org confirms.
 *
 * POST /api/m/org/bookings/[id]/cancel
 *   Commits the cancellation:
 *     1. Validates timing + computes fee
 *     2. Inserts org_booking_cancellations row (audit trail)
 *     3. Updates booking status to 'cancelled'
 *     4. Cancels any pending offers
 *     5. If fee applies: TODO — trigger invoice via Stripe for cancellation fee
 *        (Phase B MVP: stores fee_charged_cents; Phase C to auto-invoice)
 *
 * Body (POST): { reason?: string }
 */

async function getBookingForOrg(admin: ReturnType<typeof createAdminClient>, bookingId: string, orgId: string) {
  const { data } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data as OrgBooking | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const booking = await getBookingForOrg(admin, id, member.organization_id);
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cancellableStatuses = ["pending_offer", "offered", "accepted", "in_progress"];
  if (!cancellableStatuses.includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a booking in status '${booking.status}'` },
      { status: 400 }
    );
  }

  const shiftTotalCents = computeOrgChargeTotalCents(booking);
  const preview = computeCancellationPreview(
    new Date(booking.starts_at),
    shiftTotalCents
  );

  return NextResponse.json({ preview });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (member.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const booking = await getBookingForOrg(admin, id, member.organization_id);
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cancellableStatuses = ["pending_offer", "offered", "accepted", "in_progress"];
  if (!cancellableStatuses.includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a booking in status '${booking.status}'` },
      { status: 400 }
    );
  }

  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };

  const shiftTotalCents = computeOrgChargeTotalCents(booking);
  const preview = computeCancellationPreview(
    new Date(booking.starts_at),
    shiftTotalCents
  );

  // Write cancellation audit record
  await admin.from("org_booking_cancellations").insert({
    booking_id: id,
    cancelled_by: user.id,
    reason: reason || null,
    timing_bucket: preview.timing_bucket,
    hours_before_start: preview.hours_before_start,
    fee_charged_cents: preview.fee_charged_cents,
    carer_payout_cents: preview.carer_payout_cents,
    // stripe_invoice_id: set in Phase C when cancellation invoicing is wired up
  });

  // Cancel pending offers
  await admin
    .from("org_booking_offers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("booking_id", id)
    .eq("status", "pending");

  // Mark booking cancelled
  await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id);

  // TODO (Phase C): if fee_charged_cents > 0, auto-create a Stripe Invoice
  // for the cancellation fee via createShiftInvoice with a cancellation line item.
  // For MVP, the fee is recorded in org_booking_cancellations and ops team
  // can issue the invoice manually from /admin/org-bookings.

  return NextResponse.json({
    ok: true,
    timing_bucket: preview.timing_bucket,
    fee_charged_cents: preview.fee_charged_cents,
    description: preview.description,
  });
}
