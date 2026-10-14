import type Stripe from "stripe";

/**
 * Details we already know about a carer, passed to Stripe when their Connect
 * account is created so the hosted onboarding does not ask for them again.
 *
 * Without a business profile Stripe asks every carer to pick an industry from
 * a generic list (which has no caregiving option) and to describe their
 * business. Carers are individuals, so none of that applies.
 */

/**
 * Merchant category code sent to Stripe for carer accounts.
 * 8099 = "Health practitioners, medical services (not elsewhere classified)".
 * OWNER SIGN-OFF NEEDED before live mode: confirm the code with Stripe, as it
 * affects their risk review. It has no effect in test mode.
 */
export const CARER_MCC = "8099";

export const CARER_PRODUCT_DESCRIPTION =
  "Independent personal care and companionship services for older and vulnerable adults, booked through SpecialCarer.";

export const CARER_PROFILE_URL = "https://www.specialcarer.com";

/**
 * Split a display name into first and last name, but only when it is
 * unambiguous (exactly two words). Stripe treats these as the legal name, so
 * we never guess: "Jane Q Doe" would otherwise send "Q Doe" as the surname.
 * Ambiguous names return nothing and the carer types their own on Stripe.
 */
export function splitFullName(fullName: string | null | undefined): {
  first_name?: string;
  last_name?: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2) return { first_name: parts[0], last_name: parts[1] };
  return {};
}

/** Build the prefill block for `stripe.accounts.create`. Pure, so it is testable. */
export function buildCarerAccountPrefill(input: {
  fullName?: string | null;
  email?: string | null;
}): Pick<Stripe.AccountCreateParams, "business_profile" | "individual"> {
  const name = splitFullName(input.fullName);
  const displayName = (input.fullName ?? "").trim().replace(/\s+/g, " ");
  const individual: Stripe.AccountCreateParams.Individual = {
    ...(name.first_name ? { first_name: name.first_name } : {}),
    ...(name.last_name ? { last_name: name.last_name } : {}),
    ...(input.email ? { email: input.email } : {}),
  };
  return {
    business_profile: {
      mcc: CARER_MCC,
      url: CARER_PROFILE_URL,
      product_description: CARER_PRODUCT_DESCRIPTION,
      ...(displayName ? { name: displayName } : {}),
    },
    ...(Object.keys(individual).length > 0 ? { individual } : {}),
  };
}
