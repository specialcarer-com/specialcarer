import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/finalise-org-invoices
 *
 * Every 6h. Finds `org_invoices` where
 *   internal_state='draft_pending_approval' AND finalise_after <= now()
 *
 * For each, reads the related shift_timesheets row:
 *   - approved | auto_approved: append overage/overtime line items
 *     (if any), finalise the invoice, mark booking.status='invoiced'.
 *   - disputed: leave it alone, alert admin.
 *   - pending_approval (overage_requires_approval=true): leave it alone —
 *     it never auto-approves.
 *
 * Idempotent: a `finalising` internal_state guards against double-finalise.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("org_invoices")
    .select(
      "id, booking_id, stripe_invoice_id, stripe_customer_id, currency, organization_id, internal_state",
    )
    .eq("internal_state", "draft_pending_approval")
    .lte("finalise_after", new Date().toISOString())
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let finalised = 0;
  const skipped: { booking_id: string; reason: string }[] = [];
  const errors: { booking_id: string; error: string }[] = [];

  for (const inv of (rows ?? []) as Array<{
    id: string;
    booking_id: string | null;
    stripe_invoice_id: string;
    stripe_customer_id: string;
    currency: string;
    organization_id: string;
  }>) {
    const bookingId = inv.booking_id;
    if (!bookingId) {
      skipped.push({ booking_id: "(none)", reason: "no_booking_id" });
      continue;
    }
    try {
      const { data: ts } = await admin
        .from("shift_timesheets")
        .select(
          "id, status, overage_minutes, overage_cents, overtime_minutes, overtime_cents, hourly_rate_cents",
        )
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (!ts) {
        skipped.push({ booking_id: bookingId, reason: "timesheet_missing" });
        continue;
      }
      if (ts.status === "disputed") {
        skipped.push({ booking_id: bookingId, reason: "disputed" });
        continue;
      }
      if (ts.status === "pending_approval") {
        skipped.push({ booking_id: bookingId, reason: "still_pending" });
        continue;
      }
      if (ts.status !== "approved" && ts.status !== "auto_approved") {
        skipped.push({
          booking_id: bookingId,
          reason: `status_${ts.status}`,
        });
        continue;
      }

      // Guard against double-finalise.
      await admin
        .from("org_invoices")
        .update({ internal_state: "finalising" })
        .eq("id", inv.id);

      // Append overage / overtime line items to the draft invoice.
      const overageCents = Number(ts.overage_cents ?? 0);
      const overageMin = Number(ts.overage_minutes ?? 0);
      const overtimeCents = Number(ts.overtime_cents ?? 0);
      const overtimeMin = Number(ts.overtime_minutes ?? 0);
      const rateCents = Number(ts.hourly_rate_cents ?? 0);
      const rateLabel = (rateCents / 100).toFixed(2);

      if (overageCents > 0) {
        await stripe.invoiceItems.create({
          customer: inv.stripe_customer_id,
          invoice: inv.stripe_invoice_id,
          amount: overageCents,
          currency: inv.currency,
          description: `Overage — ${overageMin} min @ £${rateLabel}/hr`,
          metadata: { booking_id: bookingId, timesheet_id: ts.id, kind: "overage" },
        });
      }
      if (overtimeCents > 0) {
        await stripe.invoiceItems.create({
          customer: inv.stripe_customer_id,
          invoice: inv.stripe_invoice_id,
          amount: overtimeCents,
          currency: inv.currency,
          description: `Overtime premium — ${overtimeMin} min (FLSA 0.5x)`,
          metadata: { booking_id: bookingId, timesheet_id: ts.id, kind: "overtime" },
        });
      }

      const finalisedInv = await stripe.invoices.finalizeInvoice(
        inv.stripe_invoice_id,
      );
      const nowIso = new Date().toISOString();

      await admin
        .from("org_invoices")
        .update({
          internal_state: "finalised",
          status: finalisedInv.status ?? "open",
          amount_due_cents: finalisedInv.amount_due,
          amount_paid_cents: finalisedInv.amount_paid,
          hosted_invoice_url: finalisedInv.hosted_invoice_url ?? null,
          invoice_pdf_url: finalisedInv.invoice_pdf ?? null,
          due_date: finalisedInv.due_date
            ? new Date(finalisedInv.due_date * 1000)
                .toISOString()
                .slice(0, 10)
            : null,
        })
        .eq("id", inv.id);

      await admin
        .from("bookings")
        .update({
          invoiced_at: nowIso,
          status: "invoiced",
          updated_at: nowIso,
        })
        .eq("id", bookingId);

      finalised += 1;
    } catch (e) {
      // Revert internal_state back to draft so next run can retry.
      try {
        await admin
          .from("org_invoices")
          .update({ internal_state: "draft_pending_approval" })
          .eq("id", inv.id);
      } catch {
        /* best-effort */
      }
      errors.push({
        booking_id: bookingId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    finalised,
    skipped,
    errors,
  });
}
