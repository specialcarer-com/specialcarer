export type RefundableBooking = {
  id: string;
  stripeRefundId: string | null;
  refundRequestKey: string | null;
};

export type RefundablePayment = {
  stripePaymentIntentId: string;
  amountCents: number;
};

export type StripeRefundClient = {
  refunds: {
    create(
      params: {
        payment_intent: string;
        amount: number;
        reason?: "duplicate" | "fraudulent" | "requested_by_customer";
        metadata: Record<string, string>;
      },
      options: { idempotencyKey: string },
    ): Promise<{ id: string }>;
  };
};

export type RefundRequest = {
  booking: RefundableBooking;
  payment: RefundablePayment;
  adminId: string;
  amountCents?: number;
  reason: string | null;
};

export type RefundResult =
  | { ok: true; refundId: string; amountCents: number; idempotencyKey: string }
  | { ok: false; status: 400 | 409; error: string };

type StripeErrorLike = {
  statusCode?: unknown;
  status?: unknown;
  code?: string;
};

function stripeReason(
  reason: string | null,
): "duplicate" | "fraudulent" | "requested_by_customer" {
  if (reason === "duplicate" || reason === "fraudulent") return reason;
  return "requested_by_customer";
}

export function isDefinitiveStripeRefundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as StripeErrorLike;
  const status =
    typeof candidate.statusCode === "number"
      ? candidate.statusCode
      : typeof candidate.status === "number"
        ? candidate.status
        : null;
  if (candidate.code === "idempotency_key_reused_with_different_parameters") {
    return true;
  }
  if (
    status === 429 ||
    (status === 409 && candidate.code === "idempotency_key_in_use")
  ) {
    return false;
  }
  return status !== null && status >= 400 && status < 500;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Stripe for a refund. The route owns the database reservation and
 * persistence; keeping the Stripe call here makes its money movement testable.
 *
 * A request can time out after Stripe accepts it. Retrying with the same
 * idempotency key returns that original refund rather than issuing another one.
 */
export async function createStripeRefund(
  request: RefundRequest,
  stripe: StripeRefundClient,
): Promise<RefundResult> {
  if (request.booking.stripeRefundId || request.booking.refundRequestKey) {
    return { ok: false, status: 409, error: "refund_already_requested" };
  }

  const amountCents = request.amountCents ?? request.payment.amountCents;
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > request.payment.amountCents
  ) {
    return { ok: false, status: 400, error: "invalid_refund_amount" };
  }

  const idempotencyKey = `refund-${request.booking.id}-${request.adminId}-${amountCents}`;
  const params = {
    payment_intent: request.payment.stripePaymentIntentId,
    amount: amountCents,
    reason: stripeReason(request.reason),
    metadata: {
      admin_id: request.adminId,
      booking_id: request.booking.id,
      refund_request_key: idempotencyKey,
    },
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const refund = await stripe.refunds.create(params, { idempotencyKey });
      return { ok: true, refundId: refund.id, amountCents, idempotencyKey };
    } catch (error) {
      lastError = error;
      if (isDefinitiveStripeRefundError(error) || attempt === 2) break;
      await wait(50 * 2 ** attempt);
    }
  }

  throw lastError;
}
