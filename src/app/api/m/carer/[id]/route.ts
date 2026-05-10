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

export type ApiCarerResponse = {
  preview: boolean;
  is_published: boolean;
  profile: ApiCarerProfile;
  photos: ApiCarerPhoto[];
  reviews: ApiCarerReview[];
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

  if (!cgRow) {
    return NextResponse.json(
      { error: "Profile not found or not yet published" },
      { status: 404 },
    );
  }

  const cg = cgRow as unknown as CaregiverRow;
  const isPublished = cg.is_published ?? false;
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

  const profile: ApiCarerProfile = {
    user_id: cg.user_id,
    display_name: cg.display_name,
    full_name: pr.full_name ?? null,
    headline: cg.headline,
    bio: cg.bio,
    photo_url: cg.photo_url,
    avatar_url: pr.avatar_url ?? null,
    city: cg.city,
    region: cg.region,
    country: cg.country,
    postcode: cg.postcode,
    hide_precise_location: cg.hide_precise_location ?? false,
    services: cg.services ?? [],
    care_formats: cg.care_formats ?? [],
    languages: cg.languages ?? [],
    certifications: cg.certifications ?? [],
    tags: cg.tags ?? [],
    hourly_rate_cents: cg.hourly_rate_cents,
    weekly_rate_cents: cg.weekly_rate_cents,
    currency: cg.currency ?? "GBP",
    years_experience: cg.years_experience,
    rating_avg: cg.rating_avg != null ? Number(cg.rating_avg) : null,
    rating_count: cg.rating_count ?? 0,
    has_drivers_license: cg.has_drivers_license ?? false,
    has_own_vehicle: cg.has_own_vehicle ?? false,
    gender: cg.gender,
  };

  const response: ApiCarerResponse = {
    preview: isOwnProfile,
    is_published: isPublished,
    profile,
    photos,
    reviews,
  };

  return NextResponse.json(response);
}
