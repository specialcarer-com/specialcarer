import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CoverageCity } from "@/lib/coverage-types";

export const runtime = "nodejs";
// Cache aggressively at the CDN — the data is editorial and changes
// rarely; 5-minute fresh / 1-day stale-while-revalidate is plenty.
export const revalidate = 300;

/**
 * GET /api/coverage/cities — public list of seeded cities.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coverage_cities")
    .select(
      "id, slug, name, country, region, lat, lng, status, carer_count, avg_response_min, verticals, timezone, launched_at",
    )
    .order("country", { ascending: true })
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { cities: [] as CoverageCity[], error: error.message },
      { status: 500 },
    );
  }

  // Postgres returns numeric columns as strings via PostgREST. Coerce
  // to number here so the client never has to.
  const cities: CoverageCity[] = (data ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    country: row.country as CoverageCity["country"],
    region: (row.region as string | null) ?? null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    status: row.status as CoverageCity["status"],
    carer_count: Number(row.carer_count ?? 0),
    avg_response_min:
      row.avg_response_min == null ? null : Number(row.avg_response_min),
    verticals: (row.verticals ?? []) as CoverageCity["verticals"],
    timezone: (row.timezone as string | null) ?? null,
    launched_at: (row.launched_at as string | null) ?? null,
  }));

  return NextResponse.json(
    { cities },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=86400",
      },
    },
  );
}
