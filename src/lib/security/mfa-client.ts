"use client";

import { createClient } from "@/lib/supabase/client";
import { needsMfaChallenge } from "@/lib/security/mfa-gate";

/**
 * After first-factor sign-in, decide whether to send the user to MFA setup,
 * MFA challenge, or straight to their destination.
 */
export async function resolvePostAuthRedirect(
  defaultDest: string,
): Promise<string> {
  const supabase = createClient();
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
      if (!hasTotp) {
        return `/admin/mfa/setup?next=${encodeURIComponent(defaultDest)}`;
      }
      if (needsMfaChallenge(aal)) {
        return `/admin/mfa/challenge?next=${encodeURIComponent(defaultDest)}`;
      }
      return defaultDest;
    }
  }

  if (needsMfaChallenge(aal)) {
    return `/sign-in/2fa?next=${encodeURIComponent(defaultDest)}`;
  }

  return defaultDest;
}
