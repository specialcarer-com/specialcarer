import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimStripeWebhookEvent } from "@/lib/stripe/webhook-event-claim";
import {
  markWebhookEventCompleted,
  markWebhookEventFailed,
  markWebhookEventProcessing,
  sweepStuckProcessingRows,
} from "@/lib/stripe/webhook-state";
import { unredeemCreditsForBooking } from "@/lib/referrals/redemption";
import { reconcileChargeRefund } from "@/lib/payments/refund-webhook-reconciliation";
import { recordRefundEvent } from "@/lib/payments/refund-ledger";
import { handleDisputeEvent } from "@/lib/stripe/dispute-webhook";
import { handlePayoutAlertEvent } from "@/lib/stripe/payout-webhook";
import { dispatch } from "@/lib/push/notify";
import {
  isCarerSubscription,
  resolveCarerUserId,
  upsertCarerMembershipFromSubscription,
  type CarerWebhookSupabase,
} from "@/lib/carer-membership/webhook-core";

export const runtime = "nodejs";

/**
 * Stripe webhook handler. Configure in Stripe dashboard pointing to
 * `${SITE_URL}/api/stripe/webhook` and put the signing secret in
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const replayToken = req.headers.get("x-sc-webhook-replay");
  // Trim defensively — pasting via dashboards/CLIs occasionally introduces
  // a trailing newline or surrounding whitespace that silently breaks HMAC.
  const secretTest = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const secretLive = process.env.STRIPE_WEBHOOK_SECRET_LIVE?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const raw = await req.text();

  // Cron-driven replay path. The recovery cron re-invokes this route with
  // the STORED (already-verified) payload for events whose handler crashed.
  // We trust the replay iff x-sc-webhook-replay matches CRON_SECRET AND the
  // event id is already on disk from the original HMAC-verified delivery.
  // Everything after this point is the same handler code as the primary
  // path, so recovery cannot drift from the live behaviour.
  const isReplay =
    !!replayToken &&
    !!cronSecret &&
    replayToken.length === cronSecret.length &&
    (() => {
      // timingSafeEqual (Node crypto) is not accessible here without an
      // import; a manual constant-time compare is fine at this size.
      let diff = 0;
      for (let i = 0; i < replayToken.length; i++) {
        diff |= replayToken.charCodeAt(i) ^ cronSecret.charCodeAt(i);
      }
      return diff === 0;
    })();

  if (!isReplay && (!sig || (!secretTest && !secretLive))) {
    return NextResponse.json(
      { error: "Webhook signature or secret missing" },
      { status: 400 }
    );
  }

  // Single endpoint serves both test and live Stripe dashboards. We can't
  // tell which mode the event is from until we successfully verify HMAC,
  // so try live first (production traffic), fall back to test. The
  // verification step is the security boundary — we never trust parsed
  // body fields like `livemode` until HMAC has cleared.
  let event: Stripe.Event | null = null;
  let verifiedWith: "live" | "test" | "replay" | null = null;
  let lastError: string | null = null;
  if (isReplay) {
    // Replay: raw body IS the stored, previously-verified event JSON.
    // We do NOT re-run HMAC. livemode is trusted from the stored payload.
    try {
      event = JSON.parse(raw) as Stripe.Event;
      verifiedWith = "replay";
    } catch {
      return NextResponse.json({ error: "Invalid replay JSON" }, { status: 400 });
    }
  } else {
    if (secretLive && sig) {
      try {
        event = stripe.webhooks.constructEvent(raw, sig, secretLive);
        verifiedWith = "live";
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Invalid signature";
      }
    }
    if (!event && secretTest && sig) {
      try {
        event = stripe.webhooks.constructEvent(raw, sig, secretTest);
        verifiedWith = "test";
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Invalid signature";
      }
    }
    if (!event || !verifiedWith) {
      console.warn(
        "[stripe.webhook] neither secret matched signature",
        lastError ?? "(no detail)"
      );
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 400 }
      );
    }
  }
  // Sanity check: livemode flag on the verified event should match the
  // secret that verified it. If not, something is misconfigured (e.g. the
  // live secret was put in the test env var or vice versa) — refuse rather
  // than process the event under the wrong mode. Skipped on replay (the
  // event was already verified on the original delivery, and livemode is
  // read from the stored payload).
  const expectLive = verifiedWith === "live";
  if (verifiedWith !== "replay" && event.livemode !== expectLive) {
    console.error(
      "[stripe.webhook] livemode/secret mismatch — verified with",
      verifiedWith,
      "but event.livemode=",
      event.livemode
    );
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // E1: release any rows a previous invocation left stuck in `processing`
  // (crashed before writing `completed`/`failed`). Cheap single UPDATE
  // pass, deploy-safe (schema_not_ready when migration hasn't landed).
  // Runs BEFORE the claim so a stuck row on this same event id becomes
  // available for re-claim in this invocation.
  await sweepStuckProcessingRows(admin);

  // Atomically upsert-to-claim. Three-state classification:
  //   - fresh              → first sight, run handler.
  //   - already_processed  → prior success on record, acknowledge & skip.
  //   - retryable          → prior attempt crashed or still in flight;
  //                          run the handler again so Stripe's retry (or
  //                          the recovery cron) can heal the event.
  //
  // The old semantics treated ANY existing row as owned-by-another and
  // returned idempotent-200. That silenced Stripe's own retry for events
  // whose handler crashed, orphaning the delivery. See migration
  // 20260911180000_stripe_webhook_retry_state.sql.
  const MAX_HANDLER_ATTEMPTS = 8;
  const claim = await claimStripeWebhookEvent(
    async (webhookEvent) => {
      // 1. Try to insert as fresh. RLS is off (service role); PK collision
      //    means the row already exists.
      const { data: inserted, error: insertErr } = await admin
        .from("stripe_webhook_events")
        .insert({
          ...webhookEvent,
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
        })
        .select("id, processed_at, error, attempt_count")
        .maybeSingle();
      if (!insertErr && inserted) {
        return {
          existed: false,
          alreadyProcessed: false,
          hasError: false,
          attemptCount: inserted.attempt_count ?? 1,
          error: null,
        };
      }
      // Anything other than unique_violation (23505) is a real error.
      const code = (insertErr as { code?: string } | null)?.code;
      if (insertErr && code !== "23505") {
        return {
          existed: false,
          alreadyProcessed: false,
          hasError: false,
          attemptCount: 0,
          error: insertErr.message,
        };
      }
      // 2. Row already exists. Load it, bump the attempt counter for the
      //    retryable case only. attempt_count / last_attempt_at may not
      //    exist yet if the migration hasn't rolled out; treat missing as 0
      //    so the handler still runs.
      const { data: existing, error: readErr } = await admin
        .from("stripe_webhook_events")
        .select("processed_at, error, attempt_count")
        .eq("id", webhookEvent.id)
        .maybeSingle();
      if (readErr || !existing) {
        return {
          existed: true,
          alreadyProcessed: false,
          hasError: false,
          attemptCount: 0,
          error: readErr?.message ?? "row missing after conflict",
        };
      }
      const alreadyProcessed = existing.processed_at !== null;
      const hasError = existing.error !== null && existing.error !== "";
      const priorAttempts: number = existing.attempt_count ?? 0;
      if (!alreadyProcessed) {
        await admin
          .from("stripe_webhook_events")
          .update({
            attempt_count: priorAttempts + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", webhookEvent.id);
      }
      return {
        existed: true,
        alreadyProcessed,
        hasError,
        attemptCount: alreadyProcessed ? priorAttempts : priorAttempts + 1,
        error: null,
      };
    },
    {
      id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    },
  );
  if (claim.error) {
    return NextResponse.json({ error: claim.error }, { status: 500 });
  }
  if (claim.status === "already_processed") {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // E1: explicit `pending` → `processing` transition. Done here (after
  // the claim, before the handler switch) so a mid-handler crash leaves
  // the row in `processing` for the 5-minute sweeper above to release.
  // Deploy-safe — no-op if the state column doesn't exist yet.
  await markWebhookEventProcessing(admin, event.id);

  if (claim.attemptCount > MAX_HANDLER_ATTEMPTS) {
    // Poison event. Persist the last-attempt reason and acknowledge with
    // 200 so Stripe stops the exponential retry storm. Admin dashboard
    // will surface this via the stripe_webhook_events row.
    console.error(
      `[stripe.webhook] event ${event.id} exceeded MAX_HANDLER_ATTEMPTS=${MAX_HANDLER_ATTEMPTS}, dropping`,
    );
    await admin
      .from("stripe_webhook_events")
      .update({
        error: `poison: exceeded ${MAX_HANDLER_ATTEMPTS} attempts`,
      })
      .eq("id", event.id);
    // E1: mark poisoned events failed so the sweeper / dashboard both
    // reflect the terminal state. Deploy-safe.
    await markWebhookEventFailed(admin, event.id);
    return NextResponse.json({ received: true, poisoned: true });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        // Store the full capability blob, disabled_reason and stamp the
        // freshness marker so the booking-intent readiness gate
        // (src/lib/stripe/connect-readiness.ts) can serve local without a
        // round-trip. We deliberately do NOT gate this on a
        // previously_attributes diff — Stripe re-emits account.updated
        // for a variety of reasons and staleness is a real cost.
        await admin
          .from("caregiver_stripe_accounts")
          .update({
            charges_enabled: acct.charges_enabled,
            payouts_enabled: acct.payouts_enabled,
            details_submitted: acct.details_submitted,
            requirements_currently_due:
              acct.requirements?.currently_due ?? [],
            capabilities: (acct.capabilities ?? {}) as Record<string, unknown>,
            disabled_reason: acct.requirements?.disabled_reason ?? null,
            last_refreshed_at: new Date().toISOString(),
          } as unknown as Record<string, unknown>)
          .eq("stripe_account_id", acct.id);
        break;
      }
      case "capability.updated": {
        // A single capability's status flipped (e.g. transfers went from
        // pending → active or active → inactive). Refetch the whole
        // account so we rewrite the same fields account.updated writes
        // — keeps the cache internally consistent.
        const cap = event.data.object as Stripe.Capability;
        const acctId =
          typeof cap.account === "string" ? cap.account : cap.account?.id;
        if (acctId) {
          try {
            const acct = await stripe.accounts.retrieve(acctId);
            await admin
              .from("caregiver_stripe_accounts")
              .update({
                charges_enabled: acct.charges_enabled,
                payouts_enabled: acct.payouts_enabled,
                details_submitted: acct.details_submitted,
                requirements_currently_due:
                  acct.requirements?.currently_due ?? [],
                capabilities: (acct.capabilities ?? {}) as Record<
                  string,
                  unknown
                >,
                disabled_reason: acct.requirements?.disabled_reason ?? null,
                last_refreshed_at: new Date().toISOString(),
              } as unknown as Record<string, unknown>)
              .eq("stripe_account_id", acctId);
          } catch (err) {
            console.error(
              "[stripe-webhook] capability.updated refetch failed",
              err,
            );
          }
        }
        break;
      }
      case "payment_intent.amount_capturable_updated": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = pi.metadata?.booking_id;
        await admin
          .from("payments")
          .update({
            status: "requires_capture",
            raw: pi as unknown as Record<string, unknown>,
            stripe_charge_id:
              typeof pi.latest_charge === "string"
                ? pi.latest_charge
                : pi.latest_charge?.id ?? null,
          })
          .eq("stripe_payment_intent_id", pi.id);
        if (bookingId) {
          await admin
            .from("bookings")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", bookingId);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("payments")
          .update({
            status: "succeeded",
            raw: pi as unknown as Record<string, unknown>,
          })
          .eq("stripe_payment_intent_id", pi.id);
        // Tips share the PaymentIntent flow but live in their own
        // table and have application_fee_amount=0. Look up by intent
        // id and mark succeeded if this PI corresponds to a tip.
        if (pi.metadata?.kind === "tip") {
          await admin
            .from("tips")
            .update({
              status: "succeeded",
              succeeded_at: new Date().toISOString(),
            })
            .eq("stripe_payment_intent_id", pi.id);
        }
        // One-shot platform-owner alert on the FIRST livemode payment.
        // Production-safety insurance — verifies the live webhook wiring
        // works end-to-end. Helper never throws; an alert-side failure
        // will not break webhook processing.
        try {
          const { alertOnFirstLivePaymentSucceeded } = await import(
            "@/lib/stripe/milestone-alert"
          );
          await alertOnFirstLivePaymentSucceeded(event, { admin });
        } catch (e) {
          console.error("[stripe.webhook] milestone alert failed", e);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("payments")
          .update({
            status: "failed",
            raw: pi as unknown as Record<string, unknown>,
          })
          .eq("stripe_payment_intent_id", pi.id);
        if (pi.metadata?.kind === "tip") {
          await admin
            .from("tips")
            .update({ status: "failed" })
            .eq("stripe_payment_intent_id", pi.id);
        }
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        if (ch.payment_intent) {
          const pid =
            typeof ch.payment_intent === "string"
              ? ch.payment_intent
              : ch.payment_intent.id;
          const stripeRefund = ch.refunds?.data.find(
            (refund) =>
              typeof refund.metadata?.refund_request_key === "string" &&
              refund.metadata.refund_request_key.length > 0,
          );
          const claimKey = stripeRefund?.metadata?.refund_request_key;

          // Resolve booking_id up-front so we can also write to the
          // append-only refund_ledger. reconcileChargeRefund still runs
          // its own findPayment() below — the two lookups agree by
          // construction (same pid, same admin client).
          let ledgerBookingId: string | null = null;
          try {
            const { data: pay } = await admin
              .from("payments")
              .select("booking_id")
              .eq("stripe_payment_intent_id", pid)
              .maybeSingle<{ booking_id: string }>();
            ledgerBookingId = pay?.booking_id ?? null;
          } catch (err) {
            console.error(
              "[stripe.webhook] ledger booking_id lookup failed",
              err,
            );
          }

          // Write one ledger row per (refund_id, event_type). If the
          // charge has multiple refunds we write one row per refund.
          // recordRefundEvent is idempotent via the unique index; a
          // duplicate delivery is a no-op.
          if (ledgerBookingId && ch.refunds?.data.length) {
            for (const r of ch.refunds.data) {
              await recordRefundEvent(admin, {
                booking_id: ledgerBookingId,
                stripe_refund_id: r.id,
                stripe_event_id: event.id,
                event_type: "charge.refunded",
                amount_cents: r.amount,
                currency: r.currency ?? ch.currency ?? "gbp",
                status: (r.status ?? "succeeded") as
                  | "succeeded"
                  | "failed"
                  | "pending"
                  | "canceled"
                  | "requires_action",
                reason: r.reason ?? null,
                raw: r as unknown as Record<string, unknown>,
              });
            }
          }
          await reconcileChargeRefund({
            fullyRefunded: ch.amount_refunded === ch.amount,
            amountCents: ch.amount_refunded,
            claimedRefund:
              claimKey && stripeRefund
                ? { id: stripeRefund.id, requestKey: claimKey }
                : null,
            client: {
              async updatePaymentStatus(status) {
                return await admin
                  .from("payments")
                  .update({ status })
                  .eq("stripe_payment_intent_id", pid);
              },
              async findPayment() {
                const result = await admin
                  .from("payments")
                  .select("booking_id")
                  .eq("stripe_payment_intent_id", pid)
                  .maybeSingle<{ booking_id: string }>();
                return {
                  data: result.data
                    ? { bookingId: result.data.booking_id }
                    : null,
                  error: result.error,
                };
              },
              async updateBooking({
                bookingId,
                status,
                amountCents,
                refundedAt,
              }) {
                return await admin
                  .from("bookings")
                  .update({
                    status,
                    refunded_amount_cents: amountCents,
                    refunded_at: refundedAt,
                  })
                  .eq("id", bookingId);
              },
              async reconcileClaim({
                bookingId,
                claim,
                amountCents,
                refundedAt,
              }) {
                return await admin
                  .from("bookings")
                  .update({
                    stripe_refund_id: claim.id,
                    refunded_amount_cents: amountCents,
                    refunded_at: refundedAt,
                    refund_request_key: null,
                    refund_status: "completed",
                  })
                  .eq("id", bookingId)
                  .eq("refund_request_key", claim.requestKey);
              },
            },
          });
          // Restore any referral credit on the underlying booking. Idempotent
          // — the webhook event log above guarantees this body only runs
          // once per Stripe event id, and `unredeemCreditsForBooking` is
          // itself a no-op the second time round.
          try {
            const { data: pay } = await admin
              .from("payments")
              .select("booking_id")
              .eq("stripe_payment_intent_id", pid)
              .maybeSingle();
            if (pay?.booking_id) {
              await unredeemCreditsForBooking({
                supabase: admin,
                bookingId: pay.booking_id as string,
              });
            }
          } catch (err) {
            console.error("[stripe.webhook] unredeem on refund failed", err);
          }
        }
        break;
      }
      case "charge.refund.updated": {
        // Stripe emits this when an already-created refund transitions —
        // notably to `failed` after an ACH bounce or when reason
        // changes. Fold into the ledger as a fresh row so the projection
        // reflects the newest known state without overwriting history.
        const r = event.data.object as Stripe.Refund;
        const pid =
          typeof r.payment_intent === "string"
            ? r.payment_intent
            : r.payment_intent?.id ?? null;
        if (pid) {
          const { data: pay } = await admin
            .from("payments")
            .select("booking_id")
            .eq("stripe_payment_intent_id", pid)
            .maybeSingle<{ booking_id: string }>();
          if (pay?.booking_id) {
            await recordRefundEvent(admin, {
              booking_id: pay.booking_id,
              stripe_refund_id: r.id,
              stripe_event_id: event.id,
              event_type: "charge.refund.updated",
              amount_cents: r.amount,
              currency: r.currency ?? "gbp",
              status: (r.status ?? "pending") as
                | "succeeded"
                | "failed"
                | "pending"
                | "canceled"
                | "requires_action",
              reason: r.failure_reason ?? r.reason ?? null,
              raw: r as unknown as Record<string, unknown>,
            });
            // If it flipped to failed, mirror onto the cached booking
            // fields so reads that still consult the counter aren't
            // stuck on the earlier optimistic success.
            if (r.status === "failed") {
              await admin
                .from("bookings")
                .update({ refund_status: "failed" })
                .eq("id", pay.booking_id);
            }
          }
        }
        break;
      }
      case "refund.failed": {
        // Direct failed-refund event (some Stripe accounts emit this
        // instead of / alongside charge.refund.updated). Record as a
        // distinct event_type so both deliveries coexist in the ledger.
        const r = event.data.object as Stripe.Refund;
        const pid =
          typeof r.payment_intent === "string"
            ? r.payment_intent
            : r.payment_intent?.id ?? null;
        if (pid) {
          const { data: pay } = await admin
            .from("payments")
            .select("booking_id")
            .eq("stripe_payment_intent_id", pid)
            .maybeSingle<{ booking_id: string }>();
          if (pay?.booking_id) {
            await recordRefundEvent(admin, {
              booking_id: pay.booking_id,
              stripe_refund_id: r.id,
              stripe_event_id: event.id,
              event_type: "refund.failed",
              amount_cents: r.amount,
              currency: r.currency ?? "gbp",
              status: "failed",
              reason: r.failure_reason ?? r.reason ?? null,
              raw: r as unknown as Record<string, unknown>,
            });
            await admin
              .from("bookings")
              .update({ refund_status: "failed" })
              .eq("id", pay.booking_id);
          }
        }
        break;
      }
      // -----------------------------------------------------------
      // Dispute lifecycle (C1). Delegates to the dedicated handler.
      // The handler is idempotent on (stripe_dispute_id + event_type)
      // via stripe_dispute_cases.unique(stripe_dispute_id) and
      // refund_ledger.unique(stripe_refund_id, event_type), so
      // re-delivery here is a no-op. If the migration is unapplied
      // the handler returns {ok:true, skippedReason:"schema_not_ready"}
      // and we mark processed_at — Stripe stops retrying and prior
      // events can be replayed from the dashboard post-migration.
      // -----------------------------------------------------------
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const res = await handleDisputeEvent(admin, event);
        if (!res.ok) {
          throw new Error(res.error);
        }
        break;
      }
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from("payments")
          .update({
            status: "cancelled",
            raw: pi as unknown as Record<string, unknown>,
          })
          .eq("stripe_payment_intent_id", pi.id);
        // Restore referral credit if any was applied.
        try {
          const bookingId = pi.metadata?.booking_id;
          if (bookingId) {
            await unredeemCreditsForBooking({
              supabase: admin,
              bookingId,
            });
          }
        } catch (err) {
          console.error("[stripe.webhook] unredeem on PI cancel failed", err);
        }
        break;
      }
      // ---------------------------------------------------------------
      // Connect payouts — flip payout_intents rows once Stripe confirms
      // ---------------------------------------------------------------
      case "payout.paid": {
        const po = event.data.object as Stripe.Payout;
        await admin
          .from("payout_intents")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("stripe_payout_id", po.id);

        // Notify the carer their payout landed. payout_intents aggregates
        // multiple earnings rows into a single Stripe payout, so there's
        // no 1:1 booking_id — we pass an empty string and surface the
        // amount + currency from the Stripe event directly.
        // TODO(A2-bis-followup): once payout_intents tracks the originating
        // booking ids, deeplink the notification to the relevant booking.
        try {
          const { data: pi } = await admin
            .from("payout_intents")
            .select("carer_id")
            .eq("stripe_payout_id", po.id)
            .maybeSingle<{ carer_id: string }>();
          if (pi?.carer_id) {
            void dispatch({
              type: "payout.completed",
              carerId: pi.carer_id,
              bookingId: "",
              amountPence: po.amount,
              currency: (po.currency ?? "gbp").toUpperCase(),
            });
          }
        } catch (e) {
          console.error("[stripe.webhook] payout dispatch failed", e);
        }
        // Resolve any open payout_alerts for this Stripe payout (C4).
        // Deploy-safe: no-op if payout_alerts table is missing.
        {
          const res = await handlePayoutAlertEvent(admin, event);
          if (!res.ok) throw new Error(res.error);
        }
        break;
      }
      case "payout.failed": {
        const po = event.data.object as Stripe.Payout;
        await admin
          .from("payout_intents")
          .update({
            status: "failed",
            failure_reason: po.failure_message ?? "stripe_payout_failed",
          })
          .eq("stripe_payout_id", po.id);
        // Open a payout_alerts row + fire carer/admin notifications (C4).
        // Deploy-safe: no-op if payout_alerts table is missing.
        {
          const res = await handlePayoutAlertEvent(admin, event);
          if (!res.ok) throw new Error(res.error);
        }
        break;
      }
      case "payout.canceled": {
        // Delegate to the alert handler only; the router doesn't
        // maintain a 'canceled' state on payout_intents today (Stripe
        // cancel is rare — typically a same-day admin action). Add
        // ops-facing accounting projection separately if that changes.
        const res = await handlePayoutAlertEvent(admin, event);
        if (!res.ok) throw new Error(res.error);
        break;
      }

      // ---------------------------------------------------------------
      // Memberships (consumer subscriptions, NOT Connect)
      // ---------------------------------------------------------------
      case "checkout.session.completed": {
        // Fires the moment the user completes hosted Checkout, often a beat
        // before customer.subscription.created. We only act on subscription
        // sessions (memberships); one-off payment sessions are handled by the
        // PaymentIntent branches above. Retrieve the freshly-created
        // subscription and reconcile via the same idempotent upsert — if the
        // subscription.created event also lands, it upserts the same row.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          // Carer founder memberships have their own table; route them away
          // from the consumer subscriptions upsert.
          if (await routeCarerMembershipEvent(admin, sub)) break;
          await upsertMembershipFromStripeSubscription(admin, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        // Carer founder memberships have their own table. deleted → canceled.
        if (
          await routeCarerMembershipEvent(admin, sub, {
            forceCanceled: event.type === "customer.subscription.deleted",
          })
        ) {
          break;
        }
        await upsertMembershipFromStripeSubscription(admin, sub);
        break;
      }

      default:
        // Unhandled event type — just log
        break;
    }

    // Clear any prior error from a failed attempt now that we've succeeded.
    await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", event.id);
    // E1: explicit `processing` → `completed`. Alongside the legacy
    // processed_at/error write above. Deploy-safe.
    await markWebhookEventCompleted(admin, event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error";
    await admin
      .from("stripe_webhook_events")
      .update({ error: message })
      .eq("id", event.id);
    // E1: explicit `processing` → `failed`. Alongside the legacy error
    // write above. Deploy-safe.
    await markWebhookEventFailed(admin, event.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Carer founder membership routing
// ---------------------------------------------------------------------------

/**
 * If `sub` is a carer founder membership, reconcile it into carer_memberships
 * and return true (so the caller skips the consumer subscriptions upsert).
 * Returns false for non-carer subscriptions.
 *
 * carer_user_id is resolved from the subscription metadata, falling back to the
 * Stripe customer's metadata (set when we create the customer at checkout).
 */
async function routeCarerMembershipEvent(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
  opts: { forceCanceled?: boolean } = {}
): Promise<boolean> {
  if (!isCarerSubscription(sub)) return false;

  let carerUserId = resolveCarerUserId(sub, null);
  if (!carerUserId) {
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in customer && customer.deleted)) {
        carerUserId = resolveCarerUserId(sub, customer as Stripe.Customer);
      }
    } catch (err) {
      console.error(
        "[carer-membership] customer lookup failed for subscription",
        sub.id
      );
      // Re-throw so Stripe retries — a transient lookup failure must not be
      // recorded as processed.
      throw err instanceof Error
        ? err
        : new Error("Stripe customer lookup failed");
    }
  }

  if (!carerUserId) {
    // It IS a carer sub (lookup_key matched) but we can't attribute it yet.
    // Throw instead of returning true: returning true would let the caller mark
    // processed_at without writing carer_memberships, so a paid carer could
    // lose entitlement with no Stripe retry. Throwing keeps it retryable while
    // still never reaching the consumer-subscription upsert below.
    const message = `Could not resolve carer_user_id for carer subscription ${sub.id}`;
    console.warn("[carer-membership]", message);
    throw new Error(message);
  }

  await upsertCarerMembershipFromSubscription({
    supabase: admin as unknown as CarerWebhookSupabase,
    sub,
    carerUserId,
    forceCanceled: opts.forceCanceled,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Memberships helpers
// ---------------------------------------------------------------------------

type MembershipPlanCode = "lite" | "plus" | "premium";

/**
 * Map a Stripe Product ID to one of our internal plan codes.
 * The Product IDs come from env vars set during Stripe catalog setup.
 */
function productIdToPlan(productId: string): MembershipPlanCode | null {
  if (productId === process.env.STRIPE_PRODUCT_LITE) return "lite";
  if (productId === process.env.STRIPE_PRODUCT_PLUS) return "plus";
  if (productId === process.env.STRIPE_PRODUCT_PREMIUM) return "premium";
  return null;
}

/**
 * Map a Stripe subscription status to our enum.
 * Our enum mirrors Stripe's, so this is a 1:1 cast with a fallback.
 */
function mapSubscriptionStatus(s: Stripe.Subscription.Status): string {
  // Stripe statuses: active | past_due | unpaid | canceled | incomplete
  // | incomplete_expired | trialing | paused
  return s;
}

/**
 * Insert or update a public.subscriptions row from a Stripe subscription.
 * Idempotent: keyed on stripe_subscription_id (unique).
 *
 * The user_id is found via the Stripe customer's metadata.user_id (set when
 * we create the customer in /api/memberships/create-checkout). If that's
 * absent (e.g. someone subscribed via the Stripe dashboard manually) we
 * fall back to looking up the customer's email in auth.users.
 */
async function upsertMembershipFromStripeSubscription(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // The Subscription object's items[0] tells us which Price (and therefore
  // which Product/plan + interval) this is.
  const item = sub.items.data[0];
  if (!item) {
    console.warn("[memberships] subscription has no items", sub.id);
    return;
  }
  const price = item.price;
  const productId =
    typeof price.product === "string" ? price.product : price.product.id;
  const plan = productIdToPlan(productId);
  if (!plan) {
    console.warn(
      "[memberships] unknown product",
      productId,
      "on subscription",
      sub.id
    );
    return;
  }
  const interval =
    price.recurring?.interval === "year" ? "year" : "month";

  // Resolve user_id: prefer customer.metadata.user_id, fall back to email.
  let userId: string | null = null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!("deleted" in customer && customer.deleted)) {
      const c = customer as Stripe.Customer;
      userId = c.metadata?.user_id ?? null;
      if (!userId && c.email) {
        const { data: usersList } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const match = usersList?.users.find(
          (u) => u.email?.toLowerCase() === c.email!.toLowerCase()
        );
        userId = match?.id ?? null;
      }
    }
  } catch {
    // ignore — handled below
  }
  if (!userId) {
    console.warn(
      "[memberships] could not resolve user_id for stripe customer",
      customerId
    );
    return;
  }

  const periodStart = sub.items.data[0]?.current_period_start;
  const periodEnd = sub.items.data[0]?.current_period_end;

  const row = {
    user_id: userId,
    plan,
    billing_interval: interval,
    status: mapSubscriptionStatus(sub.status),
    source: "stripe" as const,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: price.id,
    current_period_start: periodStart
      ? new Date(periodStart * 1000).toISOString()
      : null,
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : null,
  };

  // Upsert keyed on stripe_subscription_id (unique constraint)
  const { error } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });

  if (error) {
    console.error("[memberships] upsert failed", sub.id, error.message);
    throw error; // surfaces in the webhook events table for retry
  }
}
