import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractChargeIdFromRaw,
  reconcile,
  type LedgerEvent,
  type PaymentSnapshot,
  type ReconciliationRowUpsert,
} from "./reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/refund-reconciliation
 *
 * Hourly cron that folds the last 24 hours of `refund_ledger` events
 * into the `refund_reconciliation` state-machine table. Idempotent —
 * ON CONFLICT (stripe_refund_id) DO UPDATE. Fail-closed auth via
 * requireCronAuth().
 *
 * Deploy-safe: if either table is missing (migration not yet applied)
 * we return {ok:true, skippedReason:'schema_not_ready'} rather than
 * 500ing. Same pattern as src/lib/payments/refund-ledger.ts.
 */

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

function isSchemaNotReady(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) return true;
  const msg = (err as { message?: string } | null)?.message ?? "";
  return (
    /refund_ledger.*does not exist/i.test(msg) ||
    /refund_reconciliation.*does not exist/i.test(msg)
  );
}

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  // 1. Load the last-24h window from refund_ledger.
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from("refund_ledger")
    .select(
      "booking_id, stripe_refund_id, event_type, amount_cents, currency, status, reason, raw, created_at",
    )
    .gt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (ledgerErr) {
    if (isSchemaNotReady(ledgerErr)) {
      return NextResponse.json({
        ok: true,
        skippedReason: "schema_not_ready",
        processed: 0,
        reconciled: 0,
        mismatched: 0,
      });
    }
    return NextResponse.json(
      { error: ledgerErr.message ?? "ledger read failed" },
      { status: 500 },
    );
  }

  const events: LedgerEvent[] = (ledgerRows ?? []).map((r) => ({
    booking_id: r.booking_id as string,
    stripe_refund_id: r.stripe_refund_id as string,
    amount_cents: (r.amount_cents as number) ?? 0,
    currency: (r.currency as string) ?? "gbp",
    status: (r.status as LedgerEvent["status"]) ?? "pending",
    event_type: (r.event_type as string) ?? "",
    raw: (r.raw ?? {}) as unknown,
    created_at: (r.created_at as string) ?? new Date(0).toISOString(),
  }));

  // 2. Extract distinct charge ids referenced by these events, then
  //    look up the matching payments rows in ONE round trip.
  const chargeIds = Array.from(
    new Set(
      events
        .map((e) => extractChargeIdFromRaw(e.raw))
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );

  const paymentsByChargeId = new Map<string, PaymentSnapshot>();
  if (chargeIds.length > 0) {
    const { data: paymentRows, error: paymentsErr } = await admin
      .from("payments")
      .select(
        "stripe_charge_id, stripe_payment_intent_id, amount_cents, currency, status",
      )
      .in("stripe_charge_id", chargeIds);
    if (paymentsErr) {
      if (isSchemaNotReady(paymentsErr)) {
        return NextResponse.json({
          ok: true,
          skippedReason: "schema_not_ready",
          processed: events.length,
          reconciled: 0,
          mismatched: 0,
        });
      }
      return NextResponse.json(
        { error: paymentsErr.message ?? "payments lookup failed" },
        { status: 500 },
      );
    }
    for (const p of paymentRows ?? []) {
      const chargeId = p.stripe_charge_id as string | null;
      if (!chargeId) continue;
      paymentsByChargeId.set(chargeId, {
        stripe_charge_id: chargeId,
        stripe_payment_intent_id: (p.stripe_payment_intent_id as string) ?? "",
        amount_cents: (p.amount_cents as number) ?? 0,
        currency: (p.currency as string) ?? "gbp",
        status: (p.status as string) ?? "",
      });
    }
  }

  // 3. Reduce.
  const { rows, summary } = reconcile({
    events,
    paymentsByChargeId,
    now: new Date(),
  });

  // 4. Upsert one row per stripe_refund_id.
  const upsertPayloads: ReconciliationRowUpsert[] = rows;
  if (upsertPayloads.length > 0) {
    const { error: upsertErr } = await admin
      .from("refund_reconciliation")
      .upsert(upsertPayloads, {
        onConflict: "stripe_refund_id",
      });
    if (upsertErr) {
      if (isSchemaNotReady(upsertErr)) {
        return NextResponse.json({
          ok: true,
          skippedReason: "schema_not_ready",
          processed: summary.processed,
          reconciled: 0,
          mismatched: 0,
        });
      }
      return NextResponse.json(
        { error: upsertErr.message ?? "reconciliation upsert failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    processed: summary.processed,
    reconciled: summary.reconciled,
    partial: summary.partial,
    initiated: summary.initiated,
    mismatched: summary.mismatched,
  });
}
