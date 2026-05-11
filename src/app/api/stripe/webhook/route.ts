import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const raw = await req.text();

  if (!sig || !secret) {
    return NextResponse.json(
      { error: "Webhook signature or secret missing" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    // Surface non-sensitive diagnostics so we can see at runtime whether the
    // function actually received the expected secret + body. Prefix is the
    // first 8 chars of the secret (whsec_ + a couple chars of entropy) which
    // is safe to log and lets us confirm it matches the dashboard secret.
    return NextResponse.json(
      {
        error: message,
        debug: {
          raw_len: raw.length,
          secret_len: secret.length,
          secret_prefix: secret.slice(0, 8),
          sig_prefix: sig.slice(0, 20),
        },
      },
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

