import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AalLevels } from "./mfa-gate";

/** Load current/next AAL from the Supabase session. */
export async function getAalLevels(
  supabase: SupabaseClient,
): Promise<AalLevels | null> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
  };
}

/** True when the user has at least one verified TOTP factor enrolled. */
export async function hasVerifiedTotpFactor(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return (factors?.totp ?? []).some((f) => f.status === "verified");
}

/** First verified TOTP factor, if any. */
export async function getVerifiedTotpFactor(
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
  return totp ? { id: totp.id } : null;
}
