/**
 * Pure auto-match ranker (gap 17).
 *
 * Split out from auto-match.ts so it carries NO `server-only` import and can
 * be unit-tested under the node test runner. auto-match.ts re-exports these
 * symbols, so callers keep importing from one place.
 */
import { scoreCarer, type ScoreBreakdown } from "./scoring";

/** A candidate carer with the raw signals needed to score them. */
export type Candidate = {
  carer_id: string;
  distance_km: number | null;
  rating: number | null;
  response_rate: number | null;
  last_active_at: string | null;
  completion_rate: number | null;
  /**
   * Optional commute-time signal (E3). null / undefined = unknown →
   * neutral 0.3 in the scorer. Auto-match populates this only when
   * the E3 commute flag is on AND the current booking's experiment
   * variant is 'treatment'; the search-side rerank leaves it undefined,
   * which is a no-op while the flag is off.
   */
  commute_minutes?: number | null;
};

export type RankedOffer = {
  carer_id: string;
  score: number;
  score_breakdown: ScoreBreakdown;
};

/**
 * Pure ranker: score every candidate and return the top N descending.
 * Ties break by carer_id for deterministic ordering. `now` injectable.
 */
export function rankCandidates(
  candidates: Candidate[],
  maxDistanceKm: number,
  topN: number,
  now: number = Date.now(),
): RankedOffer[] {
  const scored = candidates.map((c) => {
    const { score, breakdown } = scoreCarer(
      {
        distance_km: c.distance_km,
        max_distance_km: maxDistanceKm,
        rating: c.rating,
        response_rate: c.response_rate,
        last_active_at: c.last_active_at,
        completion_rate: c.completion_rate,
        commute_minutes: c.commute_minutes ?? null,
      },
      now,
    );
    return { carer_id: c.carer_id, score, score_breakdown: breakdown };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.carer_id < b.carer_id ? -1 : a.carer_id > b.carer_id ? 1 : 0;
  });

  return scored.slice(0, Math.max(0, topN));
}
