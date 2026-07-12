/**
 * 2FA recovery codes (gap 13) — client-safe surface.
 *
 * This module holds ONLY the pure, dependency-free helpers (formatting,
 * normalisation, constants) so it can be imported from client components such
 * as the security settings page without dragging `node:crypto` into the client
 * bundle. Generation/hashing/verification live in `recovery-codes.server.ts`,
 * which is `server-only` and the sole holder of the `node:crypto` import.
 *
 * Format: 32-char Crockford base32, grouped XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 * for legibility. 32 chars of 5-bit symbols = 160 bits of entropy, far beyond
 * brute-force range even before rate-limiting and single-use enforcement.
 */

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 32;

// Crockford base32 (no I, L, O, U — avoids visual ambiguity when typed by hand).
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Group a raw code into 8 four-char chunks for display: XXXX-XXXX-… */
export function formatRecoveryCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** Strip separators / whitespace and upper-case so user-typed input matches. */
export function normaliseRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
