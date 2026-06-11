import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateRecoveryCodeBatch,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "./recovery-codes";
import { consumeFromList, issueBatch } from "./store-core";

/**
 * Server-side data layer for 2FA recovery codes (gap 13).
 *
 * All writes go through the service-role client: the `mfa_recovery_codes`
 * table grants authenticated users SELECT only, so the user-scoped client
 * cannot mint or burn codes. The server is the sole authority for issuing and
 * consuming them.
 */

export type RecoveryCodeStatus = {
  remaining: number;
  total: number;
};

/**
 * Generate a fresh batch of recovery codes for `userId`, invalidate any prior
 * UNUSED codes (so "regenerate" can't leave stale live codes around), persist
 * the hashes, and return the plaintext codes — the ONLY time they exist.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const batchId = crypto.randomUUID();

  return issueBatch(
    {
      // Drop prior unused codes first so only the new batch is live. Already-used
      // rows are kept for audit (used_at is set).
      async deleteUnused() {
        await admin
          .from("mfa_recovery_codes")
          .delete()
          .eq("user_id", userId)
          .is("used_at", null);
      },
      async insert(rows) {
        const { error } = await admin
          .from("mfa_recovery_codes")
          .insert(rows.map((r) => ({ ...r, user_id: userId })));
        if (error) throw new Error(`Failed to store recovery codes: ${error.message}`);
      },
    },
    generateRecoveryCodeBatch(),
    hashRecoveryCode,
    batchId,
  );
}

/** Delete ALL of a user's recovery codes (used when disabling 2FA). */
export async function clearRecoveryCodes(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
}

/** Count a user's remaining (unused) recovery codes and the live batch size. */
export async function getRecoveryCodeStatus(
  userId: string,
): Promise<RecoveryCodeStatus> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mfa_recovery_codes")
    .select("used_at")
    .eq("user_id", userId);
  const rows = data ?? [];
  const remaining = rows.filter((r) => r.used_at === null).length;
  return { remaining, total: rows.length };
}

/**
 * Try to consume one unused recovery code matching `code`. Returns true and
 * marks it used on success; false if no live code matches.
 *
 * Verification is O(unused codes) scrypt calls — at most 10 — which is fine for
 * a rate-limited fallback path. The UPDATE is guarded on `used_at is null` so a
 * concurrent double-submit can't burn the same code twice.
 */
export async function consumeRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const admin = createAdminClient();
  return consumeFromList(
    {
      async listUnused() {
        const { data } = await admin
          .from("mfa_recovery_codes")
          .select("id, code_hash, used_at")
          .eq("user_id", userId)
          .is("used_at", null);
        return data ?? [];
      },
      verify: verifyRecoveryCode,
      async markUsed(id) {
        const { data: updated } = await admin
          .from("mfa_recovery_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", id)
          .is("used_at", null)
          .select("id");
        return Boolean(updated && updated.length > 0);
      },
    },
    code,
  );
}
