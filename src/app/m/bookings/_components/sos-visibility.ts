/**
 * Pure visibility helper for the seeker SOS button.
 *
 * Kept separate from the React component so it can be unit-tested
 * without a DOM (matches the handler/route split used elsewhere).
 *
 * Rule (per P1-B3 brief):
 *   - User must be the seeker on this booking (as_role === "seeker").
 *   - Show when booking.status === "in_progress".
 *   - Otherwise show when status is "accepted" or "paid" AND the current
 *     time is within ±2h of starts_at — i.e. the shift is imminent or
 *     just finished but still active.
 *   - Hide in every other case.
 */

export type SosVisibilityInput = {
  status: string;
  as_role: "seeker" | "carer";
  starts_at: string | null | undefined;
  now?: Date;
};

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function isSosButtonVisible(input: SosVisibilityInput): boolean {
  if (input.as_role !== "seeker") return false;

  // Always-show case: shift is live.
  if (input.status === "in_progress") return true;

  // Window case: shift is accepted/paid and starts (or just started) soon.
  if (input.status !== "accepted" && input.status !== "paid") return false;

  if (!input.starts_at) return false;
  const startsMs = Date.parse(input.starts_at);
  if (Number.isNaN(startsMs)) return false;

  const nowMs = (input.now ?? new Date()).getTime();
  return Math.abs(nowMs - startsMs) <= TWO_HOURS_MS;
}
