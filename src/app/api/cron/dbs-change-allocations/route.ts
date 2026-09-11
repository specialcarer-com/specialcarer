import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { dispatch as dispatchNotification } from "@/lib/push/notify";
import {
  planProtection,
  type AllocatedBooking,
  type ChangeEvent,
  type PlannedAction,
} from "./protection";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_EVENTS = 50;
const BATCH_BOOKINGS_PER_CARER = 100;

type SummaryResponse = {
  ok: true;
  scanned: number;
  flagged: number;
  autoCancelled: number;
  skipped: number;
  refundsAttempted: number;
  refundsFailed: number;
  errors: string[];
  skippedReason?: string;
};

/**
 * GET /api/cron/dbs-change-allocations
 *
 * Every 10 minutes. Reads unresolved dbs_change_events rows (no
 * admin_reviewed_at), finds future bookings still allocated to the
 * affected carers in states accepted/paid/in_progress, and takes the
 * A4 policy action per booking:
 *   accepted     → flag pending_review (admin decides)
 *   paid         → auto-cancel + refund escrow
 *   in_progress  → auto-cancel + refund escrow
 *
 * Idempotent: bookings already tagged for the same event are skipped.
 * Dedupe on safeguarding_alerts is enforced at the unique index level.
 *
 * The DB objects it reads (bookings.dbs_protection_status, the
 * safeguarding_alerts table) are created in migration
 * 20260911190000_dbs_allocation_protection.sql. Until that migration
 * has been applied to prod, this cron short-circuits on schema errors
 * so it is safe to deploy ahead of the migration.
 */
export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req);
  if (authFailure) return authFailure;

  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1. Pull unresolved change events.
  const { data: eventsRaw, error: eventsErr } = await admin
    .from("dbs_change_events")
    .select("id, carer_id, detected_at")
    .is("admin_reviewed_at", null)
    .order("detected_at", { ascending: true })
    .limit(BATCH_EVENTS);

  if (eventsErr) {
    // Schema-not-ready fallback: dbs_change_events exists in prod
    // already, so this is a real error. Report + 500.
    return NextResponse.json(
      { ok: false, error: `read_change_events: ${eventsErr.message}` },
      { status: 500 },
    );
  }
  const events: ChangeEvent[] = (eventsRaw ?? []).map((e) => ({
    id: e.id as string,
    carer_id: e.carer_id as string,
    detected_at: e.detected_at as string,
  }));

  if (events.length === 0) {
    return NextResponse.json<SummaryResponse>({
      ok: true,
      scanned: 0,
      flagged: 0,
      autoCancelled: 0,
      skipped: 0,
      refundsAttempted: 0,
      refundsFailed: 0,
      errors: [],
    });
  }

  // 2. Pull the affected carers' current + future bookings, and join
  //    the payment intent + amount from payments (both from
  //    stripe_connect_schema).
  const carerIds = [...new Set(events.map((e) => e.carer_id))];

  // Guarded read: if the new columns don't exist yet, short-circuit.
  const { data: bookingsRaw, error: bookingsErr } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, dbs_protection_status, dbs_protection_change_event_id, payments(stripe_payment_intent_id, amount_cents)",
    )
    .in("caregiver_id", carerIds)
    .in("status", ["accepted", "paid", "in_progress"])
    .gte("ends_at", nowIso)
    .limit(BATCH_BOOKINGS_PER_CARER * carerIds.length);

  if (bookingsErr) {
    // Schema-not-ready path: the dbs_protection_* columns don't exist
    // yet. Not an error — the cron is a no-op until the migration ships.
    if (/dbs_protection_status|column .* does not exist/i.test(bookingsErr.message)) {
      return NextResponse.json<SummaryResponse>({
        ok: true,
        scanned: 0,
        flagged: 0,
        autoCancelled: 0,
        skipped: 0,
        refundsAttempted: 0,
        refundsFailed: 0,
        errors: [],
        skippedReason: "schema_not_ready",
      });
    }
    return NextResponse.json(
      { ok: false, error: `read_bookings: ${bookingsErr.message}` },
      { status: 500 },
    );
  }

  const bookingsByCarer = new Map<string, AllocatedBooking[]>();
  for (const b of bookingsRaw ?? []) {
    const paymentsField = (b as unknown as {
      payments?:
        | { stripe_payment_intent_id: string | null; amount_cents: number | null }
        | Array<{ stripe_payment_intent_id: string | null; amount_cents: number | null }>
        | null;
    }).payments;
    const paymentRow = Array.isArray(paymentsField)
      ? (paymentsField[0] ?? null)
      : (paymentsField ?? null);

    const carerId = b.caregiver_id as string;
    if (!bookingsByCarer.has(carerId)) bookingsByCarer.set(carerId, []);
    bookingsByCarer.get(carerId)!.push({
      id: b.id as string,
      seeker_id: b.seeker_id as string,
      caregiver_id: carerId,
      status: b.status as AllocatedBooking["status"],
      starts_at: b.starts_at as string,
      ends_at: b.ends_at as string,
      stripe_payment_intent_id: paymentRow?.stripe_payment_intent_id ?? null,
      amount_cents: paymentRow?.amount_cents ?? null,
      dbs_protection_status:
        ((b as { dbs_protection_status?: string | null }).dbs_protection_status) ?? null,
      dbs_protection_change_event_id:
        ((b as { dbs_protection_change_event_id?: string | null }).dbs_protection_change_event_id) ?? null,
    });
  }

  // 3. Build the plan.
  const plan = planProtection(events, bookingsByCarer, now);

  // 4. Apply.
  let refundsAttempted = 0;
  let refundsFailed = 0;
  const errors: string[] = [];

  for (const planned of plan.actions) {
    try {
      await applyAction(admin, planned, nowIso, {
        onRefundAttempt: () => refundsAttempted++,
        onRefundFailure: (msg) => {
          refundsFailed++;
          errors.push(`refund ${planned.bookingId}: ${msg}`);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`apply ${planned.bookingId}: ${msg}`);
    }
  }

  return NextResponse.json<SummaryResponse>({
    ok: true,
    scanned: plan.scanned,
    flagged: plan.flagged,
    autoCancelled: plan.autoCancelled,
    skipped: plan.skipped,
    refundsAttempted,
    refundsFailed,
    errors,
  });
}

/**
 * Apply one planned action: write the alert (dedupe-safe), update the
 * booking's dbs_protection_* fields, and — for auto-cancel — trigger
 * the Stripe refund and push notifications.
 */
async function applyAction(
  admin: ReturnType<typeof createAdminClient>,
  planned: PlannedAction,
  nowIso: string,
  hooks: {
    onRefundAttempt: () => void;
    onRefundFailure: (msg: string) => void;
  },
): Promise<void> {
  if (planned.action.kind === "skip") return;

  const category =
    planned.action.kind === "flag_pending"
      ? "dbs_change_allocated_booking"
      : "dbs_change_auto_cancel";

  const severity =
    planned.action.kind === "auto_cancel" ? "blocking" : "high";

  // Alert (dedupe via unique index on (booking, event, category)).
  const { error: alertErr } = await admin.from("safeguarding_alerts").insert({
    severity,
    category,
    booking_id: planned.bookingId,
    carer_id: planned.carerId,
    seeker_id: planned.seekerId,
    related_event_id: planned.changeEventId,
    payload: { reason: planned.action.reason, action: planned.action.kind },
  });
  if (alertErr && alertErr.code !== "23505") {
    throw new Error(`alert insert: ${alertErr.message}`);
  }

  if (planned.action.kind === "flag_pending") {
    await admin
      .from("bookings")
      .update({
        dbs_protection_status: "pending_review",
        dbs_protection_change_event_id: planned.changeEventId,
        dbs_protection_action_at: nowIso,
        dbs_protection_reason: planned.action.reason,
      })
      .eq("id", planned.bookingId);
    return;
  }

  // auto_cancel: refund + cancel + notify.
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("payments(stripe_payment_intent_id)")
    .eq("id", planned.bookingId)
    .maybeSingle();
  const paymentsField2 = (bookingRow as unknown as {
    payments?:
      | { stripe_payment_intent_id: string | null }
      | Array<{ stripe_payment_intent_id: string | null }>
      | null;
  } | null)?.payments;
  const paymentRow = Array.isArray(paymentsField2)
    ? (paymentsField2[0] ?? null)
    : (paymentsField2 ?? null);
  const pi = paymentRow?.stripe_payment_intent_id ?? null;

  if (pi && planned.action.refundCents > 0) {
    hooks.onRefundAttempt();
    try {
      await stripe.refunds.create(
        {
          payment_intent: pi,
          amount: planned.action.refundCents,
          reason: "requested_by_customer",
          metadata: {
            source: "dbs_change_allocations_cron",
            booking_id: planned.bookingId,
            change_event_id: planned.changeEventId,
          },
        },
        {
          idempotencyKey: `dbs-cancel-${planned.bookingId}-${planned.changeEventId}`,
        },
      );
    } catch (err) {
      hooks.onRefundFailure(err instanceof Error ? err.message : String(err));
      // Fall through — mark booking + notify regardless, so the seeker
      // knows and admin can chase the refund via the A3 reconciler.
    }
  }

  await admin
    .from("bookings")
    .update({
      status: "cancelled",
      dbs_protection_status: "auto_cancelled",
      dbs_protection_change_event_id: planned.changeEventId,
      dbs_protection_action_at: nowIso,
      dbs_protection_reason: planned.action.reason,
      updated_at: nowIso,
    })
    .eq("id", planned.bookingId);

  // Notify both parties.
  await dispatchNotification({
    type: "booking.cancelled",
    bookingId: planned.bookingId,
    cancelledBy: "system",
    recipientId: planned.seekerId,
    reason: "Safeguarding review — DBS status changed",
  }).catch(() => {
    /* notification failure never blocks the safeguarding write */
  });
  await dispatchNotification({
    type: "booking.cancelled",
    bookingId: planned.bookingId,
    cancelledBy: "system",
    recipientId: planned.carerId,
    reason: "Safeguarding review — DBS status changed",
  }).catch(() => {});
}
