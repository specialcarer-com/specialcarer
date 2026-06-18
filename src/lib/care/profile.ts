import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceKey } from "@/lib/care/services";
import type { CareFormatKey } from "@/lib/care/formats";
import type { GenderKey } from "@/lib/care/attributes";
import { pickUniqueSlug } from "@/lib/care/slug";

const UK_REQUIRED = ["enhanced_dbs_barred", "right_to_work", "digital_id"];
const US_REQUIRED = ["us_criminal", "us_healthcare_sanctions"];

export type CaregiverProfileFull = {
  user_id: string;
  public_slug: string | null;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  country: "GB" | "US";
  postcode: string | null;
  hide_precise_location: boolean;
  services: string[];
  care_formats: string[];
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  years_experience: number | null;
  languages: string[];
  max_radius_km: number | null;
  photo_url: string | null;
  is_published: boolean;
  rating_avg: number | null;
  rating_count: number;
  // Booking preference attributes (additive)
  gender: GenderKey | null;
  has_drivers_license: boolean;
  has_own_vehicle: boolean;
  tags: string[];
  certifications: string[];
};

export type ProfileReadiness = {
  hasProfile: boolean;
  hasName: boolean;
  hasBio: boolean;
  hasRate: boolean;
  hasService: boolean;
  hasFormat: boolean;
  hasLocation: boolean;
  payoutsEnabled: boolean;
  bgChecksCleared: boolean;
  missingChecks: string[];
  isPublishable: boolean;
  isPublished: boolean;
};

/** Fetch a caregiver profile by user_id (public-readable, used on /caregiver/[id]). */
export async function getCaregiverProfile(
  userId: string,
): Promise<CaregiverProfileFull | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("caregiver_profiles")
    .select(
      "user_id, public_slug, display_name, headline, bio, city, region, country, postcode, hide_precise_location, services, care_formats, hourly_rate_cents, weekly_rate_cents, currency, years_experience, languages, max_radius_km, photo_url, is_published, rating_avg, rating_count, gender, has_drivers_license, has_own_vehicle, tags, certifications",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return mapCaregiverRow(data as unknown as Record<string, unknown>);
}

const PUBLIC_PROFILE_COLUMNS =
  "user_id, public_slug, display_name, headline, bio, city, region, country, postcode, hide_precise_location, services, care_formats, hourly_rate_cents, weekly_rate_cents, currency, years_experience, languages, max_radius_km, photo_url, is_published, rating_avg, rating_count, gender, has_drivers_license, has_own_vehicle, tags, certifications";

/**
 * Fetch a publicly shareable carer profile.
 *
 * Enforces the UK-only region policy: only GB carers are returned, so the
 * unauthenticated /caregiver/[id] and /c/[slug] routes 404 for everyone else.
 * Pass `requirePublished` (default true) to also hide unpublished drafts.
 */
export async function getPublicCaregiverProfile(
  userId: string,
  requirePublished = true,
): Promise<CaregiverProfileFull | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("caregiver_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("user_id", userId)
    .eq("country", "GB")
    .maybeSingle();

  if (!data) return null;
  const profile = mapCaregiverRow(data as unknown as Record<string, unknown>);
  if (requirePublished && !profile.is_published) return null;
  return profile;
}

/** Resolve a public slug to its (GB-only) carer profile. */
export async function getPublicCaregiverProfileBySlug(
  slug: string,
  requirePublished = true,
): Promise<CaregiverProfileFull | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("caregiver_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("public_slug", slug)
    .eq("country", "GB")
    .maybeSingle();

  if (!data) return null;
  const profile = mapCaregiverRow(data as unknown as Record<string, unknown>);
  if (requirePublished && !profile.is_published) return null;
  return profile;
}

function mapCaregiverRow(data: Record<string, unknown>): CaregiverProfileFull {
  const d = data;
  return {
    user_id: d.user_id as string,
    public_slug: (d.public_slug as string | null) ?? null,
    display_name: (d.display_name as string | null) ?? null,
    headline: (d.headline as string | null) ?? null,
    bio: (d.bio as string | null) ?? null,
    city: (d.city as string | null) ?? null,
    region: (d.region as string | null) ?? null,
    country: (d.country as "GB" | "US") ?? "GB",
    postcode: (d.postcode as string | null) ?? null,
    hide_precise_location: d.hide_precise_location === false ? false : true,
    services: (d.services as string[] | null) ?? [],
    care_formats: (d.care_formats as string[] | null) ?? [],
    hourly_rate_cents: (d.hourly_rate_cents as number | null) ?? null,
    weekly_rate_cents: (d.weekly_rate_cents as number | null) ?? null,
    currency: (d.currency as "GBP" | "USD" | null) ?? null,
    years_experience: (d.years_experience as number | null) ?? null,
    languages: (d.languages as string[] | null) ?? [],
    max_radius_km: (d.max_radius_km as number | null) ?? null,
    photo_url: (d.photo_url as string | null) ?? null,
    is_published: !!d.is_published,
    rating_avg: d.rating_avg == null ? null : Number(d.rating_avg),
    rating_count: (d.rating_count as number | null) ?? 0,
    gender: (d.gender as GenderKey | null) ?? null,
    has_drivers_license: !!d.has_drivers_license,
    has_own_vehicle: !!d.has_own_vehicle,
    tags: (d.tags as string[] | null) ?? [],
    certifications: (d.certifications as string[] | null) ?? [],
  };
}

/**
 * Ensure a GB carer has a unique `public_slug`, assigning one if missing.
 *
 * Idempotent: returns the existing slug when already set. Call this when a
 * carer publishes so their /c/<slug> link is ready to share. Non-GB carers
 * (US region not yet launched) get no slug and `null` is returned.
 */
export async function ensurePublicSlug(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("caregiver_profiles")
    .select("public_slug, display_name, country")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row || (row.country as string) !== "GB") return null;
  if (row.public_slug) return row.public_slug as string;

  const { data: existing } = await admin
    .from("caregiver_profiles")
    .select("public_slug")
    .not("public_slug", "is", null);
  const taken = new Set(
    (existing ?? [])
      .map((r) => r.public_slug as string | null)
      .filter((s): s is string => Boolean(s)),
  );

  const slug = pickUniqueSlug(row.display_name as string | null, taken);
  const { error } = await admin
    .from("caregiver_profiles")
    .update({ public_slug: slug })
    .eq("user_id", userId);
  if (error) return null;
  return slug;
}

/** Compute the publish-readiness checklist for a caregiver. */
export async function computeReadiness(userId: string): Promise<ProfileReadiness> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: stripe }, { data: bg }] = await Promise.all([
    admin
      .from("caregiver_profiles")
      .select(
        "display_name, bio, city, country, services, care_formats, hourly_rate_cents, weekly_rate_cents, is_published",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("caregiver_stripe_accounts")
      .select("payouts_enabled, charges_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("background_checks")
      .select("check_type, status")
      .eq("user_id", userId)
      .eq("status", "cleared"),
  ]);

  const country = (profile?.country as "GB" | "US") ?? "GB";
  const required = country === "US" ? US_REQUIRED : UK_REQUIRED;
  const cleared = new Set((bg ?? []).map((r) => r.check_type as string));
  const missingChecks = required.filter((t) => !cleared.has(t));

  const formats = (profile?.care_formats ?? []) as string[];
  const offersVisiting = formats.includes("visiting");
  const offersLiveIn = formats.includes("live_in");

  const hasProfile = !!profile;
  const hasName = !!profile?.display_name;
  const hasBio = !!profile?.bio && profile.bio.length >= 60;
  const hasFormat = formats.length > 0;
  // Rate readiness depends on declared formats: each declared format must
  // have its corresponding rate set.
  const hourlyOk = !offersVisiting || (profile?.hourly_rate_cents != null && profile.hourly_rate_cents > 0);
  const weeklyOk = !offersLiveIn || (profile?.weekly_rate_cents != null && profile.weekly_rate_cents > 0);
  const hasRate = hasFormat && hourlyOk && weeklyOk;
  const hasService = (profile?.services ?? []).length > 0;
  const hasLocation = !!profile?.city;
  const payoutsEnabled = !!stripe?.payouts_enabled;
  const bgChecksCleared = missingChecks.length === 0;

  const isPublishable =
    hasProfile && hasName && hasBio && hasFormat && hasRate && hasService && hasLocation && payoutsEnabled && bgChecksCleared;

  return {
    hasProfile,
    hasName,
    hasBio,
    hasRate,
    hasService,
    hasFormat,
    hasLocation,
    payoutsEnabled,
    bgChecksCleared,
    missingChecks,
    isPublishable,
    isPublished: !!profile?.is_published,
  };
}

export type ProfileUpdateInput = {
  display_name?: string;
  headline?: string;
  bio?: string;
  city?: string;
  region?: string | null;
  country?: "GB" | "US";
  services?: ServiceKey[];
  care_formats?: CareFormatKey[];
  hourly_rate_cents?: number | null;
  weekly_rate_cents?: number | null;
  currency?: "GBP" | "USD";
  years_experience?: number;
  languages?: string[];
  max_radius_km?: number;
  photo_url?: string | null;
  gender?: GenderKey | null;
  has_drivers_license?: boolean;
  has_own_vehicle?: boolean;
  tags?: string[];
  certifications?: string[];
};
