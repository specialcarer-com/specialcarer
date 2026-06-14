/**
 * Designated Payer (gap 31) — payment-flow resolution.
 *
 * Decides WHO is charged for a booking's PaymentIntent. Pure over a thin
 * adapter so the create-booking-intent route can stay thin and the three
 * required cases are unit-testable without Stripe or Supabase:
 *
 *   (a) flag OFF                                  -> seeker charged (legacy)
 *   (b) flag ON + payer set + payer has saved PM  -> payer charged
 *   (c) flag ON + payer set + payer has NO PM     -> seeker charged + warn log
 *
 * "Charge the payer" means attaching the payer's Stripe customer + their
 * default saved payment method to the PaymentIntent for an off-session charge.
 * When we fall back to the seeker we return no override, so the existing
 * automatic_payment_methods (on-session, seeker confirms) flow is unchanged.
 */

export type PayerChargeAdapter = {
  /**
   * The payer's saved Stripe customer + default payment method, or null when
   * the payer has no Stripe customer / no saved payment method on file.
   */
  getSavedPaymentMethod(payerUserId: string): Promise<{
    stripeCustomerId: string;
    paymentMethodId: string;
  } | null>;
};

export type ResolvePayerInput = {
  seekerId: string;
  /** bookings.designated_payer_user_id (NULL when none). */
  designatedPayerUserId: string | null;
  flagEnabled: boolean;
  adapter: PayerChargeAdapter;
  /** Injectable logger so tests can assert the (c) warn. Defaults to console. */
  logger?: Pick<typeof console, "warn" | "info">;
};

export type ResolvePayerResult = {
  /** The user id that will actually be billed. */
  chargedUserId: string;
  /**
   * When set, the caller should pass these to paymentIntents.create instead of
   * automatic_payment_methods, charging the designated payer off-session.
   * When null, the caller keeps the legacy seeker-confirms flow untouched.
   */
  override: {
    customer: string;
    payment_method: string;
    off_session: true;
    confirm: true;
  } | null;
};

export async function resolveBookingPayer(
  input: ResolvePayerInput,
): Promise<ResolvePayerResult> {
  const {
    seekerId,
    designatedPayerUserId,
    flagEnabled,
    adapter,
    logger = console,
  } = input;

  const seekerResult: ResolvePayerResult = {
    chargedUserId: seekerId,
    override: null,
  };

  // (a) Flag off, or no designated payer set → seeker pays (legacy). When the
  // flag is off we never even look at the column.
  if (!flagEnabled || !designatedPayerUserId) {
    return seekerResult;
  }

  // Designated payer is the seeker anyway → nothing to override.
  if (designatedPayerUserId === seekerId) {
    return seekerResult;
  }

  const saved = await adapter.getSavedPaymentMethod(designatedPayerUserId);

  // (c) Payer set but has no saved payment method → fall back to seeker, warn.
  if (!saved) {
    logger.warn(
      `[designated-payer] booking payer ${designatedPayerUserId} has no saved payment method; falling back to seeker ${seekerId}`,
    );
    return seekerResult;
  }

  // (b) Payer set + has a saved payment method → charge the payer off-session.
  logger.info(
    `[designated-payer] charging designated payer ${designatedPayerUserId} instead of seeker ${seekerId}`,
  );
  return {
    chargedUserId: designatedPayerUserId,
    override: {
      customer: saved.stripeCustomerId,
      payment_method: saved.paymentMethodId,
      off_session: true,
      confirm: true,
    },
  };
}
