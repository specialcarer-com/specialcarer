/**
 * Shared match scoring (gap 17 auto-match + gap 19 smart rerank).
 *
 * One weighted-sum scorer used by both surfaces so a carer's "match
 * strength" is consistent whether they're being auto-offered a booking or
 * ranked in search. Pure functions only — no DB, no I/O — so they're
 * trivially unit-testable and safe to import on client or server.
 *
 * Weights (sum to 1.0):
 *
 *   Pre-E3 baseline (commute flag OFF — the default today):
 *     distance        40%  closer is better, linear over the radius
 *     rating          30%  avg rating / 5
 *     response_rate   15%  share of past offers the carer accepted (>70% ideal)
 *     recency         10%  recently active carers float up
 *     completion_rate  5%  share of accepted bookings completed
 *
 *   Commute-aware (commute flag ON — E3, treatment arm of
 *   `commute_scoring_v1` A/B):
 *     distance        20%  crow-flies (kept as a coarse safety net)
 *     commute         25%  driving-time via Mapbox Matrix; London urban
 *                          reality is dominated by traffic + rivers
 *     rating          25%
 *     response_rate   15%
 *     recency         10%
 *     completion_rate  5%
 *
 * The flag lives in src/lib/match/flag.ts. When off, this module is
 * bit-identical to the pre-E3 behaviour (see the guard test in
 * scoring.test.ts).
 */

import { isCommuteScoringEnabled } from "./flag";

// Baseline / control weights — the pre-E3 profile.
const BASELINE_WEIGHTS = {
  distance: 0.4,
  rating: 0.3,
  response_rate: 0.15,
  recency: 0.1,
  completion_rate: 0.05,
  // commute is present as 0 in the baseline so the type stays
  // consistent regardless of the flag. Zero-weight means the commute
  // signal is computed but ignored, matching the pre-E3 output.
  commute: 0,
} as const;

// Commute-aware / treatment weights — the E3 profile.
const COMMUTE_WEIGHTS = {
  distance: 0.2,
  commute: 0.25,
  rating: 0.25,
  response_rate: 0.15,
  recency: 0.1,
  completion_rate: 0.05,
} as const;

/**
 * Public weights. When the E3 commute flag is off (default), these are
 * bit-identical to the pre-E3 shape *for the existing four keys*: the
 * extra `commute` key is a zero-weighted no-op. Consumers that iterate
 * this object (there's just one — the scoring.test.ts sum-to-1 test)
 * still see a total of 1.0.
 *
 * Note this is exported as a plain frozen object rather than a
 * `const`-asserted literal so the flag-driven branch typechecks
 * cleanly.
 */
export const SCORING_WEIGHTS: {
  readonly distance: number;
  readonly commute: number;
  readonly rating: number;
  readonly response_rate: number;
  readonly recency: number;
  readonly completion_rate: number;
} = Object.freeze(
  isCommuteScoringEnabled() ? { ...COMMUTE_WEIGHTS } : { ...BASELINE_WEIGHTS },
);

export type ScoringWeightKey = keyof typeof SCORING_WEIGHTS;

/** Normalised 0..1 signals for one carer relative to a query/booking. */
export type ScoreSignals = {
  /** Distance from the booking/search origin, km. null = unknown. */
  distance_km: number | null;
  /** The radius the scoring is normalised against (km). */
  max_distance_km: number;
  /** Carer average rating, 0..5. null = no ratings yet. */
  rating: number | null;
  /** Past-offer acceptance rate, 0..1. null = no history. */
  response_rate: number | null;
  /** Last active timestamp (ISO) — drives the recency signal. */
  last_active_at: string | null;
  /** Completed / accepted ratio, 0..1. null = no history. */
  completion_rate: number | null;
  /**
   * Driving-time commute from booking origin to the carer's home,
   * in minutes. null = unknown / not looked up (matcher didn't call
   * Mapbox for this candidate, or the call failed). Treated as
   * neutral (0.3) by the signal transform — same convention as
   * distance.
   *
   * Optional so pre-E3 callers (search rerank, tests that predate
   * commute) don't need to change to pass explicit `null`.
   */
  commute_minutes?: number | null;
};

export type ScoreBreakdown = Record<ScoringWeightKey, number>;

export type ScoreResult = {
  /** 0..100 weighted score for display + ordering. */
  score: number;
  /** Per-signal normalised contributions (0..1, pre-weighting). */
  breakdown: ScoreBreakdown;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Recency: full credit within 30 min of activity, decaying linearly to
// zero at 7 days. Mirrors the go-online staleness intuition without being
// a hard cliff.
const RECENCY_FULL_MS = 30 * 60 * 1000;
const RECENCY_ZERO_MS = 7 * 24 * 60 * 60 * 1000;

function recencySignal(lastActiveAt: string | null, now: number): number {
  if (!lastActiveAt) return 0;
  const t = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const age = now - t;
  if (age <= RECENCY_FULL_MS) return 1;
  if (age >= RECENCY_ZERO_MS) return 0;
  return clamp01(1 - (age - RECENCY_FULL_MS) / (RECENCY_ZERO_MS - RECENCY_FULL_MS));
}

function distanceSignal(distanceKm: number | null, maxKm: number): number {
  // Unknown distance is treated as neutral-low (0.3) rather than 0 so a
  // carer with a missing home_point isn't unfairly buried.
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 0.3;
  if (maxKm <= 0) return distanceKm <= 0 ? 1 : 0;
  return clamp01(1 - distanceKm / maxKm);
}

// Commute: full credit at ≤10 min, decaying linearly to 0 at 60 min.
// Null = unknown → neutral 0.3 (same convention as distance). London
// urban reality: under 10 min commute is genuinely great; over an hour
// is a hard sell for a same-day shift.
const COMMUTE_FULL_MIN = 10;
const COMMUTE_ZERO_MIN = 60;

function commuteSignal(commuteMinutes: number | null | undefined): number {
  if (commuteMinutes == null || !Number.isFinite(commuteMinutes)) return 0.3;
  if (commuteMinutes <= COMMUTE_FULL_MIN) return 1;
  if (commuteMinutes >= COMMUTE_ZERO_MIN) return 0;
  return clamp01(
    1 - (commuteMinutes - COMMUTE_FULL_MIN) / (COMMUTE_ZERO_MIN - COMMUTE_FULL_MIN),
  );
}

/**
 * Compute the per-carer normalised signals + final 0..100 score.
 * `now` is injectable so tests are deterministic.
 */
export function scoreCarer(
  signals: ScoreSignals,
  now: number = Date.now(),
): ScoreResult {
  const breakdown: ScoreBreakdown = {
    distance: distanceSignal(signals.distance_km, signals.max_distance_km),
    commute: commuteSignal(signals.commute_minutes ?? null),
    rating: clamp01((signals.rating ?? 0) / 5),
    response_rate: clamp01(signals.response_rate ?? 0),
    recency: recencySignal(signals.last_active_at, now),
    completion_rate: clamp01(signals.completion_rate ?? 0),
  };

  const weighted =
    breakdown.distance * SCORING_WEIGHTS.distance +
    breakdown.commute * SCORING_WEIGHTS.commute +
    breakdown.rating * SCORING_WEIGHTS.rating +
    breakdown.response_rate * SCORING_WEIGHTS.response_rate +
    breakdown.recency * SCORING_WEIGHTS.recency +
    breakdown.completion_rate * SCORING_WEIGHTS.completion_rate;

  return {
    score: Math.round(clamp01(weighted) * 100 * 100) / 100, // 2dp, 0..100
    breakdown,
  };
}
