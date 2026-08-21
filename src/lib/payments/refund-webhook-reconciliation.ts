export type RefundWebhookPayment = { bookingId: string | null };

export type RefundWebhookClaim = {
  id: string;
  requestKey: string;
};

export type RefundWebhookClient = {
  updatePaymentStatus(status: "refunded" | "partially_refunded"): Promise<{
    error: { message: string } | null;
  }>;
  findPayment(): Promise<{
    data: RefundWebhookPayment | null;
    error: { message: string } | null;
  }>;
  updateBooking(input: {
    bookingId: string;
    status: "refunded" | "partially_refunded";
    amountCents: number;
    refundedAt: string;
  }): Promise<{ error: { message: string } | null }>;
  reconcileClaim(input: {
    bookingId: string;
    claim: RefundWebhookClaim;
    amountCents: number;
    refundedAt: string;
  }): Promise<{ error: { message: string } | null }>;
};

export async function reconcileChargeRefund(input: {
  client: RefundWebhookClient;
  fullyRefunded: boolean;
  amountCents: number;
  claimedRefund: RefundWebhookClaim | null;
  now?: Date;
}): Promise<string | null> {
  const status = input.fullyRefunded ? "refunded" : "partially_refunded";
  const paymentUpdate = await input.client.updatePaymentStatus(status);
  if (paymentUpdate.error) {
    throw new Error(
      `[stripe.webhook] refund payment update failed: ${paymentUpdate.error.message}`,
    );
  }

  const payment = await input.client.findPayment();
  if (payment.error) {
    throw new Error(
      `[stripe.webhook] refund payment lookup failed: ${payment.error.message}`,
    );
  }
  if (!payment.data?.bookingId) return null;

  const refundedAt = (input.now ?? new Date()).toISOString();
  const bookingUpdate = await input.client.updateBooking({
    bookingId: payment.data.bookingId,
    status,
    amountCents: input.amountCents,
    refundedAt,
  });
  if (bookingUpdate.error) {
    throw new Error(
      `[stripe.webhook] booking refund update failed: ${bookingUpdate.error.message}`,
    );
  }

  if (input.claimedRefund) {
    const reconciliation = await input.client.reconcileClaim({
      bookingId: payment.data.bookingId,
      claim: input.claimedRefund,
      amountCents: input.amountCents,
      refundedAt,
    });
    if (reconciliation.error) {
      throw new Error(
        `[stripe.webhook] refund claim reconciliation failed: ${reconciliation.error.message}`,
      );
    }
  }
  return payment.data.bookingId;
}
