/**
 * Pure client-safe formatter for ETA values. Lives in its own file so
 * client components can import it without dragging in the
 * server-only fetch helpers from `eta.ts`.
 */

/**
 * "now" / "~5 min" / "~25 min" / "~1 hr 5 min".
 * Returns null when seconds is null so the UI can hide the countdown.
 */
export function formatEta(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return "now";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `~${totalMin} min`;
  const hr = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `~${hr} hr` : `~${hr} hr ${mins} min`;
}
