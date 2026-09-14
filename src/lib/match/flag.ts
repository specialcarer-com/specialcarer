// Commute-aware matching scoring (E3) ships OFF by default. Set
// NEXT_PUBLIC_COMMUTE_SCORING_ENABLED="true" to expose the new
// commute-time signal + rebalanced weights. When off, the scorer is
// bit-identical to the pre-E3 baseline (distance 40 / rating 30 /
// response_rate 15 / recency 10 / completion_rate 5) — see
// src/lib/match/scoring.test.ts for the guard test.
//
// NEXT_PUBLIC_ prefix so the flag is readable client-side even though
// the scorer only runs on the server today — cheaper than changing the
// prefix later if a mobile client ever needs to reason about it.
//
// Same string-equality pattern as src/lib/memberships/flag.ts and
// src/lib/mobile-redesign/flag.ts.
export const COMMUTE_SCORING_ENABLED =
  process.env.NEXT_PUBLIC_COMMUTE_SCORING_ENABLED === "true";

export function isCommuteScoringEnabled(): boolean {
  return COMMUTE_SCORING_ENABLED;
}
