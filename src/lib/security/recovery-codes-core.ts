import crypto from "node:crypto";
import {
  ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
  normaliseRecoveryCode,
} from "./recovery-codes";

/**
 * 2FA recovery codes (gap 13) — crypto core.
 *
 * Generation, hashing and verification all use `node:crypto`, so this module
 * must never reach the client bundle. It is `server-only`-free (no such import)
 * so it can be unit-tested under the bare node runner; the `recovery-codes.server.ts`
 * wrapper re-exports it behind `import "server-only"` for app/server code, and
 * the client-safe helpers/constants live in `recovery-codes.ts`. Same shape as
 * the `store-core.ts` / `store.ts` and `verify-core.ts` / `verify.ts` splits.
 */

/** Generate a single 32-char base32 recovery code (no separators). */
export function generateRecoveryCode(): string {
  // Pull one random byte per char and fold into the 32-symbol alphabet. Using
  // a 5-bit mask on a uniform byte keeps the distribution flat across symbols.
  const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] & 31];
  }
  return out;
}

/** Generate a fresh batch of {@link RECOVERY_CODE_COUNT} distinct codes. */
export function generateRecoveryCodeBatch(): string[] {
  const codes = new Set<string>();
  // Collision at 160 bits is astronomically unlikely, but the Set guard makes
  // "10 distinct codes" a hard guarantee rather than a probabilistic one.
  while (codes.size < RECOVERY_CODE_COUNT) {
    codes.add(generateRecoveryCode());
  }
  return [...codes];
}

// ---------------------------------------------------------------------------
// Hashing — Node crypto.scrypt (the repo has no bcrypt/argon2 dependency).
// Stored form: scrypt$N$<saltHex>$<hashHex>. The cost param is embedded so a
// future bump stays verifiable against old rows.
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384; // 2^14 — interactive-grade cost
const SCRYPT_KEYLEN = 32;

/** Hash a recovery code for storage. Async to avoid blocking the event loop. */
export function hashRecoveryCode(code: string): Promise<string> {
  const normalised = normaliseRecoveryCode(code);
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(normalised, salt, SCRYPT_KEYLEN, { N: SCRYPT_N }, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT_N}$${salt.toString("hex")}$${derived.toString("hex")}`);
    });
  });
}

/**
 * Constant-time verify of a user-supplied code against a stored hash.
 * Returns false (never throws) on malformed input so callers can treat it as a
 * plain mismatch.
 */
export function verifyRecoveryCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return Promise.resolve(false);
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  if (!Number.isInteger(n) || n <= 1 || salt.length === 0 || expected.length === 0) {
    return Promise.resolve(false);
  }
  const normalised = normaliseRecoveryCode(code);
  return new Promise((resolve) => {
    crypto.scrypt(normalised, salt, expected.length, { N: n }, (err, derived) => {
      if (err) return resolve(false);
      resolve(
        derived.length === expected.length &&
          crypto.timingSafeEqual(derived, expected),
      );
    });
  });
}
