/**
 * Feature flags for the E4 care-plan family surfaces + Reg 9 review cadence.
 *
 * Both flags default OFF. When both are off:
 *   - The family care-plan viewer routes render a "coming soon" card and
 *     the mobile /m/family recipient tile hides the care-plan CTA.
 *   - The seeker/admin review routes render an empty state.
 *   - The nightly `/api/cron/care-plan-review-reminder` cron returns
 *     `{ ok: true, skipped: 'flag_off' }` and does zero DB work.
 *
 * These are pure `NEXT_PUBLIC_*` env reads so both server and client
 * components can call them without a round trip. The pattern mirrors
 * `src/lib/memberships/flag.ts`.
 */
export function isFamilyCarePlanViewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FAMILY_CARE_PLAN_VIEW_ENABLED === "true";
}

export function isReg9ReviewCadenceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED === "true";
}
