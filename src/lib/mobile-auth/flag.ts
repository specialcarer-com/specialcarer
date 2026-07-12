// Persistent mobile sign-in + biometric app-lock ships OFF by default. Set
// NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED="true" to enable. While off the
// /m surface behaves exactly as it does today: the biometric lock screen never
// mounts and the "App lock" settings row stays hidden.
//
// Client-readable (NEXT_PUBLIC_ prefix) because the lock gate runs entirely in
// the Capacitor WebView — there is no server round-trip to consult. Mirrors the
// MEMBERSHIPS_ENABLED flag (src/lib/memberships/flag.ts).
export const MOBILE_PERSISTENT_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_MOBILE_PERSISTENT_AUTH_ENABLED === "true";
