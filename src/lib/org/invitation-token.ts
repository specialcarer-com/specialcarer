/**
 * Invitation token generation + hashing (Phase D — PR D1).
 *
 * Pure, no I/O. Callers are the invitation-send route (mints one raw
 * token, keeps only the hash) and the accept + preview routes (hash
 * the incoming URL token and look up by hash).
 *
 * Threat model:
 *   - Raw token NEVER persists — it only lives in the emailed link.
 *     A DB leak therefore does not leak acceptable tokens.
 *   - 32 bytes of `crypto.randomBytes` gives 256 bits of entropy —
 *     brute-forcing the token space is not feasible.
 *   - `base64url` (RFC 4648 §5) is URL-safe (no `+ / =`) so the raw
 *     token can drop straight into a Next.js dynamic segment.
 *   - SHA-256 hex is fine as a KDF here (fast, no salt) because the
 *     input entropy is already 256 bits — a slow hash (bcrypt/argon2)
 *     buys nothing when the pre-image is uniformly random.
 *   - `hashToken` uses `Buffer.compare`-style constant-time paths
 *     inside node:crypto; equality checks between two hashes MUST use
 *     `timingSafeEqual` at the call site to avoid a short-circuit
 *     comparison leaking the prefix length. This module exposes
 *     `timingSafeEqualHex` for that.
 */

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** 32 bytes → 256 bits of entropy → 43-char base64url string (no padding). */
const RAW_TOKEN_BYTES = 32;

export type TokenPair = {
  /** URL-safe raw token — only ever placed in the email link. */
  rawToken: string;
  /** SHA-256 hex of the raw token — the DB-persistable form. */
  tokenHash: string;
};

/**
 * Generate a fresh invitation token pair. The raw token is
 * cryptographically random and URL-safe; the hash is what we store.
 */
export function generateToken(): TokenPair {
  const rawToken = randomBytes(RAW_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * SHA-256 hex of the raw token. Deterministic — the same input always
 * hashes to the same output, so the DB lookup by `token_hash` works.
 *
 * Trims incoming whitespace so a stray newline copied from an email
 * client doesn't cause a false miss.
 */
export function hashToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  return createHash("sha256").update(trimmed, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hex-encoded hashes. Callers doing
 * `a === b` are technically unsafe on strings — this bounds any
 * timing side-channel to a single-byte read. Length-check first, then
 * `timingSafeEqual` on equal-length buffers (the underlying primitive
 * rejects unequal lengths outright, hence the guard).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}
