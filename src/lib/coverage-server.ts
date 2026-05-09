import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CoverageCity } from "@/lib/coverage-types";

/**
 * Server-side fetch of all coverage cities. Uses the admin (service-
 * role) client so it works from `generateStaticParams` at build time
 * and inside request scopes alike. Coverage data is public-read, so
 * bypassing RLS is safe.
 */
export async function listCoverageCities(): Promise<CoverageCity[]> {
  // If service-role creds aren't present (e.g. a build environment
  // that doesn't have them wired), don't crash — return an empty list
  // and let consumers degrade gracefully.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }
  const { data, error } = await admin
    .from("coverage_cities")
    .select(
      "id, slug, name, country, region, lat, lng, status, carer_count, avg_response_min, verticals, timezone, launched_at",
    )
    .order("country", { ascending: true })
    .order("status", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
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
}

export async function getCoverageCity(
  slug: string,
): Promise<CoverageCity | null> {
  const all = await listCoverageCities();
  return all.find((c) => c.slug === slug) ?? null;
}
