import crypto from "node:crypto";

/**
 * 2FA recovery codes (gap 13).
 *
 * Recovery codes are the single-use fallback when a user loses their
 * authenticator. We generate a batch of 10 at enrolment, show them once, and
 * persist only a scrypt hash (the plaintext is unrecoverable thereafter).
 *
 * Format: 32-char Crockford base32, grouped XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 * for legibility. 32 chars of 5-bit symbols = 160 bits of entropy, far beyond
 * brute-force range even before rate-limiting and single-use enforcement.
 */

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 32;

// Crockford base32 (no I, L, O, U — avoids visual ambiguity when typed by hand).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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

/** Group a raw code into 8 four-char chunks for display: XXXX-XXXX-… */
export function formatRecoveryCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** Strip separators / whitespace and upper-case so user-typed input matches. */
export function normaliseRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
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
