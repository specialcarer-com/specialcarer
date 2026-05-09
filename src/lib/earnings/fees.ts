/**
 * Instant-payout fee math + minimums for the carer earnings flow.
 *
 *  • Fee = 1% of payout amount, clamped to [50, 500] cents.
 *  • Minimum payout = 500 cents (£5 / $5).
 *  • Net to carer = amount − fee.
 */

export const INSTANT_PAYOUT_MIN_CENTS = 500;
export const INSTANT_PAYOUT_FEE_PERCENT = 1; // 1%
export const INSTANT_PAYOUT_FEE_MIN_CENTS = 50;
export const INSTANT_PAYOUT_FEE_MAX_CENTS = 500;
export const REFERRAL_BONUS_CENTS_GBP = 5000;
export const REFERRAL_BONUS_CENTS_USD = 5000;
export const REFERRAL_QUALIFYING_BOOKINGS = 5;

export function instantPayoutFeeCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const raw = Math.round(amountCents * (INSTANT_PAYOUT_FEE_PERCENT / 100));
  return Math.max(
    INSTANT_PAYOUT_FEE_MIN_CENTS,
    Math.min(INSTANT_PAYOUT_FEE_MAX_CENTS, raw),
  );
}

export function instantPayoutNetCents(amountCents: number): number {
  return Math.max(0, amountCents - instantPayoutFeeCents(amountCents));
}
