import { isAccountUnavailableError, looksLikeRealStripeAccountId } from "@/lib/stripe/connect-readiness";

/**
 * Decide which Stripe Connect account a carer should onboard against.
 *
 * A stored account id can be useless: a placeholder/demo id, or an account
 * from a different Stripe environment (test sandbox swapped, test -> live).
 * Reusing it would make accountLinks.create fail for the carer. This returns
 * the stored id when Stripe can still see it, and otherwise asks the caller
 * to create a replacement. Transient Stripe failures are rethrown so we never
 * orphan a perfectly good account because of a network blip.
 */
export type OnboardingAccountDecision =
  | { action: "reuse"; accountId: string }
  | { action: "create"; replacesAccountId: string | null };

export async function decideOnboardingAccount(
  existingAccountId: string | null | undefined,
  retrieve: (id: string) => Promise<unknown>,
): Promise<OnboardingAccountDecision> {
  if (!existingAccountId) return { action: "create", replacesAccountId: null };
  if (!looksLikeRealStripeAccountId(existingAccountId)) {
    return { action: "create", replacesAccountId: existingAccountId };
  }
  try {
    await retrieve(existingAccountId);
    return { action: "reuse", accountId: existingAccountId };
  } catch (err) {
    if (isAccountUnavailableError(err)) {
      return { action: "create", replacesAccountId: existingAccountId };
    }
    throw err;
  }
}
