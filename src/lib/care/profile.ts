import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceKey } from "@/lib/care/services";

const UK_REQUIRED = ["enhanced_dbs_barred", "right_to_work", "digital_id"];
const US_REQUIRED = ["us_criminal", "us_healthcare_sanctions"];

export type CaregiverProfileFull = {
  user_id: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  region: string | null;
  country: "GB" | "US";
  services: string[];
  hourly_rate_cents: number | null;
  currency: "GBP" | "USD" | null;
  years_experience: number | null;
  languages: string[];
  max_radius_km: number | null;
  photo_url: string | null;
  is_published: boolean;
  rating_avg: number | null;
  rating_count: number;
};

export type ProfileReadiness = {
  hasProfile: boolean;
  hasName: boolean;
  hasBio: boolean;
  hasRate: boolean;
  hasService: boolean;
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
      "user_id, display_name, headline, bio, city, region, country, services, hourly_rate_cents, currency, years_experience, languages, max_radius_km, photo_url, is_published, rating_avg, rating_count",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    user_id: data.user_id,
    display_name: data.display_name,
    headline: data.headline,
    bio: data.bio,
    city: data.city,
    region: data.region,
    country: (data.country as "GB" | "US") ?? "GB",
    services: data.services ?? [],
    hourly_rate_cents: data.hourly_rate_cents,
    currency: (data.currency as "GBP" | "USD" | null) ?? null,
    years_experience: data.years_experience,
    languages: data.languages ?? [],
    max_radius_km: data.max_radius_km,
    photo_url: data.photo_url,
    is_published: !!data.is_published,
    rating_avg: data.rating_avg ? Number(data.rating_avg) : null,
    rating_count: data.rating_count ?? 0,
  };
}

/** Compute the publish-readiness checklist for a caregiver. */
export async function computeReadiness(userId: string): Promise<ProfileReadiness> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: stripe }, { data: bg }] = await Promise.all([
    admin
      .from("caregiver_profiles")
      .select(
        "display_name, bio, city, country, services, hourly_rate_cents, is_published",
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

  const hasProfile = !!profile;
  const hasName = !!profile?.display_name;
  const hasBio = !!profile?.bio && profile.bio.length >= 60;
  const hasRate = profile?.hourly_rate_cents != null && profile.hourly_rate_cents > 0;
  const hasService = (profile?.services ?? []).length > 0;
  const hasLocation = !!profile?.city;
  const payoutsEnabled = !!stripe?.payouts_enabled;
  const bgChecksCleared = missingChecks.length === 0;

  const isPublishable =
    hasProfile && hasName && hasBio && hasRate && hasService && hasLocation && payoutsEnabled && bgChecksCleared;

  return {
    hasProfile,
    hasName,
    hasBio,
    hasRate,
    hasService,
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
  hourly_rate_cents?: number;
  currency?: "GBP" | "USD";
  years_experience?: number;
  languages?: string[];
  max_radius_km?: number;
  photo_url?: string | null;
};
