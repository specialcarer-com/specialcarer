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
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
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
    return NextResponse.json({ error: message }, { status: 400 });
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
