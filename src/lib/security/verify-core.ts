/**
 * Pure decision core for 2FA verification (gap 13), free of server-only
 * imports so it can be unit-tested. The thin server wrapper in verify.ts wires
 * the real Supabase MFA client and recovery-code store into these ports.
 */

const TOTP_RE = /^\d{6}$/;

export type VerifyOutcome =
  | { ok: true; method: "totp" | "recovery" }
  | { ok: false };

export type VerifyPorts = {
  /** Verify a 6-digit TOTP against the user's active factor. */
  verifyTotp: (code: string) => Promise<boolean>;
  /** Consume a single-use recovery code; returns true if one matched. */
  consumeRecovery: (code: string) => Promise<boolean>;
};

/** True if the input looks like a 6-digit TOTP (vs a recovery code). */
export function looksLikeTotp(code: string): boolean {
  return TOTP_RE.test(code.trim());
}

/**
 * Decide a verification outcome from injected ports.
 *
 * A 6-digit numeric input is treated as TOTP. Anything else is treated as a
 * recovery code and, when `allowRecovery`, consumed on success. Recovery is
 * disallowed for the regenerate flow (we're about to invalidate that batch).
 */
export async function decideVerify(
  ports: VerifyPorts,
  code: string,
  opts: { allowRecovery: boolean },
): Promise<VerifyOutcome> {
  const trimmed = code.trim();

  if (looksLikeTotp(trimmed)) {
    return (await ports.verifyTotp(trimmed))
      ? { ok: true, method: "totp" }
      : { ok: false };
  }

  if (opts.allowRecovery && (await ports.consumeRecovery(trimmed))) {
    return { ok: true, method: "recovery" };
  }
  return { ok: false };
}
