// DBS verification (PR-DBS-1..2) ships OFF by default. Set
// NEXT_PUBLIC_DBS_ENABLED="true" to expose the DBS surfaces and allow the
// server-side write paths to run. While off:
//   - the carer DBS UI + profile menu entry render nothing,
//   - the home banner is hidden,
//   - search/booking gating is a no-op (no behaviour change),
//   - the DBS service write paths throw DbsDisabledError.
//
// NEXT_PUBLIC_ prefix so the same flag reads consistently on the client
// (UI gating) and the server (write-path guard). Mirrors the
// NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED pattern in src/lib/mobile-redesign/flag.ts.
export const DBS_ENABLED = process.env.NEXT_PUBLIC_DBS_ENABLED === "true";

export function isDbsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DBS_ENABLED === "true";
}
