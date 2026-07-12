// Designated Payer (gap 31) is a billing-path feature and ships OFF by default.
// Set FAMILY_DESIGNATED_PAYER_ENABLED="true" to enable. While off:
//   - the designated-payer API routes return 403 ("feature disabled"),
//   - the booking-detail UI section is hidden,
//   - the payment flow ignores bookings.designated_payer_user_id entirely
//     (i.e. behaviour is byte-for-byte identical to today).
//
// This is read server-side only (no NEXT_PUBLIC_ prefix) so the value can be
// flipped per-environment without a client rebuild. The GET route surfaces it
// to the client as `isFlagEnabled` so the UI never reads env directly.
export function isDesignatedPayerEnabled(): boolean {
  return process.env.FAMILY_DESIGNATED_PAYER_ENABLED === "true";
}
