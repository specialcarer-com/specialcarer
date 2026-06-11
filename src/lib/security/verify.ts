import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeRecoveryCode } from "./store";
import { decideVerify, type VerifyOutcome } from "./verify-core";

export type { VerifyOutcome } from "./verify-core";

/**
 * Verify a user-supplied code against their active TOTP factor, optionally
 * falling back to a recovery code (gap 13). Thin wrapper that wires the real
 * Supabase MFA client + recovery store into the pure {@link decideVerify} core.
 */
export async function verifyTotpOrRecovery(
  supabase: SupabaseClient,
  userId: string,
  code: string,
  opts: { allowRecovery: boolean },
): Promise<VerifyOutcome> {
  return decideVerify(
    {
      async verifyTotp(totpCode) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (!totp) return false;
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId: totp.id,
          code: totpCode,
        });
        return !error;
      },
      consumeRecovery: (recoveryCode) => consumeRecoveryCode(userId, recoveryCode),
    },
    code,
    opts,
  );
}
