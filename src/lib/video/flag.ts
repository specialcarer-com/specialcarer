// Whereby video interviews ship OFF by default. Set
// INTERVIEWS_VIDEO_ENABLED="true" to enable. While off:
//   - the interview room API routes return 403 ("feature disabled"),
//   - the interview UI (JoinInterviewCard) renders nothing.
//
// Read server-side only (no NEXT_PUBLIC_ prefix) so it can be flipped
// per-environment without a client rebuild. Same pattern as the designated
// payer flag (gap 31).
export function isInterviewsVideoEnabled(): boolean {
  return process.env.INTERVIEWS_VIDEO_ENABLED === "true";
}
