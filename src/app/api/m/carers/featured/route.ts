import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Per-carer summary returned by /api/m/carers/featured.
 * Used by the seeker home professionals strip.
 */
export type ApiFeaturedCarer = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  /** First two services so the card can render two pills with a "& more" hint. */
  services: string[];
  total_services: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  hourly_rate_cents: number | null;
  currency: "GBP" | "USD";
};

export type ApiFeaturedResponse = {
  carers: ApiFeaturedCarer[];
};

/**
 * GET /api/m/carers/featured
 *
 * Returns up to 6 published carers, ordered by rating then activity.
 * Anyone signed in may call it (matches the auth posture of
 * /api/m/carer/[id]). Empty array is a normal response when the pool
 * is empty — the client renders an empty-state.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  type Row = {
    user_id: string;
    display_name: string | null;
    photo_url: string | null;
    city: string | null;
    country: string | null;
    services: string[] | null;
    years_experience: number | null;
    rating_avg: number | null;
    rating_count: number | null;
    hourly_rate_cents: number | null;
    currency: string | null;
    created_at: string | null;
  };

  const { data: rows, error } = await supabase
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, photo_url, city, country, services, years_experience, rating_avg, rating_count, hourly_rate_cents, currency, created_at",
    )
    .eq("is_published", true)
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .order("rating_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (rows ?? []) as Row[];

  // Resolve full_name + avatar_url fallbacks in a single profiles read.
  const ids = list.map((r) => r.user_id);
  let profileById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null }
  >();
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", ids);
    profileById = new Map(
      ((profs ?? []) as {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
    );
  }

  const carers: ApiFeaturedCarer[] = list.map((r) => {
    const services = (r.services ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const cur = (r.currency ?? "GBP").toUpperCase();
    const currency: "GBP" | "USD" = cur === "USD" ? "USD" : "GBP";
    const prof = profileById.get(r.user_id) ?? {
      full_name: null,
      avatar_url: null,
    };
    return {
      user_id: r.user_id,
      display_name: r.display_name,
      full_name: prof.full_name,
      photo_url: r.photo_url,
      avatar_url: prof.avatar_url,
      city: r.city,
      country: r.country,
      services: services.slice(0, 2),
      total_services: services.length,
      years_experience: r.years_experience,
      rating_avg:
        r.rating_avg != null && Number.isFinite(Number(r.rating_avg))
          ? Number(r.rating_avg)
          : null,
      rating_count: Number(r.rating_count ?? 0),
      hourly_rate_cents: r.hourly_rate_cents,
      currency,
    };
  });

  const response: ApiFeaturedResponse = { carers };
  return NextResponse.json(response);
}
