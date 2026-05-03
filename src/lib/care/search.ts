import { createAdminClient } from "@/lib/supabase/admin";
import type { CaregiverCardData } from "@/components/caregiver-card";
import { isServiceKey } from "@/lib/care/services";

export type CareSearchFilters = {
  service?: string;
  city?: string;
  country?: "GB" | "US";
  minRate?: number; // in cents
  maxRate?: number; // in cents
  query?: string;
  limit?: number;
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

  let query = admin
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, headline, bio, city, region, country, services, hourly_rate_cents, currency, years_experience, languages, rating_avg, rating_count, is_published",
    )
    .eq("is_published", true);

  if (filters.country) query = query.eq("country", filters.country);
  if (filters.city) query = query.ilike("city", filters.city);
  if (isServiceKey(filters.service)) {
    query = query.contains("services", [filters.service]);
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

  query = query
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("years_experience", { ascending: false, nullsFirst: false })
    .limit(filters.limit ?? 100);

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

  return filtered.map((p) => ({
    user_id: p.user_id,
    display_name: p.display_name,
    headline: p.headline,
    bio: p.bio,
    city: p.city,
    region: p.region,
    country: (p.country as "GB" | "US") ?? "GB",
    services: p.services ?? [],
    hourly_rate_cents: p.hourly_rate_cents,
    currency: (p.currency as "GBP" | "USD" | null) ?? null,
    years_experience: p.years_experience,
    languages: p.languages ?? [],
    rating_avg: p.rating_avg ? Number(p.rating_avg) : null,
    rating_count: p.rating_count ?? 0,
    match_score: computeMatch(p, filters),
  }));
}

function computeMatch(
  p: {
    services: string[] | null;
    city: string | null;
    country: string | null;
    rating_avg: number | string | null;
    rating_count: number | null;
    years_experience: number | null;
    hourly_rate_cents: number | null;
  },
  f: CareSearchFilters,
): number {
  let score = 60; // base
  if (f.service && (p.services ?? []).includes(f.service)) score += 18;
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
