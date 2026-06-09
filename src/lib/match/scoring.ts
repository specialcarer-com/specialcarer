/**
 * Shared match scoring (gap 17 auto-match + gap 19 smart rerank).
 *
 * One weighted-sum scorer used by both surfaces so a carer's "match
 * strength" is consistent whether they're being auto-offered a booking or
 * ranked in search. Pure functions only — no DB, no I/O — so they're
 * trivially unit-testable and safe to import on client or server.
 *
 * Weights (sum to 1.0):
 *   distance        40%  closer is better, linear over the radius
 *   rating          30%  avg rating / 5
 *   response_rate   15%  share of past offers the carer accepted (>70% ideal)
 *   recency         10%  recently active carers float up
 *   completion_rate  5%  share of accepted bookings completed
 */

export const SCORING_WEIGHTS = {
  distance: 0.4,
  rating: 0.3,
  response_rate: 0.15,
  recency: 0.1,
  completion_rate: 0.05,
} as const;

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
    rating: clamp01((signals.rating ?? 0) / 5),
    response_rate: clamp01(signals.response_rate ?? 0),
    recency: recencySignal(signals.last_active_at, now),
    completion_rate: clamp01(signals.completion_rate ?? 0),
  };

  const weighted =
    breakdown.distance * SCORING_WEIGHTS.distance +
    breakdown.rating * SCORING_WEIGHTS.rating +
    breakdown.response_rate * SCORING_WEIGHTS.response_rate +
    breakdown.recency * SCORING_WEIGHTS.recency +
    breakdown.completion_rate * SCORING_WEIGHTS.completion_rate;

  return {
    score: Math.round(clamp01(weighted) * 100 * 100) / 100, // 2dp, 0..100
    breakdown,
  };
}
