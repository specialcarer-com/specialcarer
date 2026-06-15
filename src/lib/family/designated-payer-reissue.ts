/**
 * Designated Payer (gap 31) — PaymentIntent re-issue (rollout plan Option B).
 *
 * The only place a PaymentIntent is created today is `create-booking-intent`,
 * at booking-creation time, when `designated_payer_user_id` is still NULL. So
 * the charge-override branch never fires for a normal new booking. This module
 * closes that gap: when the seeker sets a designated payer on a booking that
 * ALREADY has a PaymentIntent, we cancel the existing intent and create a new
 * one billed to the payer's saved customer + payment method.
 *
 * Pure over a thin adapter so it is unit-testable without Stripe or Supabase.
 * The route wires the adapter to the real `stripe` client + `payments` table.
 *
 * Guard (rollout plan §3): re-issue only while the intent is still pre-charge
 * (`requires_payment_method` / `requires_confirmation` / `requires_action`).
 * Once it is `processing` / `succeeded` / `canceled` the column update still
 * persists for future bookings, but the in-flight intent is left untouched.
 */

/** Stripe PI statuses for which a re-issue is allowed. */
export const REISSUABLE_STATUSES = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
] as const;

export type ReissuableStatus = (typeof REISSUABLE_STATUSES)[number];

export function isReissuableStatus(status: string): status is ReissuableStatus {
  return (REISSUABLE_STATUSES as readonly string[]).includes(status);
}

/** The current PaymentIntent attached to a booking (via the payments row). */
export type CurrentIntent = {
  paymentIntentId: string;
  status: string;
  amountCents: number;
  currency: string;
  /** Metadata to carry across to the re-issued intent (verbatim). */
  metadata: Record<string, string>;
  applicationFeeCents: number;
  destinationAccountId: string;
};

export type ReissueAdapter = {
  /** The current PI for a booking, or null when the booking has none yet. */
  getCurrentIntent(bookingId: string): Promise<CurrentIntent | null>;
  /** The payer's saved Stripe customer + default payment method, or null. */
  getSavedPaymentMethod(payerUserId: string): Promise<{
    stripeCustomerId: string;
    paymentMethodId: string;
  } | null>;
  /** Cancel the existing PaymentIntent. */
  cancelIntent(paymentIntentId: string): Promise<void>;
  /** Create the replacement PI billed to the payer; returns the new id. */
  createIntent(input: {
    amountCents: number;
    currency: string;
    customer: string;
    paymentMethod: string;
    metadata: Record<string, string>;
    applicationFeeCents: number;
    destinationAccountId: string;
  }): Promise<{ id: string }>;
  /** Persist the new PI id on the booking's payments row. */
  persistNewIntent(input: {
    bookingId: string;
    oldPaymentIntentId: string;
    newPaymentIntentId: string;
    amountCents: number;
    applicationFeeCents: number;
    currency: string;
    destinationAccountId: string;
  }): Promise<void>;
};

export type ReissueInput = {
  bookingId: string;
  seekerId: string;
  payerUserId: string;
  adapter: ReissueAdapter;
  logger?: Pick<typeof console, "warn" | "info" | "error">;
};

/**
 * Outcome of attempting a re-issue. `failed` carries a flag so the caller can
 * roll back the DB column update and return 500.
 */
export type ReissueResult =
  | { kind: "no_intent" }
  | { kind: "already_in_flight"; status: string }
  | { kind: "no_pm" }
  | { kind: "reissued"; newIntentId: string; payerCustomerId: string }
  | { kind: "failed"; phase: "cancel" | "create"; code: string; message: string };

function errInfo(err: unknown): { code: string; message: string } {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : "unknown",
      message: typeof e.message === "string" ? e.message : String(err),
    };
  }
  return { code: "unknown", message: String(err) };
}

/**
 * Cancel + re-create the booking's PaymentIntent so the designated payer is
 * billed. Assumes the payer is already validated as an in-household adult and
 * the feature flag is on — the caller (handler) owns those checks.
 */
export async function reissueIntentForPayer(
  input: ReissueInput,
): Promise<ReissueResult> {
  const { bookingId, payerUserId, adapter, logger = console } = input;

  const current = await adapter.getCurrentIntent(bookingId);
  // No intent yet (e.g. booking created before a PI, or a future flow): the
  // create-booking-intent path will pick up the column on its own.
  if (!current) {
    return { kind: "no_intent" };
  }

  // Guard: only re-issue while the intent is still pre-charge.
  if (!isReissuableStatus(current.status)) {
    return { kind: "already_in_flight", status: current.status };
  }

  const saved = await adapter.getSavedPaymentMethod(payerUserId);
  if (!saved) {
    logger.warn(
      JSON.stringify({
        event: "payer_no_pm_at_set_time",
        bookingId,
        payerId: payerUserId,
      }),
    );
    return { kind: "no_pm" };
  }

  // Cancel the seeker's intent first. A failure here is safe: nothing has
  // changed in Stripe, so the caller rolls back the column and returns 500.
  try {
    await adapter.cancelIntent(current.paymentIntentId);
  } catch (err) {
    const { code, message } = errInfo(err);
    logger.error(
      JSON.stringify({
        event: "designated_payer_intent_reissue_failed",
        phase: "cancel",
        oldIntentId: current.paymentIntentId,
        code,
        message,
      }),
    );
    return { kind: "failed", phase: "cancel", code, message };
  }

  // Create the replacement intent billed to the payer.
  let created: { id: string };
  try {
    created = await adapter.createIntent({
      amountCents: current.amountCents,
      currency: current.currency,
      customer: saved.stripeCustomerId,
      paymentMethod: saved.paymentMethodId,
      metadata: { ...current.metadata, charged_user_id: payerUserId },
      applicationFeeCents: current.applicationFeeCents,
      destinationAccountId: current.destinationAccountId,
    });
  } catch (err) {
    const { code, message } = errInfo(err);
    // The old intent is already cancelled and cannot be revived. Surface the
    // failure so the caller rolls back the DB column; the payments row still
    // points at the (now cancelled) old intent, which the caller clears.
    logger.error(
      JSON.stringify({
        event: "designated_payer_intent_reissue_failed",
        phase: "create",
        oldIntentId: current.paymentIntentId,
        code,
        message,
      }),
    );
    return { kind: "failed", phase: "create", code, message };
  }

  await adapter.persistNewIntent({
    bookingId,
    oldPaymentIntentId: current.paymentIntentId,
    newPaymentIntentId: created.id,
    amountCents: current.amountCents,
    applicationFeeCents: current.applicationFeeCents,
    currency: current.currency,
    destinationAccountId: current.destinationAccountId,
  });

  logger.info(
    JSON.stringify({
      event: "designated_payer_intent_reissued",
      oldIntentId: current.paymentIntentId,
      newIntentId: created.id,
      payerCustomerId: saved.stripeCustomerId,
    }),
  );

  return {
    kind: "reissued",
    newIntentId: created.id,
    payerCustomerId: saved.stripeCustomerId,
  };
}
