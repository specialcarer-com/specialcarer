import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fetchStatsByIds,
  type CaregiverStatsDisplay,
} from "@/lib/care/caregiver-stats";
import { getBlockedIdsForSeeker } from "@/lib/reviews/blocks";
import {
  isValidPostcode,
  normalisePostcode,
  inferCountryFromPostcode,
  type Country,
} from "@/lib/care/postcode";
import { geocodePostcode } from "@/lib/mapbox/server";

export const dynamic = "force-dynamic";

const SERVICE_KEYS = new Set([
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
]);

const ALLOWED_GENDERS = new Set([
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
]);

export type BrowseCarerCard = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  bio: string | null;
  years_experience: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  distance_m: number;
  distance_km: number;
  eta_minutes_estimate: number;
  is_background_checked: boolean;
  languages: string[];
  certifications: string[];
  tags: string[];
  gender: string | null;
  has_drivers_license: boolean;
  has_own_vehicle: boolean;
  /** Composite ranking score 0..1 (higher = better). For UI debugging only;
   *  callers should rely on the array order. */
  score: number;
  /** Track-record stats. has_stats=false until 5 completed bookings. */
  stats: CaregiverStatsDisplay;
};

/**
 * POST /api/browse-carers
 *
 * Mode-2 "Browse & choose" carer discovery for the mobile booking flow.
 * Returns a ranked list of carers using a composite smart-score:
 *
 *     score = 0.40 * distance_score
 *           + 0.30 * rating_score
 *           + 0.15 * experience_score
 *           + 0.10 * verification_score
 *           + 0.05 * recency_score
 *
 * Each component is normalised to [0,1] before weighting. Distance is
 * inverted (closer = better) and capped at 25km. Rating is normalised
 * against 5.0 with a minimum-reviews floor (carers with <3 reviews fall
 * back to neutral 0.6 to avoid penalising new joiners).
 *
 * Filter params are all optional and additive. Anonymous-callable for
 * preview parity with /api/instant-match.
 */
export async function POST(req: Request) {
  type Body = {
    postcode?: string;
    country?: Country;
    service_type?: string;
    starts_at?: string;
    ends_at?: string;
    max_results?: number;
    // Filters (all optional)
    max_distance_km?: number;
    min_rating?: number;
    max_hourly_rate_cents?: number;
    languages?: string[]; // any-of
    certifications?: string[]; // any-of
    genders?: string[]; // any-of (e.g. ["female"])
    requires_drivers_license?: boolean;
    requires_vehicle?: boolean;
    requires_background_check?: boolean;
  };
  const body = (await req.json().catch(() => ({}))) as Body;

  if (!body.postcode || !body.service_type || !body.starts_at || !body.ends_at) {
    return NextResponse.json(
      { error: "postcode, service_type, starts_at, ends_at are required" },
      { status: 400 },
    );
  }
  if (!SERVICE_KEYS.has(body.service_type)) {
    return NextResponse.json({ error: "Invalid service_type" }, { status: 400 });
  }

  const country: Country | null =
    body.country === "GB" || body.country === "US"
      ? body.country
      : inferCountryFromPostcode(body.postcode);
  if (!country || !isValidPostcode(body.postcode, country)) {
    return NextResponse.json(
      { error: "Invalid postcode for selected country" },
      { status: 400 },
    );
  }
  const normalised = normalisePostcode(body.postcode, country);
  if (!normalised) {
    return NextResponse.json(
      { error: "Invalid postcode for selected country" },
      { status: 400 },
    );
  }

  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  let geo;
  try {
    geo = await geocodePostcode(normalised, country);
  } catch {
    geo = null;
  }
  if (!geo) {
    return NextResponse.json(
      { error: "Could not resolve postcode location" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Reuse the find_instant_match RPC for the eligibility query (published,
  // available, in radius, has Stripe payouts, no overlapping booking, etc.).
  // We over-fetch (max_results * 4) so the smart-score re-rank has a
  // meaningful pool to sort, then trim to max_results.
  const requested = Math.max(1, Math.min(50, Number(body.max_results) || 20));
  const { data: rpcData, error: rpcErr } = await admin.rpc("find_instant_match", {
    origin_lng: geo.lng,
    origin_lat: geo.lat,
    p_service_type: body.service_type,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_country: country,
    p_max_results: Math.max(requested * 4, 25),
  });
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const rpcRowsRaw =
    (rpcData as Array<{
      user_id: string;
      display_name: string | null;
      city: string | null;
      photo_url: string | null;
      rating_avg: number | null;
      hourly_rate_cents: number | null;
      currency: string | null;
      distance_m: number;
      min_notice_minutes: number;
    }> | null) ?? [];

  // Hide caregivers the seeker has blocked. Anonymous browse callers
  // skip this lookup entirely.
  let blocked = new Set<string>();
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) {
      blocked = await getBlockedIdsForSeeker(admin, user.id);
    }
  } catch {
    /* unauthenticated — skip */
  }
  const rpcRows = blocked.size > 0
    ? rpcRowsRaw.filter((r) => !blocked.has(r.user_id))
    : rpcRowsRaw;

  if (rpcRows.length === 0) {
    return NextResponse.json({
      ok: true,
      origin: { postcode: normalised, country, lat: geo.lat, lng: geo.lng },
      matches: [],
    });
  }

  // Pull richer metadata for these candidates in a single query so we
  // can apply the rest of the filters and compute the smart score. We
  // also fan out a parallel query to background_checks (separate table)
  // to drive the verified-only filter and the verification component of
  // the score.
  const ids = rpcRows.map((r) => r.user_id);
  const [profileRes, bgcRes] = await Promise.all([
    admin
      .from("caregiver_profiles")
      .select(
        "user_id, bio, years_experience, languages, certifications, tags, " +
          "gender, has_drivers_license, has_own_vehicle, rating_count",
      )
      .in("user_id", ids),
    admin
      .from("background_checks")
      .select("user_id, check_type, status")
      .in("user_id", ids)
      .eq("status", "cleared"),
  ]);

  if (profileRes.error) {
    return NextResponse.json(
      { error: profileRes.error.message },
      { status: 500 },
    );
  }

  type ProfileRow = {
    user_id: string;
    bio: string | null;
    years_experience: number | null;
    languages: string[] | null;
    certifications: string[] | null;
    tags: string[] | null;
    gender: string | null;
    has_drivers_license: boolean | null;
    has_own_vehicle: boolean | null;
    rating_count: number | null;
  };
  const profByUser = new Map<string, ProfileRow>();
  for (const p of (profileRes.data ?? []) as unknown as ProfileRow[]) {
    profByUser.set(p.user_id, p);
  }
  const checkedUsers = new Set<string>();
  for (const c of (bgcRes.data ?? []) as unknown as Array<{ user_id: string }>) {
    checkedUsers.add(c.user_id);
  }

  // Apply caller-supplied filters.
  const minRating = clamp(body.min_rating, 0, 5);
  const maxRate = positiveOrNull(body.max_hourly_rate_cents);
  const maxDistanceM = positiveOrNull(body.max_distance_km)
    ? (body.max_distance_km as number) * 1000
    : null;
  const wantLangs = sanitiseStrList(body.languages);
  const wantCerts = sanitiseStrList(body.certifications);
  const wantGenders = sanitiseStrList(body.genders).filter((g) =>
    ALLOWED_GENDERS.has(g),
  );

  // Candidates carry every BrowseCarerCard field except `stats`, which
  // is bulk-fetched after ranking and stitched on by `enriched` below.
  type Candidate = Omit<BrowseCarerCard, "stats"> & {
    _raw: ProfileRow | undefined;
  };
  const candidates: Candidate[] = [];

  for (const row of rpcRows) {
    const prof = profByUser.get(row.user_id);
    const isBgChecked = checkedUsers.has(row.user_id);

    if (maxDistanceM !== null && row.distance_m > maxDistanceM) continue;
    if (minRating !== null && (row.rating_avg ?? 0) < minRating) continue;
    if (maxRate !== null && (row.hourly_rate_cents ?? Infinity) > maxRate)
      continue;
    if (
      wantLangs.length > 0 &&
      !anyOverlap(prof?.languages ?? [], wantLangs)
    )
      continue;
    if (
      wantCerts.length > 0 &&
      !anyOverlap(prof?.certifications ?? [], wantCerts)
    )
      continue;
    if (
      wantGenders.length > 0 &&
      (!prof?.gender || !wantGenders.includes(prof.gender))
    )
      continue;
    if (body.requires_drivers_license && !prof?.has_drivers_license) continue;
    if (body.requires_vehicle && !prof?.has_own_vehicle) continue;
    if (body.requires_background_check && !isBgChecked) continue;

    const distance_km = row.distance_m / 1000;
    const eta_minutes_estimate = Math.max(
      5,
      Math.round((distance_km / 30) * 60) + 5,
    );

    candidates.push({
      user_id: row.user_id,
      display_name: row.display_name,
      city: row.city,
      photo_url: row.photo_url,
      rating_avg: row.rating_avg,
      rating_count: prof?.rating_count ?? null,
      bio: prof?.bio ?? null,
      years_experience: prof?.years_experience ?? null,
      hourly_rate_cents: row.hourly_rate_cents,
      currency: row.currency,
      distance_m: row.distance_m,
      distance_km: Math.round(distance_km * 10) / 10,
      eta_minutes_estimate,
      is_background_checked: isBgChecked,
      languages: prof?.languages ?? [],
      certifications: prof?.certifications ?? [],
      tags: prof?.tags ?? [],
      gender: prof?.gender ?? null,
      has_drivers_license: !!prof?.has_drivers_license,
      has_own_vehicle: !!prof?.has_own_vehicle,
      score: 0,
      _raw: prof,
    });
  }

  // Smart score. Weighted composite normalised to [0, 1]. We don't have
  // a last_active_at column yet; the recency component is collapsed into
  // verification + a small photo-presence bonus instead.
  const DISTANCE_CAP_M = 25_000;
  const RATING_FLOOR = 0.6; // for carers with <3 reviews
  const RATING_MIN_REVIEWS = 3;
  const EXPERIENCE_CAP_YEARS = 10;

  for (const c of candidates) {
    const distance_score = Math.max(
      0,
      1 - Math.min(c.distance_m, DISTANCE_CAP_M) / DISTANCE_CAP_M,
    );

    const reviewCount = c.rating_count ?? 0;
    const ratingNorm = (c.rating_avg ?? 0) / 5;
    const rating_score =
      reviewCount < RATING_MIN_REVIEWS
        ? RATING_FLOOR
        : Math.max(0, Math.min(1, ratingNorm));

    const experience_score = Math.min(
      1,
      (c.years_experience ?? 0) / EXPERIENCE_CAP_YEARS,
    );

    // Verification: background check is the strong signal; bio + photo
    // presence is a weak signal that the profile is filled out.
    const profileCompleteness =
      (c.bio && c.bio.length > 40 ? 0.5 : 0) + (c.photo_url ? 0.5 : 0);
    const verification_score = c.is_background_checked
      ? 1
      : profileCompleteness * 0.6;

    c.score =
      0.4 * distance_score +
      0.3 * rating_score +
      0.2 * experience_score +
      0.1 * verification_score;
  }

  candidates.sort((a, b) => b.score - a.score);
  const trimmed = candidates.slice(0, requested).map(({ _raw, ...rest }) => {
    void _raw;
    return rest;
  });

  // Bulk-fetch trust-signal stats for the carers we're about to return.
  // Uses the same admin client; the caregiver_stats view has anon-read
  // grants but the admin client avoids RLS overhead.
  const statsMap = await fetchStatsByIds(
    admin,
    trimmed.map((c) => c.user_id),
  );
  const enriched = trimmed.map((c) => ({
    ...c,
    stats: statsMap.get(c.user_id) ?? {
      has_stats: false,
      completed_bookings: 0,
      repeat_client_rate_pct: null,
      response_time_minutes: null,
      on_time_rate_pct: null,
    },
  }));

  return NextResponse.json({
    ok: true,
    origin: { postcode: normalised, country, lat: geo.lat, lng: geo.lng },
    // Returned under both keys for backwards-compat: 'matches' for the
    // instant-match-shaped consumers, 'carers' for the browse page.
    matches: enriched,
    carers: enriched,
  });
}

function clamp(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function positiveOrNull(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function sanitiseStrList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter((v) => v.length > 0);
}

function anyOverlap(actual: string[], wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const a = actual.map((s) => s.toLowerCase());
  return wanted.some((w) => a.includes(w));
}
