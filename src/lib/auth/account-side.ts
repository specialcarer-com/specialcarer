/**
 * Carer, family and organisation accounts are separate. An email address
 * belongs to exactly one of them. These helpers decide when a sign-in or
 * sign-up attempt on one audience's page hits an account of another side, and
 * who may create family bookings.
 */

export type Audience = "caregiver" | "family" | "organisation";
export type ProfileRole = "seeker" | "caregiver" | "organization" | "admin";

const SIDE_LABEL: Record<Audience, string> = {
  caregiver: "carer",
  family: "family",
  organisation: "organisation",
};

const SIGN_IN_HREF: Record<Audience, string> = {
  caregiver: "/login/caregiver",
  family: "/login/family",
  organisation: "/login/organisation",
};

/** Profile role -> audience (admins have no audience and are never blocked). */
export function audienceForRole(role: string | null | undefined): Audience | null {
  switch (role) {
    case "caregiver":
      return "caregiver";
    case "seeker":
      return "family";
    case "organization":
      return "organisation";
    default:
      return null;
  }
}

/** Audience -> role to stamp on a brand-new account (organisations need their own flow). */
export function roleForNewAccount(audience: Audience): "caregiver" | "seeker" | null {
  if (audience === "caregiver") return "caregiver";
  if (audience === "family") return "seeker";
  return null;
}

export type SideMismatch = {
  actual: Audience;
  message: string;
  signInHref: string;
};

/**
 * Returns a mismatch when a finished account of one side is used on another
 * side's page. Unfinished profiles (still choosing a side in onboarding) and
 * admins are never blocked.
 */
export function sideMismatch(input: {
  role: string | null | undefined;
  profileComplete: boolean;
  audience: Audience;
}): SideMismatch | null {
  if (!input.profileComplete) return null;
  const actual = audienceForRole(input.role);
  if (!actual || actual === input.audience) return null;
  const actualLabel = SIDE_LABEL[actual];
  const triedLabel = SIDE_LABEL[input.audience];
  return {
    actual,
    signInHref: SIGN_IN_HREF[actual],
    message:
      `This email already has a ${actualLabel} account. Sign in on the ${actualLabel} page, ` +
      `or use a different email address to create a ${triedLabel} account. ` +
      `Carer, family and organisation accounts are kept separate.`,
  };
}

/** Carer accounts cannot book care; admins and everyone else follow normal rules. */
export function canCreateFamilyBooking(role: string | null | undefined): boolean {
  return role !== "caregiver";
}
