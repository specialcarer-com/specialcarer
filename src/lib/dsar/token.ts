/**
 * SpecialCarer — DSAR verification token utilities.
 *
 * A DSAR submission is not authenticated (the subject may no longer
 * have an account). We prove they own the submitted email address by
 * mailing them a one-time link. The token in the link is a random
 * 256-bit value; the database stores only its SHA-256 hash.
 *
 * That way a compromised database backup can't be replayed against
 * /api/dsar/verify/[token] to escalate any request straight to
 * `in_progress`.
 */

import { createHash, randomBytes } from "node:crypto";

// 32 bytes -> 43-char base64url string (no padding). Comfortably above
// the 128-bit floor for URL tokens.
const TOKEN_BYTES = 32;

export function generateVerificationToken(): {
  raw: string;
  hash: string;
} {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const hash = hashVerificationToken(raw);
  return { raw, hash };
}

export function hashVerificationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
