/**
 * Server-only timesheet approval. Shared between:
 *   - POST /api/bookings/[id]/timesheet/approve          (seeker/org_member)
 *   - GET  /api/cron/auto-approve-timesheets             (auto-approve cron)
 *   - POST /api/admin/timesheets/[id]/resolve            (admin disputes)
 *
 * For seeker bookings, mints supplemental manual-capture PIs for any
 * approved overage / overtime, and an immediate-capture PI for any tip.
 * Supplemental PIs reuse the payment method from the original booking PI
 * off-session when possible; if Stripe rejects off-session reuse (no
 * Customer, requires authentication, etc.) the PI is left unconfirmed and
 * the returned `requires_client_action` array carries client_secret values
 * the UI can confirm with Stripe Elements.
 *
 * For org bookings, this writes no Stripe rows — the draft invoice will
 * pick up overage/overtime line items via /api/cron/finalise-org-invoices.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { calculatePlatformFeeCents } from "@/lib/stripe/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export type ApproveInput = {
  timesheetId: string;
  /** Null when the approver is the auto-approve cron. */
  approverUserId: string | null;
  approverIp: string | null;
  typedReason: string | null;
  tipCents: number;
  /** Whether this is the cron's auto-approval path. */
  auto: boolean;
};

export type SupplementalAction = {
  kind: "overage" | "overtime" | "tip";
  payment_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  status: "captured" | "requires_capture" | "succeeded" | "requires_client_action" | "failed";
  client_secret?: string | null;
};

export type ApproveResult = {
  ok: true;
  timesheet_id: string;
  status: "approved" | "auto_approved";
  actions: SupplementalAction[];
};

export type ApproveError = {
  ok: false;
  status: number;
  error: string;
};

/**
 * Resolve a payment method to reuse on supplemental PIs from the booking's
 * primary PaymentIntent. Returns null if Stripe can't provide one we can
 * charge off-session.
 */
async function resolveCustomerAndPaymentMethod(
  primaryPaymentIntentId: string,
): Promise<{ customerId: string | null; paymentMethodId: string | null }> {
  try {
    const pi = await stripe.paymentIntents.retrieve(primaryPaymentIntentId);
    const customerId =
      typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
    const paymentMethodId =
      typeof pi.payment_method === "string"
        ? pi.payment_method
        : pi.payment_method?.id ?? null;
    return { customerId, paymentMethodId };
  } catch (e) {
    console.error("[timesheet.approve] cannot retrieve primary PI", e);
    return { customerId: null, paymentMethodId: null };
  }
}

/**
 * Mint a supplemental manual-capture PI (overage / overtime) routed to
 * the carer's Stripe Connect account with platform fee applied. Reuses
 * the original PI's payment method off-session when possible.
 */
async function mintSupplementalPI(args: {
  amountCents: number;
  currency: string;
  destinationAccount: string;
  applicationFeeCents: number;
  bookingId: string;
  timesheetId: string;
  kind: "overage" | "overtime" | "tip";
  customerId: string | null;
  paymentMethodId: string | null;
  /** Tips capture immediately; overage/overtime use manual capture + 24h hold. */
  manualCapture: boolean;
}): Promise<{
  pi: Stripe.PaymentIntent;
  status: SupplementalAction["status"];
}> {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: args.amountCents,
    currency: args.currency.toLowerCase(),
    application_fee_amount: args.applicationFeeCents,
    transfer_data: { destination: args.destinationAccount },
    metadata: {
      kind: args.kind,
      booking_id: args.bookingId,
      timesheet_id: args.timesheetId,
    },
    capture_method: args.manualCapture ? "manual" : "automatic",
  };

  // Off-session reuse path: needs customer + payment_method on the PI.
  if (args.customerId && args.paymentMethodId) {
    params.customer = args.customerId;
    params.payment_method = args.paymentMethodId;
    params.off_session = true;
    params.confirm = true;
    try {
      const pi = await stripe.paymentIntents.create(params);
      if (pi.status === "requires_capture") {
        return { pi, status: "requires_capture" };
      }
      if (pi.status === "succeeded") {
        return { pi, status: "succeeded" };
      }
      // 'requires_action' / 'requires_payment_method' — fall through to client confirm.
      return { pi, status: "requires_client_action" };
    } catch (e) {
      // Stripe raises errors on authentication-required or off-session failures.
      // Fall back to the client-confirmation path.
      console.warn("[timesheet.approve] off-session reuse failed, falling back", e);
    }
  }

  // Fallback: create PI without confirm, return client_secret for UI.
  delete params.off_session;
  delete params.confirm;
  if (!params.customer && args.customerId) params.customer = args.customerId;
  params.automatic_payment_methods = { enabled: true };
  const pi = await stripe.paymentIntents.create(params);
  return { pi, status: "requires_client_action" };
}

/**
 * Main entry point. Verifies status, idempotency, runs Stripe ops for
 * seeker bookings, marks the timesheet as approved/auto_approved.
 */
export async function approveTimesheet(
  admin: AnySupabase,
  input: ApproveInput,
): Promise<ApproveResult | ApproveError> {
  // Load timesheet + parent booking in one round-trip.
  const { data: ts } = await admin
    .from("shift_timesheets")
    .select(
      "id, booking_id, carer_id, booking_source, status, currency, hourly_rate_cents, overage_cents, overage_minutes, overage_requires_approval, overtime_cents, overtime_minutes",
    )
    .eq("id", input.timesheetId)
    .maybeSingle();
  if (!ts) return { ok: false, status: 404, error: "timesheet_not_found" };

  if (ts.status === "approved" || ts.status === "auto_approved") {
    // Idempotent — return what's there.
    return {
      ok: true,
      timesheet_id: ts.id,
      status: ts.status,
      actions: [],
    };
  }
  if (ts.status !== "pending_approval") {
    return {
      ok: false,
      status: 400,
      error: `cannot_approve_${ts.status}`,
    };
  }
  if (input.auto && ts.overage_requires_approval) {
    return {
      ok: false,
      status: 400,
      error: "overage_requires_explicit_approval",
    };
  }

  const isOrg = ts.booking_source === "org";
  const actions: SupplementalAction[] = [];

  // ─ Seeker path ──────────────────────────────────────────────────────────
  if (!isOrg) {
    const { data: booking } = await admin
      .from("bookings")
      .select("id, caregiver_id, seeker_id, currency")
      .eq("id", ts.booking_id)
      .maybeSingle();
    if (!booking) {
      return { ok: false, status: 404, error: "booking_not_found" };
    }
    const { data: primary } = await admin
      .from("payments")
      .select("id, stripe_payment_intent_id")
      .eq("booking_id", ts.booking_id)
      .eq("kind", "primary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: carerStripe } = await admin
      .from("caregiver_stripe_accounts")
      .select("stripe_account_id")
      .eq("user_id", booking.caregiver_id)
      .maybeSingle();

    // Tip cents bounded at this layer (UI already validates).
    const tipCents = Math.max(0, Math.min(Number(input.tipCents ?? 0), 50000));
    const overageCents = Number(ts.overage_cents ?? 0);
    const overtimeCents = Number(ts.overtime_cents ?? 0);

    const haveCarerAccount = !!carerStripe?.stripe_account_id;
    const havePrimaryPI = !!primary?.stripe_payment_intent_id;

    // We need the carer's Connect account for transfer_data — without it,
    // no supplemental PIs can be minted.
    if ((overageCents > 0 || overtimeCents > 0 || tipCents > 0) && !haveCarerAccount) {
      return {
        ok: false,
        status: 400,
        error: "carer_stripe_account_missing",
      };
    }

    const { customerId, paymentMethodId } = havePrimaryPI
      ? await resolveCustomerAndPaymentMethod(primary!.stripe_payment_intent_id)
      : { customerId: null, paymentMethodId: null };

    type SuppDef = {
      kind: "overage" | "overtime" | "tip";
      amount: number;
      manualCapture: boolean;
      applicationFee: number;
    };
    const supps: SuppDef[] = [];
    if (overageCents > 0) {
      supps.push({
        kind: "overage",
        amount: overageCents,
        manualCapture: true,
        applicationFee: calculatePlatformFeeCents(overageCents),
      });
    }
    if (overtimeCents > 0) {
      supps.push({
        kind: "overtime",
        amount: overtimeCents,
        manualCapture: true,
        applicationFee: calculatePlatformFeeCents(overtimeCents),
      });
    }
    if (tipCents > 0) {
      supps.push({
        kind: "tip",
        amount: tipCents,
        manualCapture: false,
        applicationFee: 0,
      });
    }

    for (const supp of supps) {
      const { pi, status } = await mintSupplementalPI({
        amountCents: supp.amount,
        currency: String(booking.currency ?? "gbp"),
        destinationAccount: carerStripe!.stripe_account_id as string,
        applicationFeeCents: supp.applicationFee,
        bookingId: ts.booking_id,
        timesheetId: ts.id,
        kind: supp.kind,
        customerId,
        paymentMethodId,
        manualCapture: supp.manualCapture,
      });

      const dbStatus =
        status === "requires_capture"
          ? "requires_capture"
          : status === "succeeded"
          ? "succeeded"
          : "requires_payment_method";
      const { data: paymentRow } = await admin
        .from("payments")
        .insert({
          booking_id: ts.booking_id,
          stripe_payment_intent_id: pi.id,
          status: dbStatus,
          amount_cents: supp.amount,
          application_fee_cents: supp.applicationFee,
          currency: String(booking.currency ?? "gbp"),
          destination_account_id: carerStripe!.stripe_account_id,
          kind: supp.kind,
          parent_payment_id: primary?.id ?? null,
          timesheet_id: ts.id,
          raw: pi as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();

      actions.push({
        kind: supp.kind,
        payment_id: paymentRow?.id ?? "",
        stripe_payment_intent_id: pi.id,
        amount_cents: supp.amount,
        status,
        client_secret:
          status === "requires_client_action" ? pi.client_secret : null,
      });
    }
  }

  // Update timesheet row.
  const nowIso = new Date().toISOString();
  const finalStatus: "approved" | "auto_approved" = input.auto
    ? "auto_approved"
    : "approved";
  await admin
    .from("shift_timesheets")
    .update({
      status: finalStatus,
      approved_at: nowIso,
      approver_user_id: input.approverUserId,
      approver_typed_reason: input.typedReason,
      approver_ip: input.approverIp,
      tip_cents: !isOrg ? Math.max(0, Number(input.tipCents ?? 0)) : 0,
      updated_at: nowIso,
    })
    .eq("id", ts.id);

  // Notify the carer.
  try {
    await admin.from("notifications").insert({
      user_id: ts.carer_id,
      kind: "timesheet_approved",
      title: input.auto ? "Timesheet auto-approved" : "Timesheet approved",
      body: input.auto
        ? "Your timesheet was auto-approved after 48 hours."
        : "Your timesheet has been approved.",
      link_url: `/m/active-job/${ts.booking_id}`,
      payload: { booking_id: ts.booking_id, timesheet_id: ts.id, auto: input.auto },
    });
  } catch {
    /* best-effort */
  }

  return {
    ok: true,
    timesheet_id: ts.id,
    status: finalStatus,
    actions,
  };
}
