import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unredeemCreditsForBooking } from "@/lib/referrals/redemption";

export const runtime = "nodejs";

/**
 * Stripe webhook handler. Configure in Stripe dashboard pointing to
 * `${SITE_URL}/api/stripe/webhook` and put the signing secret in
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  // Trim defensively — pasting via dashboards/CLIs occasionally introduces
  // a trailing newline or surrounding whitespace that silently breaks HMAC.
  const secretTest = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const secretLive = process.env.STRIPE_WEBHOOK_SECRET_LIVE?.trim();
  const raw = await req.text();

  if (!sig || (!secretTest && !secretLive)) {
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
  let verifiedWith: "live" | "test" | null = null;
  let lastError: string | null = null;
  if (secretLive) {
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secretLive);
      verifiedWith = "live";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Invalid signature";
    }
  }
  if (!event && secretTest) {
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
  // Sanity check: livemode flag on the verified event should match the
  // secret that verified it. If not, something is misconfigured (e.g. the
  // live secret was put in the test env var or vice versa) — refuse rather
  // than process the event under the wrong mode.
  const expectLive = verifiedWith === "live";
  if (event.livemode !== expectLive) {
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

  // Idempotency: log the event, skip if we've seen it
  const { data: prior } = await admin
    .from("stripe_webhook_events")
    .select("id, processed_at")
    .eq("id", event.id)
    .maybeSingle();
  if (prior?.processed_at) {
    return NextResponse.json({ received: true, idempotent: true });
  }
  if (!prior) {
    await admin.from("stripe_webhook_events").insert({
      id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        await admin
          .from("caregiver_stripe_accounts")
          .update({
            charges_enabled: acct.charges_enabled,
            payouts_enabled: acct.payouts_enabled,
            details_submitted: acct.details_submitted,
            requirements_currently_due:
              acct.requirements?.currently_due ?? [],
          })
          .eq("stripe_account_id", acct.id);
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
          await admin
            .from("payments")
            .update({
              status: ch.amount_refunded === ch.amount
                ? "refunded"
                : "partially_refunded",
            })
            .eq("stripe_payment_intent_id", pid);
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
        break;
      }

      // ---------------------------------------------------------------
      // Memberships (consumer subscriptions, NOT Connect)
      // ---------------------------------------------------------------
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertMembershipFromStripeSubscription(admin, sub);
        break;
      }

      default:
        // Unhandled event type — just log
        break;
    }

    await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error";
    await admin
      .from("stripe_webhook_events")
      .update({ error: message })
      .eq("id", event.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
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

