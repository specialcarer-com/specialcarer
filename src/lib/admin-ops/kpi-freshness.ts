/**
 * Pure helpers for the KPI freshness banner (E5). Kept separate from
 * kpi-server.ts because kpi-server imports "server-only", which blocks
 * unit tests from importing the tone thresholds.
 */

export type KpiFreshnessTone = "green" | "amber" | "red" | "unknown";

export type KpiFreshness = {
  last_rollup_at: string | null;
  minutes_since: number | null;
  tone: KpiFreshnessTone;
};

/**
 * Tone thresholds (E5):
 *   - <90 min      → green (cron runs :05 hourly; one missed run is <2h)
 *   - 90 min–6 h   → amber (one or two missed runs — investigate)
 *   - >6 h         → red   (multiple missed runs — cron likely broken)
 *   - null         → unknown (no rollups ever)
 */
export function toneForMinutes(
  minutesSince: number | null,
): KpiFreshnessTone {
  if (minutesSince == null) return "unknown";
  if (minutesSince < 90) return "green";
  if (minutesSince <= 360) return "amber";
  return "red";
}
