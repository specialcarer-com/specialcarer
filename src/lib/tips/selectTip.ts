import type { Tip } from "./carerTips";

/**
 * Day of the year (1–366) for a date, computed in UTC so the result is
 * stable regardless of the viewer's timezone.
 */
export function dayOfYearUTC(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor((today - startOfYear) / 86_400_000) + 1;
}

/**
 * Deterministically pick one tip for a given calendar day (UTC).
 *
 * Pure: same `date` and `tips` always yield the same tip, and the choice
 * advances by one each day, cycling back to the start after the list is
 * exhausted (including across year boundaries).
 */
export function selectTipForDate(date: Date, tips: Tip[]): Tip {
  if (tips.length === 0) {
    throw new Error("selectTipForDate: tips must not be empty");
  }
  const index = (dayOfYearUTC(date) - 1) % tips.length;
  return tips[index];
}
