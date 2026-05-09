import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_MODEL_VERSION,
  SERVICE_TYPE_LABEL,
  type MatchBreakdown,
  type MatchFeatures,
  type MatchScore,
} from "./types";

/**
 * Matching v1 — heuristic ranker + per-caregiver feature aggregator.
 *
 * No ML: scores are a weighted sum of normalised signals computed from
 * the past 180 days of bookings + reviews + caregiver_profiles. The
 * `breakdown` jsonb persisted alongside each score lets us reason about
 * how a number was reached and write the human `reasons[]` UX surface.
 */

const FEATURE_WINDOW_DAYS = 180;
const NO_SHOW_WINDOW_DAYS = 90;
const ON_TIME_THRESHOLD_MIN = 10;

type Booking = {
  id: string;
  caregiver_id: string | null;
  service_type: string | null;
  starts_at: string | null;
  status: string;
  actual_started_at: string | null;
  cancelled_at: string | null;
};

type CaregiverProfile = {
  user_id: string;
  city: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  services: string[] | null;
  created_at: string | null;
};

/**
 * Compute the signal vector for a caregiver. Reads booking + review
 * aggregates from the past 180 days. Pure function of the DB; safe to
 * call from cron and from on-the-fly recomputes.
 */
export async function computeFeaturesForCaregiver(
  caregiverId: string,
): Promise<MatchFeatures> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - FEATURE_WINDOW_DAYS);
  const sinceIso = since.toISOString();

  const noShowSince = new Date();
  noShowSince.setDate(noShowSince.getDate() - NO_SHOW_WINDOW_DAYS);
  const noShowSinceIso = noShowSince.toISOString();

  const [
    { data: profileRow },
    { data: bookings },
    { data: noShowBookings },
  ] = await Promise.all([
    admin
      .from("caregiver_profiles")
      .select("user_id, city, rating_avg, rating_count, services, created_at")
      .eq("user_id", caregiverId)
      .maybeSingle<CaregiverProfile>(),
    admin
      .from("bookings")
      .select(
        "id, caregiver_id, service_type, starts_at, status, actual_started_at, cancelled_at",
      )
      .eq("caregiver_id", caregiverId)
      .gte("starts_at", sinceIso)
      .limit(2000),
    admin
      .from("bookings")
      .select("id, status, cancelled_at, actual_started_at")
      .eq("caregiver_id", caregiverId)
      .eq("status", "cancelled")
      .is("actual_started_at", null)
      .gte("cancelled_at", noShowSinceIso)
      .not("cancelled_at", "is", null)
      .limit(500),
  ]);

  const list = (bookings ?? []) as Booking[];

  // Completion rate.
  const completed = list.filter((b) => b.status === "completed").length;
  // We treat any cancelled-after-acceptance booking as a denominator
  // against completion. Server-side the booking has `cancelled_by` we
  // could read, but `cancelled_by_caregiver` doesn't exist on the
  // bookings table in this codebase. Use `cancelled` as the closest
  // proxy and document this in the build log.
  const cancelled = list.filter((b) => b.status === "cancelled").length;
  const completionDenom = completed + cancelled;
  const completion_rate = completionDenom > 0 ? completed / completionDenom : 0;

  // On-time rate: shifts where actual_started_at is within
  // ON_TIME_THRESHOLD_MIN of the scheduled starts_at.
  let onTimeNum = 0;
  let onTimeDen = 0;
  for (const b of list) {
    if (!b.starts_at || !b.actual_started_at) continue;
    onTimeDen += 1;
    const startMs = new Date(b.starts_at).getTime();
    const actualMs = new Date(b.actual_started_at).getTime();
    if (actualMs - startMs <= ON_TIME_THRESHOLD_MIN * 60_000) {
      onTimeNum += 1;
    }
  }
  const on_time_rate = onTimeDen > 0 ? onTimeNum / onTimeDen : 0;

  // Service mix.
  const service_mix: Record<string, number> = {};
  for (const b of list) {
    if (b.status !== "completed") continue;
    const k = b.service_type ?? "unknown";
    service_mix[k] = (service_mix[k] ?? 0) + 1;
  }

  // Tenure.
  const createdAt = profileRow?.created_at
    ? new Date(profileRow.created_at).getTime()
    : Date.now();
  const tenure_days = Math.max(
    0,
    Math.floor((Date.now() - createdAt) / 86_400_000),
  );

  return {
    completion_rate,
    on_time_rate,
    avg_rating: Number(profileRow?.rating_avg ?? 0),
    review_count: Number(profileRow?.rating_count ?? 0),
    tenure_days,
    no_show_count_90d: noShowBookings?.length ?? 0,
    service_mix,
  };
}

/**
 * Recompute and upsert the feature row for one caregiver.
 */
export async function upsertCaregiverFeatures(
  caregiverId: string,
): Promise<MatchFeatures> {
  const admin = createAdminClient();
  const features = await computeFeaturesForCaregiver(caregiverId);

  const { error } = await admin
    .from("ai_match_features")
    .upsert(
      {
        caregiver_id: caregiverId,
        signals: features,
        computed_at: new Date().toISOString(),
        model_version: AI_MODEL_VERSION,
      },
      { onConflict: "caregiver_id" },
    );
  if (error) {
    console.error("ai_match_features upsert failed", error);
  }
  return features;
}

// ── Ranker ─────────────────────────────────────────────────────────

type RankInput = {
  seekerId: string;
  serviceType: string;
  candidateIds?: string[]; // if omitted, default to top published carers
  limit?: number;
};

const W_RATING = 0.35;
const W_COMPLETION = 0.2;
const W_ON_TIME = 0.15;
const W_SERVICE_MIX = 0.1;
const W_TENURE = 0.1;
const W_LOCATION = 0.1;

/**
 * Rank candidate caregivers for a seeker for a given service_type.
 * Falls back to fresh feature compute if a feature row is missing.
 * Persists results to ai_match_scores.
 */
export async function rankCaregiversForSeeker({
  seekerId,
  serviceType,
  candidateIds,
  limit = 10,
}: RankInput): Promise<MatchScore[]> {
  const admin = createAdminClient();

  // Resolve candidate set.
  let ids = candidateIds && candidateIds.length > 0 ? candidateIds : null;
  if (!ids) {
    const { data: pool } = await admin
      .from("caregiver_profiles")
      .select("user_id")
      .eq("is_published", true)
      .limit(50);
    ids = (pool ?? []).map((r) => r.user_id as string);
  }
  if (ids.length === 0) return [];

  // Prefetch features in one round-trip.
  const [{ data: featRows }, { data: profileRows }] = await Promise.all([
    admin
      .from("ai_match_features")
      .select("caregiver_id, signals")
      .in("caregiver_id", ids),
    admin
      .from("caregiver_profiles")
      .select("user_id, city, rating_avg, rating_count")
      .in("user_id", ids),
  ]);
  const featByCarer = new Map<string, MatchFeatures>(
    ((featRows ?? []) as { caregiver_id: string; signals: MatchFeatures }[]).map(
      (r) => [r.caregiver_id, r.signals],
    ),
  );
  const profileByCarer = new Map<
    string,
    { city: string | null; rating_avg: number | null; rating_count: number | null }
  >(
    ((profileRows ?? []) as CaregiverProfile[]).map((r) => [
      r.user_id,
      {
        city: r.city,
        rating_avg: Number(r.rating_avg ?? 0),
        rating_count: Number(r.rating_count ?? 0),
      },
    ]),
  );

  // Seeker location heuristic: did they book in the carer's city in the
  // last 90 days?
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const { data: recentSeekerBookings } = await admin
    .from("bookings")
    .select("location_city")
    .eq("seeker_id", seekerId)
    .gte("starts_at", since.toISOString())
    .limit(200);
  const seekerCities = new Set(
    ((recentSeekerBookings ?? []) as { location_city: string | null }[])
      .map((r) => (r.location_city ?? "").toLowerCase().trim())
      .filter(Boolean),
  );

  const scored: MatchScore[] = [];
  for (const cid of ids) {
    let feats = featByCarer.get(cid) ?? null;
    if (!feats) {
      // Compute on the fly if missing.
      feats = await computeFeaturesForCaregiver(cid);
      // Persist for next time (best-effort).
      await admin
        .from("ai_match_features")
        .upsert(
          {
            caregiver_id: cid,
            signals: feats,
            computed_at: new Date().toISOString(),
            model_version: AI_MODEL_VERSION,
          },
          { onConflict: "caregiver_id" },
        );
    }
    const prof = profileByCarer.get(cid);

    const ratingNorm = clamp01((feats.avg_rating - 3) / 2);
    const completionNorm = clamp01(feats.completion_rate);
    const onTimeNorm = clamp01(feats.on_time_rate);
    const serviceMixBoost = serviceMixBoostFor(serviceType, feats.service_mix);
    const tenureBoost = clamp01(feats.tenure_days / 365);
    const locationBoost =
      prof?.city && seekerCities.has(prof.city.toLowerCase().trim())
        ? 1
        : 0.5;

    const breakdown: MatchBreakdown = {
      rating: W_RATING * ratingNorm,
      completion: W_COMPLETION * completionNorm,
      on_time: W_ON_TIME * onTimeNorm,
      service_mix: W_SERVICE_MIX * serviceMixBoost,
      tenure: W_TENURE * tenureBoost,
      location: W_LOCATION * locationBoost,
    };
    const score = clamp01(
      breakdown.rating +
        breakdown.completion +
        breakdown.on_time +
        breakdown.service_mix +
        breakdown.tenure +
        breakdown.location,
    );

    const reasons = topReasons(breakdown, {
      avg_rating: feats.avg_rating,
      review_count: feats.review_count,
      on_time_rate: feats.on_time_rate,
      completion_rate: feats.completion_rate,
      tenure_days: feats.tenure_days,
      city: prof?.city ?? null,
      service_type: serviceType,
    });

    scored.push({
      caregiver_id: cid,
      seeker_id: seekerId,
      service_type: serviceType,
      score,
      breakdown,
      reasons,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // Persist to ai_match_scores.
  if (top.length > 0) {
    const rows = top.map((s) => ({
      seeker_id: seekerId,
      caregiver_id: s.caregiver_id,
      service_type: s.service_type,
      score: s.score,
      breakdown: s.breakdown,
      reasons: s.reasons,
      computed_at: new Date().toISOString(),
      model_version: AI_MODEL_VERSION,
    }));
    const { error } = await admin
      .from("ai_match_scores")
      .upsert(rows, {
        onConflict: "seeker_id,caregiver_id,service_type",
      });
    if (error) {
      console.error("ai_match_scores upsert failed", error);
    }
  }
  return top;
}

/**
 * Read cached scores ordered by score desc.
 */
export async function getCachedMatches(
  seekerId: string,
  serviceType: string,
  limit = 10,
): Promise<MatchScore[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_match_scores")
    .select(
      "caregiver_id, seeker_id, service_type, score, breakdown, reasons",
    )
    .eq("seeker_id", seekerId)
    .eq("service_type", serviceType)
    .order("score", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    caregiver_id: r.caregiver_id as string,
    seeker_id: r.seeker_id as string,
    service_type: r.service_type as string,
    score: Number(r.score),
    breakdown: r.breakdown as MatchBreakdown,
    reasons: (r.reasons ?? []) as string[],
  }));
}

// ── Helpers ───────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function serviceMixBoostFor(
  serviceType: string,
  mix: MatchFeatures["service_mix"],
): number {
  const entries = Object.entries(mix).filter(
    ([, v]) => typeof v === "number" && (v as number) > 0,
  ) as [string, number][];
  if (entries.length === 0) return 0;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0][0];
  if (top === serviceType) return 1;
  if (mix[serviceType] && (mix[serviceType] as number) > 0) return 0.5;
  return 0;
}

function topReasons(
  breakdown: MatchBreakdown,
  ctx: {
    avg_rating: number;
    review_count: number;
    on_time_rate: number;
    completion_rate: number;
    tenure_days: number;
    city: string | null;
    service_type: string;
  },
): string[] {
  const items = [
    {
      key: "rating",
      v: breakdown.rating,
      reason:
        ctx.review_count > 0
          ? `${ctx.avg_rating.toFixed(1)}★ average across ${ctx.review_count} reviews`
          : null,
    },
    {
      key: "on_time",
      v: breakdown.on_time,
      reason:
        ctx.on_time_rate > 0
          ? `${Math.round(ctx.on_time_rate * 100)}% on-time arrivals`
          : null,
    },
    {
      key: "completion",
      v: breakdown.completion,
      reason:
        ctx.completion_rate > 0
          ? `${Math.round(ctx.completion_rate * 100)}% completion rate`
          : null,
    },
    {
      key: "service_mix",
      v: breakdown.service_mix,
      reason:
        breakdown.service_mix > 0
          ? `Specialises in ${SERVICE_TYPE_LABEL[ctx.service_type] ?? ctx.service_type}`
          : null,
    },
    {
      key: "tenure",
      v: breakdown.tenure,
      reason:
        ctx.tenure_days >= 90
          ? `${Math.floor(ctx.tenure_days / 30)} months on the platform`
          : null,
    },
    {
      key: "location",
      v: breakdown.location,
      reason: ctx.city ? `Based in ${ctx.city}` : null,
    },
  ];
  items.sort((a, b) => b.v - a.v);
  return items
    .filter((i) => i.reason && i.v > 0)
    .slice(0, 3)
    .map((i) => i.reason as string);
}
