/**
 * Builds the query string for GET /api/m/carers/search from the search page's
 * current inputs. Pure + framework-free so the origin-plumbing (gap 19
 * follow-up) is unit-testable without rendering the client page.
 */

export type SearchOrigin = {
  lat: number;
  lng: number;
} | null;

export function buildCarerSearchParams(args: {
  q: string;
  /** Canonical service id (childcare/elderly_care/...) or null for "all". */
  service: string | null;
  origin: SearchOrigin;
  limit?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  const q = args.q.trim();
  if (q) params.set("q", q);
  if (args.service) params.set("service", args.service);
  // Origin coords drive distance_km on the API; without them the "Nearest"
  // sort silently falls back. Both must be sent together.
  if (args.origin) {
    params.set("originLat", String(args.origin.lat));
    params.set("originLng", String(args.origin.lng));
  }
  params.set("limit", String(args.limit ?? 50));
  return params;
}
