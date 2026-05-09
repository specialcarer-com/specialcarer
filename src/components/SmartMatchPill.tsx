/**
 * SmartMatchPill — a small "Match X% · {reason}" pill.
 *
 * Two modes:
 *  1. Real: pass `{ score, reason }` (typically from /api/ai/match).
 *  2. Mock: pass `{ caregiver, mode: "mock" }` and we synthesise a
 *     plausible-looking score from rating_avg. Used by mock screens
 *     that don't have a real seekerId yet (e.g. the booking wizard
 *     mock data path).
 */

type CaregiverLike = {
  rating_avg?: number | null;
  rating_count?: number | null;
};

type Props =
  | {
      mode?: "real";
      score: number;
      reason?: string;
      className?: string;
    }
  | {
      mode: "mock";
      caregiver: CaregiverLike;
      className?: string;
    };

function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

export default function SmartMatchPill(props: Props) {
  let score: number;
  let reason: string;

  if (props.mode === "mock") {
    // Mock heuristic: rating_avg is 0..5; map (rating-3)/2 → 0..1, then
    // floor at 0.5 so the pill never reads "0%".
    const avg = Number(props.caregiver.rating_avg ?? 0);
    const ratingNorm = Math.max(0, Math.min(1, (avg - 3) / 2));
    score = Math.max(0.5, ratingNorm);
    const count = Number(props.caregiver.rating_count ?? 0);
    reason = count > 0 ? `${avg.toFixed(1)}★ across ${count} reviews` : "Top-rated carer";
  } else {
    score = Number(props.score ?? 0);
    reason = props.reason ?? "Recommended match";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 px-2.5 py-1 text-[11px] font-semibold ${props.className ?? ""}`}
      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
      aria-label={`Match ${pct(score)} — ${reason}`}
    >
      <span>Match {pct(score)}</span>
      <span aria-hidden className="text-brand-700/40">·</span>
      <span className="font-medium text-brand-700/90 truncate max-w-[16ch]">
        {reason}
      </span>
    </span>
  );
}
