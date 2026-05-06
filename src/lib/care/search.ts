import { createAdminClient } from "@/lib/supabase/admin";
import type { CaregiverCardData } from "@/components/caregiver-card";
import { isServiceKey } from "@/lib/care/services";
import { isCareFormatKey, type CareFormatKey } from "@/lib/care/formats";
import { isGenderKey, type GenderKey } from "@/lib/care/attributes";

export type CareSearchFilters = {
  service?: string;
  format?: CareFormatKey;
  city?: string;
  country?: "GB" | "US";
  minRate?: number; // in cents
  maxRate?: number; // in cents
  query?: string;
  limit?: number;
  // Booking preference filters (all optional, additive)
  genders?: GenderKey[];
  requireDriver?: boolean;
  requireVehicle?: boolean;
  requiredCertifications?: string[];
  requiredLanguages?: string[];
  tags?: string[];
  // Geo search (optional). When set, restricts to carers within radiusKm of
  // the origin and adds distance_m to each card. Used by /find-care/map and
  // postcode-driven search bars.
  near?: { lat: number; lng: number; radiusKm: number };
};

const UK_REQUIRED = ["enhanced_dbs_barred", "right_to_work", "digital_id"];
const US_REQUIRED = ["us_criminal", "us_healthcare_sanctions"];

/**
 * Find published caregivers matching filters. Public-safe (used by SSR
 * marketing pages without an authenticated session). Uses the admin client
 * because we need to join across multiple tables — but every caregiver
 * surfaced is gated by:
 *   - is_published = true on caregiver_profiles
 *   - charges_enabled and payouts_enabled on caregiver_stripe_accounts
 *   - all required background checks cleared for their country
 */
export async function searchCaregivers(
  filters: CareSearchFilters = {},
): Promise<CaregiverCardData[]> {
  const admin = createAdminClient();

  // Geo pre-filter: when a near origin is provided, ask Postgres for the
  // user_ids within radius and their distance. Empty result short-circuits.
  let nearById: Map<string, number> | null = null;
  if (filters.near) {
    const radiusM = Math.max(
      500,
      Math.min(200_000, filters.near.radiusKm * 1000),
    );
    type Row = { user_id: string; distance_m: number };
    const { data: rows, error: rpcErr } = (await admin.rpc(
      "caregivers_within_radius",
      {
        origin_lng: filters.near.lng,
        origin_lat: filters.near.lat,
        radius_m: radiusM,
      },
    )) as unknown as { data: Row[] | null; error: unknown };
    if (rpcErr || !rows || rows.length === 0) return [];
    nearById = new Map(rows.map((r) => [r.user_id, Number(r.distance_m)]));
  }

  let query = admin
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, headline, bio, city, region, country, services, care_formats, hourly_rate_cents, weekly_rate_cents, currency, years_experience, languages, rating_avg, rating_count, is_published, gender, has_drivers_license, has_own_vehicle, tags, certifications, hide_precise_location",
    )
    .eq("is_published", true);

  // Restrict to the geo-pre-filtered set when applicable.
  if (nearById) {
    query = query.in("user_id", Array.from(nearById.keys()));
  }

  if (filters.country) query = query.eq("country", filters.country);
  if (filters.city) query = query.ilike("city", filters.city);
  if (isServiceKey(filters.service)) {
    query = query.contains("services", [filters.service]);
  }
  if (isCareFormatKey(filters.format)) {
    query = query.contains("care_formats", [filters.format]);
  }
  if (filters.minRate != null)
    query = query.gte("hourly_rate_cents", filters.minRate);
  if (filters.maxRate != null)
    query = query.lte("hourly_rate_cents", filters.maxRate);
  if (filters.query) {
    const q = `%${filters.query.replace(/[%_]/g, "")}%`;
    query = query.or(
      `display_name.ilike.${q},headline.ilike.${q},bio.ilike.${q}`,
    );
  }

  // --- Booking preference filters (additive, optional) ---
  const genders = (filters.genders ?? []).filter(isGenderKey);
  if (genders.length > 0) {
    query = query.in("gender", genders);
  }
  if (filters.requireDriver) {
    query = query.eq("has_drivers_license", true);
  }
  if (filters.requireVehicle) {
    query = query.eq("has_own_vehicle", true);
  }
  // certifications/languages/tags: every requested item must be present
  // on the profile ("contains" = array <@ on Postgres). Gives families
  // a strict-AND filter — fewer false positives.
  const reqCerts = (filters.requiredCertifications ?? []).filter(
    (c) => typeof c === "string" && c.length > 0 && c.length <= 60,
  );
  if (reqCerts.length > 0) {
    query = query.contains("certifications", reqCerts);
  }
  const reqLangs = (filters.requiredLanguages ?? []).filter(
    (l) => typeof l === "string" && l.length > 0 && l.length <= 30,
  );
  if (reqLangs.length > 0) {
    query = query.contains("languages", reqLangs);
  }
  const reqTags = (filters.tags ?? []).filter(
    (t) => typeof t === "string" && t.length > 0 && t.length <= 30,
  );
  if (reqTags.length > 0) {
    query = query.contains("tags", reqTags);
  }

  // When geo searching we'll resort by distance after fetching, so just cap
  // the working set. Otherwise keep the rating/experience ordering.
  if (!nearById) {
    query = query
      .order("rating_avg", { ascending: false, nullsFirst: false })
      .order("years_experience", { ascending: false, nullsFirst: false });
  }
  query = query.limit(filters.limit ?? 100);

  const { data: profiles, error } = await query;
  if (error || !profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.user_id);

  // Stripe payouts gate
  const { data: stripeRows } = await admin
    .from("caregiver_stripe_accounts")
    .select("user_id, charges_enabled, payouts_enabled")
    .in("user_id", ids);
  const payoutOk = new Set(
    (stripeRows ?? [])
      .filter((s) => s.charges_enabled && s.payouts_enabled)
      .map((s) => s.user_id),
  );

  // Background-check gate
  const { data: bgRows } = await admin
    .from("background_checks")
    .select("user_id, check_type, status")
    .in("user_id", ids)
    .eq("status", "cleared");
  const cleared = new Map<string, Set<string>>();
  (bgRows ?? []).forEach((r) => {
    if (!cleared.has(r.user_id)) cleared.set(r.user_id, new Set());
    cleared.get(r.user_id)!.add(r.check_type);
  });

  const filtered = profiles.filter((p) => {
    if (!payoutOk.has(p.user_id)) return false;
    const required = p.country === "US" ? US_REQUIRED : UK_REQUIRED;
    const set = cleared.get(p.user_id);
    if (!set) return false;
    return required.every((t) => set.has(t));
  });

  const cards = filtered.map((p) => {
    const distance_m = nearById ? (nearById.get(p.user_id) ?? null) : null;
    return {
      user_id: p.user_id,
      display_name: p.display_name,
      headline: p.headline,
      bio: p.bio,
      city: p.city,
      region: p.region,
      country: (p.country as "GB" | "US") ?? "GB",
      services: p.services ?? [],
      care_formats: p.care_formats ?? [],
      hourly_rate_cents: p.hourly_rate_cents,
      weekly_rate_cents: p.weekly_rate_cents,
      currency: (p.currency as "GBP" | "USD" | null) ?? null,
      years_experience: p.years_experience,
      languages: p.languages ?? [],
      rating_avg: p.rating_avg ? Number(p.rating_avg) : null,
      rating_count: p.rating_count ?? 0,
      match_score: computeMatch(p, filters, distance_m),
      // Surface filter attributes to cards so we can render badges later.
      gender: (p as { gender?: string | null }).gender ?? null,
      has_drivers_license: !!(p as { has_drivers_license?: boolean }).has_drivers_license,
      has_own_vehicle: !!(p as { has_own_vehicle?: boolean }).has_own_vehicle,
      tags: ((p as { tags?: string[] | null }).tags ?? []) as string[],
      certifications: ((p as { certifications?: string[] | null }).certifications ?? []) as string[],
      distance_m,
      hide_precise_location: !!(p as { hide_precise_location?: boolean }).hide_precise_location,
    };
  });

  // When geo searching, sort by distance ascending (RPC already returns
  // sorted but the .in() rewrite above can scramble the order).
  if (nearById) {
    cards.sort(
      (a, b) =>
        (a.distance_m ?? Number.POSITIVE_INFINITY) -
        (b.distance_m ?? Number.POSITIVE_INFINITY),
    );
  }

  return cards;
}

function computeMatch(
  p: {
    services: string[] | null;
    care_formats?: string[] | null;
    city: string | null;
    country: string | null;
    rating_avg: number | string | null;
    rating_count: number | null;
    years_experience: number | null;
    hourly_rate_cents: number | null;
  },
  f: CareSearchFilters,
  distanceM: number | null = null,
): number {
  let score = 60; // base
  if (f.service && (p.services ?? []).includes(f.service)) score += 18;
  if (f.format && (p.care_formats ?? []).includes(f.format)) score += 10;
  if (f.city && p.city && p.city.toLowerCase() === f.city.toLowerCase())
    score += 8;
  if (f.country && p.country === f.country) score += 4;
  // Soft bonuses
  const r =
    typeof p.rating_avg === "string"
      ? Number(p.rating_avg)
      : (p.rating_avg ?? 0);
  if (r > 0) score += Math.min(8, r * 1.6);
  if ((p.years_experience ?? 0) > 5) score += 4;
  // Price fit
  if (
    f.maxRate != null &&
    p.hourly_rate_cents != null &&
    p.hourly_rate_cents <= f.maxRate
  )
    score += 2;
  // Proximity boost: 0–10km → +12, 10–20km → +6, 20–40km → +2, beyond → 0.
  if (distanceM != null && Number.isFinite(distanceM)) {
    const km = distanceM / 1000;
    if (km <= 10) score += 12;
    else if (km <= 20) score += 6;
    else if (km <= 40) score += 2;
  }
  return Math.min(99, score);
}

/** Lightweight count of cities we have published caregivers in. */
export async function listPublishedCities(country?: "GB" | "US") {
  const admin = createAdminClient();
  let q = admin
    .from("caregiver_profiles")
    .select("city, country, is_published")
    .eq("is_published", true);
  if (country) q = q.eq("country", country);
  const { data } = await q;
  const counts = new Map<string, { country: "GB" | "US"; count: number }>();
  (data ?? []).forEach((r) => {
    if (!r.city) return;
    const key = `${r.country}|${r.city}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else
      counts.set(key, {
        country: r.country as "GB" | "US",
        count: 1,
      });
  });
  return Array.from(counts.entries()).map(([k, v]) => {
    const [, city] = k.split("|");
    return { city, country: v.country, count: v.count };
  });
}
