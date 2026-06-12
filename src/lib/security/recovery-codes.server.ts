import "server-only";

/**
 * 2FA recovery codes (gap 13) — server-only re-export of the crypto core.
 *
 * App/server code (the recovery-code store, API routes) imports from here so
 * the `node:crypto` generation/hashing/verification can never be pulled into a
 * client bundle. The pure logic lives in `recovery-codes-core.ts` (kept
 * `server-only`-free so it stays unit-testable); the client-safe formatting
 * helpers live in `recovery-codes.ts`.
 */
export {
  generateRecoveryCode,
  generateRecoveryCodeBatch,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "./recovery-codes-core";
