import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { paymentCaptureClaimFilter } from "@/lib/cron/payment-capture-claim";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function logClaimAttempt(
  target: "booking" | "supplemental_payment",
  id: string,
  claimed: boolean,
): void {
  const data = { target, id, claimed };
  Sentry.addBreadcrumb({
    category: "cron.payment_capture_claim",
    level: "info",
    message: "payment capture claim attempted",
    data,
  });
  console.info("[cron.release-payouts] payment_capture_claim", data);
}

async function captureOrReconcilePaymentIntent(paymentIntentId: string) {
  try {
    return await stripe.paymentIntents.capture(paymentIntentId);
  } catch (captureError) {
    // A timeout can happen after Stripe captured the intent but before this
    // function received the response. Reconcile that state before treating the
    // retry as a failure, so the next TTL claim repairs local state.
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status === "succeeded") return paymentIntent;
    throw captureError;
  }
}

/**
 * GET /api/cron/release-payouts
 *
 * Vercel Cron entry-point. Captures all completed bookings whose 24-hour
 * hold has elapsed. Idempotent — only acts on bookings still in `completed`.
 *
 * Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
 * For local/manual triggers we fall back to the same env var.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron auth — reject if a secret is configured and doesn't match
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  // Private/seeker bookings only — org bookings are paid monthly via
  // /api/cron/release-org-payouts. Defensive filter: even though org
  // bookings won't have a Stripe payment_intent in `payments`, exclude
  // them explicitly so this cron's scan stats stay clean.
  const { data: due, error } = await admin
    .from("bookings")
    .select("id, status, payout_eligible_at")
    .eq("status", "completed")
    .neq("booking_source", "org")
    .lte("payout_eligible_at", new Date().toISOString())
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let released = 0;
  const errors: { booking_id: string; error: string }[] = [];

  for (const b of due ?? []) {
    const { data: claimedBooking, error: claimError } = await admin
      .from("bookings")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", b.id)
      .eq("status", "completed")
      .or(paymentCaptureClaimFilter())
      .select("id")
      .maybeSingle();
    const bookingClaimed = Boolean(claimedBooking) && !claimError;
    logClaimAttempt("booking", b.id, bookingClaimed);
    if (claimError || !claimedBooking) {
      if (claimError) {
        errors.push({ booking_id: b.id, error: claimError.message });
      }
      continue;
    }

    const { data: payment } = await admin
      .from("payments")
      .select("stripe_payment_intent_id")
      .eq("booking_id", b.id)
      .maybeSingle();
    if (!payment?.stripe_payment_intent_id) {
      await admin
        .from("bookings")
        .update({ processing_started_at: null })
        .eq("id", b.id);
      continue;
    }

    try {
      const captured = await captureOrReconcilePaymentIntent(
        payment.stripe_payment_intent_id,
      );
      const { error: paymentUpdateError } = await admin
        .from("payments")
        .update({
          status: "succeeded",
          processing_started_at: null,
          stripe_charge_id:
            typeof captured.latest_charge === "string"
              ? captured.latest_charge
              : (captured.latest_charge as { id?: string } | null)?.id ?? null,
        })
        .eq("booking_id", b.id);
      if (paymentUpdateError) throw paymentUpdateError;

      const { error: bookingUpdateError } = await admin
        .from("bookings")
        .update({
          status: "paid_out",
          paid_out_at: new Date().toISOString(),
          processing_started_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      if (bookingUpdateError) throw bookingUpdateError;
      released += 1;
    } catch (err) {
      await admin
        .from("bookings")
        .update({ processing_started_at: null })
        .eq("id", b.id);
      errors.push({
        booking_id: b.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Supplemental overage / overtime PIs ──────────────────────────────────
  // Manual-capture PIs minted by the timesheet approval flow have a 24h hold
  // before capture, mirroring the primary PI's payout window. Tip PIs are
  // captured immediately on creation and are excluded here.
  const overageCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: supps } = await admin
    .from("payments")
    .select("id, stripe_payment_intent_id, kind, status")
    .in("kind", ["overage", "overtime"])
    .eq("status", "requires_capture")
    .lte("created_at", overageCutoff)
    .limit(200);

  let suppCaptured = 0;
  const suppErrors: { payment_id: string; error: string }[] = [];
  for (const p of (supps ?? []) as Array<{
    id: string;
    stripe_payment_intent_id: string;
    kind: string;
    status: string;
  }>) {
    if (!p.stripe_payment_intent_id) continue;

    const { data: claimedPayment, error: claimError } = await admin
      .from("payments")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("status", "requires_capture")
      .or(paymentCaptureClaimFilter())
      .select("id")
      .maybeSingle();
    const paymentClaimed = Boolean(claimedPayment) && !claimError;
    logClaimAttempt("supplemental_payment", p.id, paymentClaimed);
    if (claimError || !claimedPayment) {
      if (claimError) {
        suppErrors.push({ payment_id: p.id, error: claimError.message });
      }
      continue;
    }

    try {
      const captured = await captureOrReconcilePaymentIntent(
        p.stripe_payment_intent_id,
      );
      const { error: updateError } = await admin
        .from("payments")
        .update({
          status: "succeeded",
          processing_started_at: null,
          stripe_charge_id:
            typeof captured.latest_charge === "string"
              ? captured.latest_charge
              : (captured.latest_charge as { id?: string } | null)?.id ?? null,
        })
        .eq("id", p.id);
      if (updateError) throw updateError;
      suppCaptured += 1;
    } catch (err) {
      await admin
        .from("payments")
        .update({ processing_started_at: null })
        .eq("id", p.id);
      suppErrors.push({
        payment_id: p.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    scanned: due?.length ?? 0,
    released,
    errors,
    supplemental_scanned: supps?.length ?? 0,
    supplemental_captured: suppCaptured,
    supplemental_errors: suppErrors,
  });
}
