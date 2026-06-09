/**
 * Smart rerank for carer search (gap 19).
 *
 * Reorders an already-fetched page of carers using the SAME weighted scorer
 * as auto-match (scoring.ts), so "match strength" is consistent across
 * surfaces. Pure + DB-free so it's safe on the client and unit-testable.
 *
 * Online carers float to the top: within the online and offline groups we
 * order by best-match score, then by rating, then by carer id for a stable
 * deterministic sort.
 */
import { scoreCarer } from "./scoring";

export type RerankSort = "best_match" | "rating_desc" | "nearest" | "newest";

/** Minimal carer shape the reranker needs. UI carer types are a superset. */
export type RerankCarer = {
  id: string;
  rating: number | null;
  rating_count: number | null;
  distance_km: number | null;
  is_online: boolean | null;
  last_online_at: string | null;
  created_at: string | null;
};

export type RankedCarer<T extends RerankCarer> = T & {
  /** 0..100 best-match score (only meaningful for sort=best_match display). */
  match_score: number;
};

/**
 * Online carers are "fresh" if they pinged within this window. Mirrors the
 * go-online staleness intuition (gap 18) so a stuck is_online flag doesn't
 * keep a carer pinned to the top forever.
 */
const ONLINE_FRESH_MS = 30 * 60 * 1000;

export function isFreshOnline(
  carer: Pick<RerankCarer, "is_online" | "last_online_at">,
  now: number,
): boolean {
  if (carer.is_online !== true) return false;
  if (!carer.last_online_at) return false;
  const t = new Date(carer.last_online_at).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= ONLINE_FRESH_MS;
}

function bestMatchScore(
  c: RerankCarer,
  maxDistanceKm: number,
  now: number,
): number {
  // Search has no per-carer response/completion history wired in yet, so
  // those signals stay null (neutral). Distance + rating + recency drive the
  // ordering — the dimensions search actually has data for.
  const { score } = scoreCarer(
    {
      distance_km: c.distance_km,
      max_distance_km: maxDistanceKm,
      rating: c.rating,
      response_rate: null,
      last_active_at: c.last_online_at,
      completion_rate: null,
    },
    now,
  );
  return score;
}

/**
 * Rerank a list of carers. `sort` chooses the primary key; for every sort
 * except an explicit non-online one, fresh-online carers still float above
 * offline carers (the headline gap-19 behaviour).
 */
export function rankCarers<T extends RerankCarer>(
  carers: T[],
  opts: {
    sort: RerankSort;
    maxDistanceKm?: number;
    floatOnlineFirst?: boolean;
    now?: number;
  },
): RankedCarer<T>[] {
  const now = opts.now ?? Date.now();
  const maxDistanceKm = opts.maxDistanceKm ?? 20;
  const floatOnline = opts.floatOnlineFirst ?? true;

  const decorated = carers.map((c) => ({
    carer: { ...c, match_score: bestMatchScore(c, maxDistanceKm, now) },
    online: isFreshOnline(c, now),
  }));

  const cmp = (
    a: (typeof decorated)[number],
    b: (typeof decorated)[number],
  ): number => {
    if (floatOnline && a.online !== b.online) return a.online ? -1 : 1;

    switch (opts.sort) {
      case "rating_desc": {
        const ra = a.carer.rating ?? -1;
        const rb = b.carer.rating ?? -1;
        if (rb !== ra) return rb - ra;
        const ca = a.carer.rating_count ?? 0;
        const cb = b.carer.rating_count ?? 0;
        if (cb !== ca) return cb - ca;
        break;
      }
      case "nearest": {
        // Unknown distance sorts last.
        const da = a.carer.distance_km ?? Number.POSITIVE_INFINITY;
        const db = b.carer.distance_km ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        break;
      }
      case "newest": {
        const ta = a.carer.created_at
          ? new Date(a.carer.created_at).getTime()
          : 0;
        const tb = b.carer.created_at
          ? new Date(b.carer.created_at).getTime()
          : 0;
        if (tb !== ta) return tb - ta;
        break;
      }
      case "best_match":
      default: {
        if (b.carer.match_score !== a.carer.match_score) {
          return b.carer.match_score - a.carer.match_score;
        }
        break;
      }
    }

    // Deterministic tiebreaker.
    return a.carer.id < b.carer.id ? -1 : a.carer.id > b.carer.id ? 1 : 0;
  };

  return decorated.sort(cmp).map((d) => d.carer);
}
