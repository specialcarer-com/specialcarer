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
 * Index into `tips` for a given calendar day (UTC) — day-of-year mod length,
 * so it advances by one each day and cycles back to the start once the list
 * is exhausted (including across year boundaries).
 */
export function tipIndexForDate(date: Date, length: number): number {
  if (length <= 0) {
    throw new Error("tipIndexForDate: length must be positive");
  }
  return (dayOfYearUTC(date) - 1) % length;
}

/**
 * Deterministically pick one tip for a given calendar day (UTC).
 *
 * Pure: same `date` and `tips` always yield the same tip.
 */
export function selectTipForDate(date: Date, tips: Tip[]): Tip {
  if (tips.length === 0) {
    throw new Error("selectTipForDate: tips must not be empty");
  }
  return tips[tipIndexForDate(date, tips.length)];
}
