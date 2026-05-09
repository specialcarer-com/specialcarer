import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/release-org-payouts
 *
 * Monthly carer payout cron for ORGANISATION bookings only.
 *
 * Runs on the 1st of each month at 03:00 UTC. Captures all completed org
 * bookings from the prior calendar month, groups them by carer, and creates
 * one `org_carer_payouts` batch per carer covering that month.
 *
 * Org bookings pay carers MONTHLY — not weekly — to align with the org's
 * net-14 invoice clearing window and reduce All Care 4 U Group Ltd's
 * working-capital float. Private/seeker bookings continue to be paid
 * WEEKLY via /api/cron/release-payouts (Stripe Connect capture path).
 *
 * Carer payout still happens regardless of whether the org has paid the
 * invoice yet — All Care 4 U Group Ltd fronts the cash from its own funds.
 *
 * The actual BACS / bank transfer is performed by the finance team using the
 * batch in `org_carer_payouts` as the manifest. This cron only ASSEMBLES
 * the batches; it does not move money. Status starts as 'pending' until
 * finance marks it 'paid' via the admin UI (future Phase C deliverable).
 *
 * Idempotent: a batch is keyed (carer_id, period_start) — re-running for
 * the same period is a no-op.
 *
 * Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
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

  // Determine the prior calendar month window in UTC.
  // e.g. invoked on 2026-06-01 → period 2026-05-01 → 2026-06-01
  const now = new Date();
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodStart = new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1),
  );
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();
  const periodStartDate = periodStartIso.slice(0, 10);
  const periodEndDate = periodEndIso.slice(0, 10);

  // Pull completed org bookings in the window that have not yet been paid out.
  // Carer pay is taken from carer_pay_total_cents (set on shift completion).
  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "id, caregiver_id, carer_pay_total_cents, currency, shift_completed_at",
    )
    .eq("booking_source", "org")
    .in("status", ["completed", "invoiced"])
    .is("paid_out_at", null)
    .gte("shift_completed_at", periodStartIso)
    .lt("shift_completed_at", periodEndIso)
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by carer
  const byCarer = new Map<
    string,
    {
      total: number;
      currency: string;
      items: { booking_id: string; carer_pay_cents: number }[];
    }
  >();

  for (const b of bookings ?? []) {
    const carerId = b.caregiver_id as string | null;
    const pay = b.carer_pay_total_cents as number | null;
    if (!carerId || !pay || pay <= 0) continue;

    const existing = byCarer.get(carerId);
    if (existing) {
      existing.total += pay;
      existing.items.push({ booking_id: b.id, carer_pay_cents: pay });
    } else {
      byCarer.set(carerId, {
        total: pay,
        currency: (b.currency as string) || "gbp",
        items: [{ booking_id: b.id, carer_pay_cents: pay }],
      });
    }
  }

  const batchesCreated: string[] = [];
  const errors: { carer_id: string; error: string }[] = [];
  const nowIso = new Date().toISOString();

  for (const [carerId, batch] of byCarer.entries()) {
    try {
      // Upsert the batch (idempotent on (carer_id, period_start))
      const { data: payout, error: upErr } = await admin
        .from("org_carer_payouts")
        .upsert(
          {
            carer_id: carerId,
            period_start: periodStartDate,
            period_end: periodEndDate,
            booking_count: batch.items.length,
            total_pay_cents: batch.total,
            currency: batch.currency,
            status: "pending",
          },
          { onConflict: "carer_id,period_start" },
        )
        .select("id")
        .single();

      if (upErr || !payout) {
        errors.push({ carer_id: carerId, error: upErr?.message ?? "no row" });
        continue;
      }

      // Insert the line items (skip if already present)
      await admin.from("org_carer_payout_items").upsert(
        batch.items.map((it) => ({
          payout_id: payout.id,
          booking_id: it.booking_id,
          carer_pay_cents: it.carer_pay_cents,
        })),
        { onConflict: "payout_id,booking_id" },
      );

      // Mark each booking as paid_out_at (so it's excluded next month).
      // Note: this only marks accrual; the actual money movement happens
      // when finance processes the batch in the admin UI.
      await admin
        .from("bookings")
        .update({ paid_out_at: nowIso, updated_at: nowIso })
        .in(
          "id",
          batch.items.map((it) => it.booking_id),
        );

      batchesCreated.push(payout.id);
    } catch (err) {
      errors.push({
        carer_id: carerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    period_start: periodStartDate,
    period_end: periodEndDate,
    bookings_scanned: bookings?.length ?? 0,
    carers: byCarer.size,
    batches_created: batchesCreated.length,
    errors,
  });
}
