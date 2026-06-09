// Public membership UI (the /m/memberships page + its nav entry) is hidden for
// the soft launch. Set NEXT_PUBLIC_MEMBERSHIPS_ENABLED="true" to expose it.
// The checkout API and Stripe webhook are intentionally NOT gated by this flag
// so internal testing can drive them directly.
export const MEMBERSHIPS_ENABLED =
  process.env.NEXT_PUBLIC_MEMBERSHIPS_ENABLED === "true";
