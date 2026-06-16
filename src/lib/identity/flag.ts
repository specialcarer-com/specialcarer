// Veriff identity verification ships OFF by default. Set
// IDENTITY_VERIFICATION_ENABLED="true" to enable. While off:
//   - the identity API routes return 403 ("feature disabled"),
//   - the identity UI (VerifyIdentityCard) renders nothing.
//
// Read server-side only (no NEXT_PUBLIC_ prefix) so it can be flipped
// per-environment without a client rebuild. Same pattern as the Whereby
// video flag (src/lib/video/flag.ts).
export function isIdentityVerificationEnabled(): boolean {
  return process.env.IDENTITY_VERIFICATION_ENABLED === "true";
}
