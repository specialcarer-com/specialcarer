/**
 * Stripe Invoicing for org (B2B) bookings.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PAYMENT ARCHITECTURE — org bookings are NOT Stripe Connect             ║
 * ║                                                                          ║
 * ║  B2C:  Stripe Connect destination charge; carer paid via transfer.       ║
 * ║  Org:  All Care 4 U Group Ltd issues a Stripe Invoice to the org.        ║
 * ║        Org pays All Care 4 U Group Ltd directly (no Connect split).      ║
 * ║        Carer is paid from All Care 4 U Group Ltd's own funds via the     ║
 * ║        existing weekly payout cycle, independently of invoice status.    ║
 * ║                                                                          ║
 * ║  Working-capital note: the carer is paid when the shift completes,       ║
 * ║  typically BEFORE the org's net-14 invoice has cleared. All Care 4 U    ║
 * ║  Group Ltd fronts this payment. For MVP, carers are always paid on       ║
 * ║  schedule regardless of org payment status.                              ║
 * ║  TODO (Phase C): credit-risk flag to gate NEW bookings for orgs with     ║
 * ║  overdue invoices — do NOT block carer payouts.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Invoicing entity: All Care 4 U Group Ltd (NOT "SpecialCarer").
 *   SpecialCarer is the consumer brand. All B2B invoices are issued under
 *   the legal entity name. Visual branding (logo) stays SpecialCarer.
 *   Companies House: 09428739
 *   Address: 85 Great Portland Street, London, England, W1W 7LT
 *   Email: office@allcare4u.co.uk
 *
 * Sleep-in economics:
 *   Active hours  — org invoiced at hourly_rate; carer paid × 0.75 (25% cut)
 *   Sleep portion — org charged sleep_in_org_charge (default £100)
 *                   carer paid sleep_in_carer_pay   (default  £50)
 *                   platform retains £50 (50% — intentional; higher overhead)
 *
 * Stripe invoice line items (sleep_in):
 *   "Active care: X hours @ £Y/hr = £Z"
 *   "Sleep-in allowance: £100"     ← org charge only; carer pay is internal
 *
 * Use TEST mode by default. Do NOT switch to live without explicit instruction.
 */

import "server-only";
import { stripe } from "./server";
import type { OrgBooking } from "@/lib/org/booking-types";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

// ── Legal entity constants ────────────────────────────────────────────────────
// IMPORTANT: use these on all B2B invoices. Never use "SpecialCarer" as issuer.
export const LEGAL_ENTITY_NAME = "All Care 4 U Group Ltd";
export const LEGAL_ENTITY_TRADING_AS =
  "All Care 4 U Group Ltd (operating SpecialCarer)";
export const LEGAL_ENTITY_COMPANIES_HOUSE = "09428739";
export const LEGAL_ENTITY_ADDRESS =
  "85 Great Portland Street, London, England, W1W 7LT";
export const LEGAL_ENTITY_EMAIL = "office@allcare4u.co.uk";

/**
 * Footer printed on every org invoice. References the legal entity so the
 * org's accounts team can match it to their supplier records.
 */
export const INVOICE_FOOTER =
  `${LEGAL_ENTITY_NAME} · ` +
  `Companies House ${LEGAL_ENTITY_COMPANIES_HOUSE} · ` +
  `${LEGAL_ENTITY_ADDRESS} · ` +
  `${LEGAL_ENTITY_EMAIL}`;

// ── Org charge / carer pay calculators ───────────────────────────────────────

/**
 * Total amount to invoice the org for this booking (in pence).
 *
 * sleep_in:    (subtotal_cents) + ROUND(sleep_in_org_charge × 100)
 * other modes: subtotal_cents  (client-side uplift is 0%)
 *
 * This is what appears on the Stripe invoice and org dashboard.
 * Do NOT expose carer_pay_total to the org.
 */
export function computeOrgChargeTotalCents(booking: OrgBooking): number {
  if (booking.shift_mode === "sleep_in") {
    return (
      booking.subtotal_cents +
      Math.round(booking.sleep_in_org_charge * 100)
    );
  }
  return booking.subtotal_cents;
}

/**
 * Total earned by the carer for this booking (in pence).
 *
 * sleep_in:    ROUND(subtotal_cents × 0.75) + ROUND(sleep_in_carer_pay × 100)
 * other modes: ROUND(subtotal_cents × 0.75)
 *
 * Accrued at shift completion; paid via weekly payout cycle from
 * All Care 4 U Group Ltd's funds — independent of org invoice status.
 *
 * NEVER expose this to the org. Visible to: carer + admin only.
 */
export function computeCarerPayTotalCents(booking: OrgBooking): number {
  if (booking.shift_mode === "sleep_in") {
    return (
      Math.round(booking.subtotal_cents * 0.75) +
      Math.round(booking.sleep_in_carer_pay * 100)
    );
  }
  return Math.round(booking.subtotal_cents * 0.75);
}

/**
 * Platform margin for this booking (in pence).
 * = org_charge_total − carer_pay_total
 *
 * Active hours:  25% of active subtotal
 * Sleep portion: 50% of sleep_in_org_charge (intentional higher margin)
 */
export function computePlatformMarginCents(booking: OrgBooking): number {
  return computeOrgChargeTotalCents(booking) - computeCarerPayTotalCents(booking);
}

// ── Stripe Customer management ────────────────────────────────────────────────

/**
 * Lazily creates (or returns existing) Stripe Customer for an organisation.
 * Writes stripe_customer_id back to organization_billing on creation.
 *
 * Customer name = org legal_name; email = billing_contact_email.
 * Tagged with metadata for cross-reference.
 */
export async function ensureStripeCustomer(
  admin: AnySupabase,
  organizationId: string
): Promise<string> {
  const { data: billing } = await admin
    .from("organization_billing")
    .select(
      "stripe_customer_id, billing_contact_email, billing_contact_name, billing_address"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (billing?.stripe_customer_id) {
    return billing.stripe_customer_id as string;
  }

  const { data: org } = await admin
    .from("organizations")
    .select("legal_name, trading_name, office_address, country")
    .eq("id", organizationId)
    .maybeSingle();

  const name =
    (org?.legal_name as string | null) ??
    (org?.trading_name as string | null) ??
    "Unknown Organisation";
  const email = (billing?.billing_contact_email as string | null) ?? undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const address: any =
    (billing?.billing_address as Record<string, string> | null) ??
    (org?.office_address as Record<string, string> | null) ??
    {};

  const customer = await stripe.customers.create({
    name,
    email,
    address: {
      line1: (address.line1 as string | undefined) ?? "",
      line2: (address.line2 as string | undefined) ?? "",
      city: (address.city as string | undefined) ?? "",
      postal_code: (address.postcode as string | undefined) ?? "",
      country: org?.country === "US" ? "US" : "GB",
    },
    metadata: {
      organization_id: organizationId,
      platform: LEGAL_ENTITY_TRADING_AS,
      // Denote this is a direct-charge customer (NOT a Connect account)
      payment_model: "direct_invoice",
    },
  });

  await admin
    .from("organization_billing")
    .update({ stripe_customer_id: customer.id })
    .eq("organization_id", organizationId);

  return customer.id;
}

// ── Invoice creation ──────────────────────────────────────────────────────────

export type CreateOrgInvoiceResult = {
  stripeInvoiceId: string;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  amountDueCents: number;
};

/**
 * Creates and finalises a Stripe Invoice for a completed org booking.
 *
 * Architecture:
 *   - collection_method = send_invoice (org pays via hosted page)
 *   - NO application_fee_amount, NO transfer_data — this is a DIRECT charge
 *     to All Care 4 U Group Ltd's Stripe balance, not a Connect split.
 *   - auto_advance = true → Stripe finalises + auto-emails PDF to billing contact
 *   - custom_fields carry legal entity name for the org's accounts team
 *   - footer carries Companies House + address
 *
 * After creation:
 *   - Sets booking.stripe_invoice_id, booking.invoiced_at, booking.status = 'invoiced'
 *   - Sets booking.org_charge_total_cents and booking.carer_pay_total_cents
 *   - Upserts a row in org_invoices (local mirror)
 *
 * Carer earnings are accrued separately (see accrue comment below) — they are
 * NOT tied to Stripe invoice payment. The carer is always paid on schedule.
 */
export async function createShiftInvoice(
  admin: AnySupabase,
  booking: OrgBooking,
  daysUntilDue = 14
): Promise<CreateOrgInvoiceResult> {
  const customerId = await ensureStripeCustomer(admin, booking.organization_id);
  const orgChargeCents = computeOrgChargeTotalCents(booking);
  const carerPayCents = computeCarerPayTotalCents(booking);

  const currency = booking.currency;
  const rateGBP = (booking.hourly_rate_cents / 100).toFixed(2);

  // Build line items based on shift mode
  type LineItem = { description: string; amount: number };
  const lineItems: LineItem[] = [];

  if (booking.shift_mode === "sleep_in") {
    lineItems.push({
      description: `Active care: ${booking.hours} hrs @ £${rateGBP}/hr`,
      amount: booking.subtotal_cents,
    });
    lineItems.push({
      description: "Sleep-in allowance",
      // org charge only — carer pay is internal accounting, not on invoice
      amount: Math.round(booking.sleep_in_org_charge * 100),
    });
  } else {
    const modeLabel =
      booking.shift_mode === "twelve_hour"
        ? "12-hour shift"
        : booking.shift_mode === "recurring_4w"
        ? "Recurring shift"
        : "Care services";
    lineItems.push({
      description: `${modeLabel}: ${booking.hours} hrs @ £${rateGBP}/hr`,
      amount: booking.subtotal_cents,
    });
  }

  // Create Stripe InvoiceItems (must precede invoice creation)
  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: item.amount,
      currency,
      description: item.description,
      metadata: {
        booking_id: booking.id,
        organization_id: booking.organization_id,
      },
    });
  }

  const bookingDate = new Date(booking.starts_at);
  const dateStr = bookingDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: daysUntilDue,
    auto_advance: true,
    description: `SpecialCarer shift — ${dateStr}`,
    // ── Issuer identification ──────────────────────────────────────────────
    // All B2B invoices are issued by All Care 4 U Group Ltd, NOT SpecialCarer.
    custom_fields: [
      { name: "Issued by", value: LEGAL_ENTITY_TRADING_AS },
      { name: "Booking ref", value: booking.id.slice(0, 8).toUpperCase() },
    ],
    footer: INVOICE_FOOTER,
    metadata: {
      booking_id: booking.id,
      organization_id: booking.organization_id,
      shift_mode: booking.shift_mode,
      // Confirm no Connect involved — direct charge to platform balance only
      payment_model: "direct_invoice_no_connect",
      platform: LEGAL_ENTITY_TRADING_AS,
    },
  });

  // Finalise: Stripe auto-emails the PDF to the customer's email address
  const finalised = await stripe.invoices.finalizeInvoice(invoice.id);

  // ── Persist to database ────────────────────────────────────────────────────
  await admin
    .from("bookings")
    .update({
      stripe_invoice_id: finalised.id,
      invoiced_at: new Date().toISOString(),
      status: "invoiced",
      // Store both totals on the booking row
      org_charge_total_cents: orgChargeCents,
      carer_pay_total_cents: carerPayCents,
    })
    .eq("id", booking.id);

  // Mirror in org_invoices for dashboard queries
  await admin.from("org_invoices").upsert(
    {
      organization_id: booking.organization_id,
      booking_id: booking.id,
      stripe_invoice_id: finalised.id,
      stripe_customer_id: customerId,
      status: finalised.status ?? "open",
      amount_due_cents: finalised.amount_due,
      amount_paid_cents: finalised.amount_paid,
      currency: finalised.currency,
      due_date: finalised.due_date
        ? new Date(finalised.due_date * 1000).toISOString().slice(0, 10)
        : null,
      hosted_invoice_url: finalised.hosted_invoice_url ?? null,
      invoice_pdf_url: finalised.invoice_pdf ?? null,
    },
    { onConflict: "stripe_invoice_id" }
  );

  // ── Accrue carer earnings ──────────────────────────────────────────────────
  // Carer is paid from All Care 4 U Group Ltd's own funds on the weekly payout
  // cycle — NOT from the org's invoice payment. This happens here, at invoice
  // creation (i.e. immediately after shift completion), so the carer's
  // available_balance reflects the earned amount before the org has paid.
  //
  // The existing payout flow (carer_earnings_summary RPC + payout_intents table)
  // picks up org shifts via the bookings table where:
  //   booking_source = 'org' AND status IN ('completed','invoiced')
  //   AND paid_out_at IS NULL
  //
  // No separate accrual table needed — the booking row IS the accrual record.
  // carer_pay_total_cents is the authoritative carer earnings figure.

  return {
    stripeInvoiceId: finalised.id,
    hostedInvoiceUrl: finalised.hosted_invoice_url ?? null,
    invoicePdfUrl: finalised.invoice_pdf ?? null,
    amountDueCents: finalised.amount_due,
  };
}
