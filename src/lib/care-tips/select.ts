import type { ServiceType } from "@/lib/ai/types";
import type { CareTip, TipAudience } from "./types";

export type SelectArgs = {
  tips: CareTip[];
  audience: "seeker" | "caregiver";
  month: number; // 1-12
  verticals: ServiceType[];
  /** Deterministic seed — typically `${userId}-${weekKey}` so the picks
   *  stay stable for a week then refresh. */
  seed: string;
  /** How many to surface. Default 2. */
  count?: number;
};

/**
 * Filter tips by audience + month + intersecting verticals, then pick
 * `count` of them deterministically from `seed`. Stable for a given seed
 * so the user sees the same tips for the same week.
 */
export function selectTips({
  tips,
  audience,
  month,
  verticals,
  seed,
  count = 2,
}: SelectArgs): CareTip[] {
  const wanted: TipAudience[] = [audience, "both"];
  const verticalsSet = new Set(verticals);

  const candidates = tips
    .filter((t) => wanted.includes(t.audience))
    .filter((t) => t.months.length === 0 || t.months.includes(month))
    .filter((t) => {
      // Empty verticals on a tip = applies to everyone.
      if (t.verticals.length === 0) return true;
      // If the user has no verticals known yet, still allow generic tips
      // and let any vertical pass through — better than showing nothing.
      if (verticalsSet.size === 0) return true;
      return t.verticals.some((v) => verticalsSet.has(v));
    });

  if (candidates.length === 0) return [];

  // Stable ordering — sort by a hash of (seed + id) so rotation feels
  // varied without being random across the same week.
  const ranked = candidates
    .map((t) => ({ tip: t, key: hashStringToInt(`${seed}::${t.id}`) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.tip);

  return ranked.slice(0, count);
}

/** Cheap, deterministic 32-bit hash. djb2 variant. */
function hashStringToInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  // Coerce to unsigned for sort stability across negative roll-over.
  return h >>> 0;
}

/** ISO week-ish key — good enough for "refresh once a week". */
export function weekKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const week = Math.floor((d.getTime() - start) / (7 * 86400 * 1000));
  return `${y}W${week}`;
}
