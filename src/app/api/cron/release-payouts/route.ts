import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/release-payouts
 *
 * Vercel Cron entry-point. Captures all completed bookings whose 24-hour
 * hold has elapsed. Idempotent — only acts on bookings still in `completed`.
 *
 * Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
 * For local/manual triggers we fall back to the same env var.
 */
export async function GET(req: Request) {
  // Vercel Cron auth — reject if a secret is configured and doesn't match
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
    const { data: payment } = await admin
      .from("payments")
      .select("stripe_payment_intent_id")
      .eq("booking_id", b.id)
      .maybeSingle();
    if (!payment?.stripe_payment_intent_id) continue;

    try {
      const captured = await stripe.paymentIntents.capture(
        payment.stripe_payment_intent_id,
      );
      await admin
        .from("payments")
        .update({
          status: "succeeded",
          stripe_charge_id:
            typeof captured.latest_charge === "string"
              ? captured.latest_charge
              : (captured.latest_charge as { id?: string } | null)?.id ?? null,
        })
        .eq("booking_id", b.id);
      await admin
        .from("bookings")
        .update({
          status: "paid_out",
          paid_out_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      released += 1;
    } catch (err) {
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
    try {
      const captured = await stripe.paymentIntents.capture(
        p.stripe_payment_intent_id,
      );
      await admin
        .from("payments")
        .update({
          status: "succeeded",
          stripe_charge_id:
            typeof captured.latest_charge === "string"
              ? captured.latest_charge
              : (captured.latest_charge as { id?: string } | null)?.id ?? null,
        })
        .eq("id", p.id);
      suppCaptured += 1;
    } catch (err) {
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
