import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  DEFAULT_STALE_AFTER_MS,
  reconcileStuckRefunds,
  type ReconcilerClient,
  type StripeRefundView,
  type StuckClaim,
} from "./reconciler";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/refund-reconciler
 *
 * Sweeps orphaned refund claims out of `pending_stripe` and
 * `pending_db_reconciliation` back to a terminal state (`completed` or
 * `failed_permanent`). Runs every 15 minutes via Vercel cron and is
 * idempotent — a claim already in a terminal state is not selected.
 *
 * See reconciler.ts for the pure decision matrix. All Supabase / Stripe
 * I/O is confined to this file so the handler stays trivial to unit-test.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  const client: ReconcilerClient = {
    async findStuck(staleAfterMs) {
      const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
      const { data, error } = await admin
        .from("bookings")
        .select("id, refund_request_key, refund_status, updated_at")
        .in("refund_status", ["pending_stripe", "pending_db_reconciliation"])
        .not("refund_request_key", "is", null)
        .lt("updated_at", staleBefore)
        .limit(200);
      if (error) return { claims: [], error: error.message };
      const now = Date.now();
      const claims: StuckClaim[] = (data ?? [])
        .filter(
          (row): row is {
            id: string;
            refund_request_key: string;
            refund_status: "pending_stripe" | "pending_db_reconciliation";
            updated_at: string;
          } =>
            typeof row.refund_request_key === "string" &&
            (row.refund_status === "pending_stripe" ||
              row.refund_status === "pending_db_reconciliation"),
        )
        .map((row) => ({
          bookingId: row.id,
          refundRequestKey: row.refund_request_key,
          refundStatus: row.refund_status,
          ageMs: Math.max(0, now - new Date(row.updated_at).getTime()),
        }));
      return { claims, error: null };
    },

    async findStripeRefundByKey(requestKey) {
      // Stripe does not index refunds by metadata server-side, so we page
      // through the most recent refunds and match on our metadata field.
      // The reconciler only runs against stale claims, so the target
      // refund — if it exists — was created recently enough to be in the
      // first page or two.
      try {
        for await (const r of stripe.refunds.list({ limit: 100 })) {
          if (r.metadata?.refund_request_key === requestKey) {
            return { refund: toView(r), error: null };
          }
        }
        return { refund: null, error: null };
      } catch (err) {
        return {
          refund: null,
          error: err instanceof Error ? err.message : "stripe_list_error",
        };
      }
    },

    async markCompleted(input) {
      const refundedAt = input.refund.createdAt;
      // Fetch the associated payment_intent's total so we can decide
      // between 'refunded' vs 'partially_refunded'. If the intent lookup
      // fails we conservatively mark it partially refunded — the webhook,
      // if it later arrives, will flip it to 'refunded' when appropriate.
      let bookingStatus: "refunded" | "partially_refunded" = "partially_refunded";
      try {
        const pi = await stripe.paymentIntents.retrieve(input.refund.paymentIntentId);
        if (typeof pi.amount === "number" && pi.amount === input.refund.amountCents) {
          bookingStatus = "refunded";
        }
      } catch (err) {
        console.error(
          "[cron.refund-reconciler] payment_intent lookup failed",
          err,
        );
      }

      const { error: bookingErr } = await admin
        .from("bookings")
        .update({
          stripe_refund_id: input.refund.id,
          refunded_amount_cents: input.refund.amountCents,
          refunded_at: refundedAt,
          refund_request_key: null,
          refund_status: "completed",
          status: bookingStatus,
        })
        .eq("id", input.bookingId)
        .eq("refund_request_key", input.requestKey);
      if (bookingErr) return { error: bookingErr.message };

      // Also flip the payment row so downstream reports see it. Only the
      // most recent succeeded payment on this booking is touched — mirrors
      // what the webhook path does.
      const { error: paymentErr } = await admin
        .from("payments")
        .update({ status: bookingStatus })
        .eq("booking_id", input.bookingId)
        .eq("status", "succeeded");
      if (paymentErr) return { error: paymentErr.message };
      return { error: null };
    },

    async markFailed(input) {
      const { error } = await admin
        .from("bookings")
        .update({
          refund_status: "failed_permanent",
          refund_request_key: null,
        })
        .eq("id", input.bookingId)
        .eq("refund_request_key", input.requestKey);
      if (error) return { error: error.message };
      console.warn(
        `[cron.refund-reconciler] booking ${input.bookingId} refund marked failed_permanent: ${input.reason}`,
      );
      return { error: null };
    },
  };

  const res = await reconcileStuckRefunds(client, {
    staleAfterMs: DEFAULT_STALE_AFTER_MS,
  });
  if (res.body.ok) {
    console.log(
      `[cron.refund-reconciler] scanned ${res.body.scanned}, completed ${res.body.completed}, failed ${res.body.failed}, still_pending ${res.body.still_pending}, errors ${res.body.errors}`,
    );
  } else {
    console.error("[cron.refund-reconciler] failed:", res.body.error);
  }
  return NextResponse.json(res.body, { status: res.status });
}

function toView(r: {
  id: string;
  status: string | null;
  amount: number;
  payment_intent: string | { id: string } | null;
  created: number;
  failure_reason?: string | null;
}): StripeRefundView {
  const paymentIntentId =
    typeof r.payment_intent === "string"
      ? r.payment_intent
      : (r.payment_intent?.id ?? "");
  return {
    id: r.id,
    status: normaliseStatus(r.status),
    amountCents: r.amount,
    paymentIntentId,
    createdAt: new Date(r.created * 1000).toISOString(),
    failureReason: r.failure_reason ?? null,
  };
}

function normaliseStatus(s: string | null): StripeRefundView["status"] {
  switch (s) {
    case "succeeded":
    case "failed":
    case "canceled":
    case "requires_action":
    case "pending":
      return s;
    default:
      // Stripe occasionally invents new terminal states. Treat unknown as
      // still-pending so we retry rather than mistakenly finalising.
      return "pending";
  }
}
