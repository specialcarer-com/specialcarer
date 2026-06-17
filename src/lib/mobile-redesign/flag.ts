// Mobile redesign (PR-R1..R5) ships OFF by default. Set
// NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED="true" to expose the redesigned
// surfaces. While off, the redesigned components/tokens are inert and the
// existing /m/* UI is unchanged.
//
// NEXT_PUBLIC_ prefix so the flag is readable client-side (the redesign is
// pure frontend). Same string-equality pattern as the memberships flag
// (src/lib/memberships/flag.ts) and the identity flag (src/lib/identity/flag.ts).
export const MOBILE_REDESIGN_ENABLED =
  process.env.NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED === "true";

export function isMobileRedesignEnabled(): boolean {
  return MOBILE_REDESIGN_ENABLED;
}
