import { createHash } from "node:crypto";

/**
 * Deterministically derive a referral code for a user from their name + id.
 *
 * Format: FIRST6OFNAME-XXXX
 *   FIRST6OFNAME  uppercase alphanumerics, first six chars of full name
 *                 (falls back to "FRIEND" if the name yields nothing)
 *   XXXX          base32 of the first 5 chars of md5(user_id), uppercased
 *
 * Stable for a given (name, user_id) pair, so calling twice yields the
 * same code. Collisions across users with the same name suffix are
 * astronomically unlikely thanks to the md5-derived tail; if one ever
 * occurs the server should disambiguate by appending a fresh suffix.
 */
export function deriveReferralCode(
  fullName: string | null | undefined,
  userId: string,
): string {
  const cleaned = (fullName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const prefix = (cleaned.slice(0, 6) || "FRIEND").padEnd(2, "X").slice(0, 6);

  const md5 = createHash("md5").update(userId).digest("hex").slice(0, 5);
  // Treat the hex as a number and emit base32 (Crockford-ish: 0-9 + A-Z minus
  // confusable chars). 5 hex chars = 20 bits → 4 base32 chars.
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford
  let n = parseInt(md5, 16);
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix = ALPHABET[n & 31] + suffix;
    n >>= 5;
  }
  return `${prefix}-${suffix}`;
}
