/**
 * Pure MFA gate decisions for Sprint 2.1 (Trust Hardening).
 * Server wrappers in mfa-server.ts feed real Supabase AAL/factor data in here
 * so we can unit-test admin enforcement without next/navigation or live auth.
 */

export type AalLevels = {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
};

export type AdminMfaGateInput = {
  isAdmin: boolean;
  hasVerifiedTotp: boolean;
  aal: AalLevels | null;
};

export type AdminMfaGateOutcome =
  | { status: "allow" }
  | { status: "setup_required" }
  | { status: "challenge_required" };

/** True when the session can be stepped up to AAL2 via TOTP challenge. */
export function needsMfaChallenge(aal: AalLevels | null | undefined): boolean {
  return aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
}

/** True when the session has completed MFA verification. */
export function isAal2Satisfied(aal: AalLevels | null | undefined): boolean {
  return aal?.currentLevel === "aal2";
}

/**
 * Admin routes require a verified TOTP factor and an AAL2 session.
 * Non-admins are unaffected (optional MFA only).
 */
export function resolveAdminMfaGate(
  input: AdminMfaGateInput,
): AdminMfaGateOutcome {
  if (!input.isAdmin) return { status: "allow" };

  if (!input.hasVerifiedTotp) {
    return { status: "setup_required" };
  }

  if (needsMfaChallenge(input.aal)) {
    return { status: "challenge_required" };
  }

  if (!isAal2Satisfied(input.aal)) {
    return { status: "challenge_required" };
  }

  return { status: "allow" };
}

/** Normalise a 6-digit TOTP input; returns null when invalid. */
export function sanitiseTotpCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 6) return null;
  return digits;
}
