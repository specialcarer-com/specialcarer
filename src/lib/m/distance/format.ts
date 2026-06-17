/**
 * Human-readable distance formatting for the mobile redesign (PR-R3).
 *
 * UK defaults: metres under 1 km, kilometres at/above. No miles unless a future
 * caller explicitly asks. A null/invalid distance means "no location known",
 * which the redesign surfaces as "Online" (consistent with <CarerCard>).
 */

/**
 * Format a distance in metres:
 *   - null / NaN / negative → "Online"
 *   - < 1000 m              → whole metres, e.g. "120 m"
 *   - >= 1000 m             → one-decimal km, e.g. "1.2 km"
 *
 * `locale` is accepted for number grouping/decimal separators (defaults to
 * en-GB). Unit choice stays metric regardless of locale.
 */
export function formatDistance(
  meters: number | null | undefined,
  locale: string = "en-GB",
): string {
  if (meters == null || !Number.isFinite(meters) || meters < 0) {
    return "Online";
  }

  if (meters < 1000) {
    const m = Math.round(meters);
    return `${m.toLocaleString(locale)} m`;
  }

  const km = meters / 1000;
  const body = km.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${body} km`;
}
