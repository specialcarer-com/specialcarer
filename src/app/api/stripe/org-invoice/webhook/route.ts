import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/org-invoice/webhook
 *
 * Handles Stripe webhook events for org invoices:
 *   invoice.finalized        — invoice is open, email sent to org
 *   invoice.paid             — org has paid; update local mirror
 *   invoice.payment_failed   — payment failed; store for ops alert
 *   invoice.voided           — invoice voided
 *
 * Architecture:
 *   Org invoices are DIRECT charges to All Care 4 U Group Ltd.
 *   No Stripe Connect involved. Carer payouts are independent of invoice status.
 *
 * Idempotency: each event is checked against stripe_webhook_events before processing.
 *
 * Register this endpoint in the Stripe Dashboard under:
 *   https://dashboard.stripe.com/test/webhooks
 *   → Listen for: invoice.finalized, invoice.paid, invoice.payment_failed, invoice.voided
 *
 * The webhook secret must be set as STRIPE_ORG_INVOICE_WEBHOOK_SECRET in env.
 * Falls back to STRIPE_WEBHOOK_SECRET if not separately configured.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const secret =
    process.env.STRIPE_ORG_INVOICE_WEBHOOK_SECRET ??
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${String(err)}` },
      { status: 400 }
    );
  }

  // Only handle invoice events
  if (!event.type.startsWith("invoice.")) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();

  // Idempotency check
  const { data: existing } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }

  // Log the event
  await admin.from("stripe_webhook_events").insert({
    id: event.id,
    type: event.type,
    payload: event.data.object,
  });

  const invoice = event.data.object as {
    id: string;
    status: string;
    amount_due: number;
    amount_paid: number;
    hosted_invoice_url: string | null;
    invoice_pdf: string | null;
    due_date: number | null;
  };

  try {
    switch (event.type) {
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.voided": {
        const stripeStatus = (() => {
          if (event.type === "invoice.paid") return "paid";
          if (event.type === "invoice.voided") return "void";
          if (event.type === "invoice.payment_failed") return "open"; // stays open
          return "open"; // finalized
        })();

        await admin
          .from("org_invoices")
          .update({
            status: stripeStatus,
            amount_due_cents: invoice.amount_due,
            amount_paid_cents: invoice.amount_paid,
            hosted_invoice_url: invoice.hosted_invoice_url ?? null,
            invoice_pdf_url: invoice.invoice_pdf ?? null,
            due_date: invoice.due_date
              ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
              : null,
          })
          .eq("stripe_invoice_id", invoice.id);

        // If paid, also update booking status column for easy querying
        if (event.type === "invoice.paid") {
          await admin
            .from("bookings")
            .update({ status: "invoiced" })
            .eq("stripe_invoice_id", invoice.id)
            .in("status", ["completed", "invoiced"]);
        }

        break;
      }
      default:
        break;
    }

    // Mark event processed
    await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", event.id);

    return NextResponse.json({ received: true, type: event.type });
  } catch (err) {
    // Store error for debugging but still return 200 so Stripe doesn't retry
    await admin
      .from("stripe_webhook_events")
      .update({ error: String(err) })
      .eq("id", event.id);

    console.error("org-invoice webhook handler error", err);
    return NextResponse.json({ received: true, error: String(err) });
  }
}
