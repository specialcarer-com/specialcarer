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

function stripeReason(
  reason: string | null,
): "duplicate" | "fraudulent" | "requested_by_customer" {
  if (reason === "duplicate" || reason === "fraudulent") return reason;
  return "requested_by_customer";
}

/**
 * Calls Stripe for a refund. The route owns the database reservation and
 * persistence; keeping the Stripe call here makes its money movement testable.
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
  const refund = await stripe.refunds.create(
    {
      payment_intent: request.payment.stripePaymentIntentId,
      amount: amountCents,
      reason: stripeReason(request.reason),
      metadata: {
        admin_id: request.adminId,
        booking_id: request.booking.id,
      },
    },
    { idempotencyKey },
  );

  return { ok: true, refundId: refund.id, amountCents, idempotencyKey };
}
