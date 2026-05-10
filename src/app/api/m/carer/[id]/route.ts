import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApiCarerPhoto = {
  id: string;
  url: string;
  sort_order: number;
};

export type ApiCarerReview = {
  id: string;
  reviewer_name: string;
  rating: number;
  body: string;
  created_at: string;
};

export type ApiCarerProfile = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  headline: string | null;
  bio: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postcode: string | null;
  hide_precise_location: boolean;
  services: string[];
  care_formats: string[];
  languages: string[];
  certifications: string[];
  tags: string[];
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: string;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  has_drivers_license: boolean;
  has_own_vehicle: boolean;
  gender: string | null;
};

/**
 * Weekday convention: 0 = Sunday … 6 = Saturday (Postgres EXTRACT(DOW)).
 * This matches the storage convention in `caregiver_availability_slots`
 * and the editor at src/app/m/profile/availability/page.tsx
 * (DAY_TO_WEEKDAY: { Sunday: 0, Monday: 1, ..., Saturday: 6 }).
 */
export type ApiCarerAvailabilitySlot = {
  weekday: number; // 0=Sun..6=Sat
  start_time: string; // "HH:MM:SS"
  end_time: string;
};

export type ApiCarerBlockout = {
  id: string;
  starts_on: string; // "YYYY-MM-DD"
  ends_on: string;
  reason: string | null;
};

export type ApiCarerResponse = {
  preview: boolean;
  is_published: boolean;
  profile: ApiCarerProfile;
  photos: ApiCarerPhoto[];
  reviews: ApiCarerReview[];
  availability: ApiCarerAvailabilitySlot[];
  blockouts: ApiCarerBlockout[];
};

/**
 * GET /api/m/carer/[id]
 * Returns the public carer profile payload.
 * Auth required. Unpublished profiles are only visible to the carer themselves.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Profile not found or not yet published" },
      { status: 404 },
    );
  }

  const supabase = await createClient();

  // Auth check — viewer must be signed in
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch caregiver_profiles row
  type CaregiverRow = {
    user_id: string;
    display_name: string | null;
    headline: string | null;
    bio: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postcode: string | null;
    hide_precise_location: boolean | null;
    services: string[] | null;
    care_formats: string[] | null;
    languages: string[] | null;
    certifications: string[] | null;
    tags: string[] | null;
    hourly_rate_cents: number | null;
    weekly_rate_cents: number | null;
    currency: string | null;
    years_experience: number | null;
    rating_avg: number | null;
    rating_count: number | null;
    has_drivers_license: boolean | null;
    has_own_vehicle: boolean | null;
    gender: string | null;
    photo_url: string | null;
    is_published: boolean | null;
  };

  const { data: cgRow, error: cgErr } = await supabase
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, headline, bio, city, region, country, postcode, " +
        "hide_precise_location, services, care_formats, languages, certifications, tags, " +
        "hourly_rate_cents, weekly_rate_cents, currency, years_experience, " +
        "rating_avg, rating_count, has_drivers_license, has_own_vehicle, gender, " +
        "photo_url, is_published",
    )
    .eq("user_id", id)
    .maybeSingle();

  if (cgErr) {
    return NextResponse.json({ error: cgErr.message }, { status: 500 });
  }

  // Self-heal: when a caregiver previews their own profile and no
  // caregiver_profiles row exists yet (e.g. their sign-up step was
  // interrupted), create a minimal one on the fly. This keeps Preview
  // useful for brand-new carers and avoids a confusing "not found"
  // dead-end. For other viewers we still return 404.
  let cg: CaregiverRow | null = (cgRow as unknown as CaregiverRow) ?? null;
  if (!cg) {
    if (viewer.id !== id) {
      return NextResponse.json(
        { error: "Profile not found or not yet published" },
        { status: 404 },
      );
    }

    // Pull defaults from profiles to seed the new row.
    const { data: seedProfile } = await supabase
      .from("profiles")
      .select("full_name, country")
      .eq("id", id)
      .maybeSingle();
    type SeedProfile = { full_name: string | null; country: string | null };
    const sp = (seedProfile ?? {}) as SeedProfile;
    const seedCountry = (sp.country ?? "GB").toUpperCase();
    const seedCurrency = seedCountry === "US" ? "USD" : "GBP";

    const { data: createdRow, error: createErr } = await supabase
      .from("caregiver_profiles")
      .insert({
        user_id: id,
        display_name: sp.full_name,
        country: seedCountry,
        currency: seedCurrency,
        is_published: false,
      })
      .select(
        "user_id, display_name, headline, bio, city, region, country, postcode, " +
          "hide_precise_location, services, care_formats, languages, certifications, tags, " +
          "hourly_rate_cents, weekly_rate_cents, currency, years_experience, " +
          "rating_avg, rating_count, has_drivers_license, has_own_vehicle, gender, " +
          "photo_url, is_published",
      )
      .single();

    if (createErr || !createdRow) {
      return NextResponse.json(
        {
          error:
            "Could not create your profile draft. Please complete sign-up or contact support.",
        },
        { status: 500 },
      );
    }

    cg = createdRow as unknown as CaregiverRow;
  }
  const cgSafe = cg!;
  const isPublished = cgSafe.is_published ?? false;
  const isOwnProfile = viewer.id === id;

  // Access control: unpublished profiles are only visible to the carer themselves
  if (!isPublished && !isOwnProfile) {
    return NextResponse.json(
      { error: "Profile not found or not yet published" },
      { status: 404 },
    );
  }

  // Fetch profiles row for full_name + avatar_url fallback
  type ProfileRow = {
    full_name: string | null;
    avatar_url: string | null;
  };

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", id)
    .maybeSingle();

  const pr = (profileRow ?? {}) as ProfileRow;

  // Fetch photos from caregiver_photos table
  type PhotoRow = {
    id: string;
    public_url: string | null;
    sort_order: number | null;
  };

  const { data: photoRows } = await supabase
    .from("caregiver_photos")
    .select("id, public_url, sort_order")
    .eq("caregiver_id", id)
    .order("sort_order", { ascending: true });

  const photos: ApiCarerPhoto[] = ((photoRows ?? []) as unknown as PhotoRow[])
    .filter((p) => p.public_url)
    .map((p) => ({
      id: p.id,
      url: p.public_url!,
      sort_order: p.sort_order ?? 0,
    }));

  // Fetch public reviews from the `reviews` table
  // caregiver_reviews table does not exist — use `reviews` table instead
  type ReviewRow = {
    id: string;
    rating: number;
    body: string | null;
    created_at: string;
    reviewer_id: string;
  };

  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("id, rating, body, created_at, reviewer_id")
    .eq("caregiver_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // For each reviewer, try to get their name from profiles
  const reviews: ApiCarerReview[] = [];
  if (reviewRows && reviewRows.length > 0) {
    const typedReviews = reviewRows as unknown as ReviewRow[];
    const reviewerIds = [...new Set(typedReviews.map((r) => r.reviewer_id))];

    const { data: reviewerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", reviewerIds);

    type ReviewerProfile = { id: string; full_name: string | null };
    const reviewerMap = new Map<string, string>();
    for (const rp of (reviewerProfiles ?? []) as unknown as ReviewerProfile[]) {
      reviewerMap.set(rp.id, rp.full_name ?? "Anonymous");
    }

    for (const r of typedReviews) {
      if (r.body) {
        reviews.push({
          id: r.id,
          reviewer_name: reviewerMap.get(r.reviewer_id) ?? "Anonymous",
          rating: r.rating,
          body: r.body,
          created_at: r.created_at,
        });
      }
    }
  }

  // Weekly availability — public-readable per
  // `availability_slots_public_read` policy. Sorted by (weekday, start)
  // so the UI can render in chronological order without a client sort.
  type SlotRow = {
    weekday: number;
    start_time: string;
    end_time: string;
  };
  const { data: slotRows } = await supabase
    .from("caregiver_availability_slots")
    .select("weekday, start_time, end_time")
    .eq("user_id", id)
    .order("weekday")
    .order("start_time");
  const availability: ApiCarerAvailabilitySlot[] = (
    (slotRows ?? []) as unknown as SlotRow[]
  ).map((r) => ({
    weekday: Number(r.weekday),
    start_time: r.start_time,
    end_time: r.end_time,
  }));

  // Future block-outs only — public-readable per `blockouts_public_read`.
  const today = new Date().toISOString().slice(0, 10);
  type BlockoutRow = {
    id: string;
    starts_on: string;
    ends_on: string;
    reason: string | null;
  };
  const { data: blockoutRows } = await supabase
    .from("caregiver_blockouts")
    .select("id, starts_on, ends_on, reason")
    .eq("user_id", id)
    .gte("ends_on", today)
    .order("starts_on")
    .limit(10);
  const blockouts: ApiCarerBlockout[] = (
    (blockoutRows ?? []) as unknown as BlockoutRow[]
  ).map((r) => ({
    id: r.id,
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    reason: r.reason,
  }));

  const profile: ApiCarerProfile = {
    user_id: cgSafe.user_id,
    display_name: cgSafe.display_name,
    full_name: pr.full_name ?? null,
    headline: cgSafe.headline,
    bio: cgSafe.bio,
    photo_url: cgSafe.photo_url,
    avatar_url: pr.avatar_url ?? null,
    city: cgSafe.city,
    region: cgSafe.region,
    country: cgSafe.country,
    postcode: cgSafe.postcode,
    hide_precise_location: cgSafe.hide_precise_location ?? false,
    services: cgSafe.services ?? [],
    care_formats: cgSafe.care_formats ?? [],
    languages: cgSafe.languages ?? [],
    certifications: cgSafe.certifications ?? [],
    tags: cgSafe.tags ?? [],
    hourly_rate_cents: cgSafe.hourly_rate_cents,
    weekly_rate_cents: cgSafe.weekly_rate_cents,
    currency: cgSafe.currency ?? "GBP",
    years_experience: cgSafe.years_experience,
    rating_avg: cgSafe.rating_avg != null ? Number(cgSafe.rating_avg) : null,
    rating_count: cgSafe.rating_count ?? 0,
    has_drivers_license: cgSafe.has_drivers_license ?? false,
    has_own_vehicle: cgSafe.has_own_vehicle ?? false,
    gender: cgSafe.gender,
  };

  const response: ApiCarerResponse = {
    preview: isOwnProfile,
    is_published: isPublished,
    profile,
    photos,
    reviews,
    availability,
    blockouts,
  };

  return NextResponse.json(response);
}
