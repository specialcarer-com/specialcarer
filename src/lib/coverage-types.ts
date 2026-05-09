/**
 * Shared types for the coverage / city-availability marketing feature.
 * Backed by the public.coverage_cities table.
 */

export type CoverageStatus = "live" | "waitlist" | "coming_soon";

export type CoverageCountry = "UK" | "US";

export type CoverageVertical =
  | "elderly_care"
  | "childcare"
  | "special_needs"
  | "postnatal"
  | "complex_care";

export const COVERAGE_VERTICALS: readonly CoverageVertical[] = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
];

export const COVERAGE_VERTICAL_LABEL: Record<CoverageVertical, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

export type CoverageCity = {
  id: string;
  slug: string;
  name: string;
  country: CoverageCountry;
  region: string | null;
  lat: number;
  lng: number;
  status: CoverageStatus;
  carer_count: number;
  avg_response_min: number | null;
  verticals: CoverageVertical[];
  timezone: string | null;
  launched_at: string | null;
};

export const COVERAGE_STATUS_LABEL: Record<CoverageStatus, string> = {
  live: "Live",
  waitlist: "Waitlist",
  coming_soon: "Coming soon",
};

/** 🇬🇧 / 🇺🇸 — kept in shared lib so SSR + client agree. */
export function flagFor(country: CoverageCountry): string {
  return country === "UK" ? "🇬🇧" : "🇺🇸";
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
}
