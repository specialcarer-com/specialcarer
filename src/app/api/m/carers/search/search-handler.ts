/**
 * Pure handler for /api/m/carers/search.
 *
 * Split out from the route file so unit tests can drive the logic with a
 * stubbed Supabase client (matches the convention used by
 * src/lib/push/register-handler.ts).
 *
 * Filters supported:
 *  - q              : free-text against display_name / headline (ILIKE)
 *  - service        : canonical vertical key (childcare, elderly_care,
 *                     special_needs, postnatal, complex_care)
 *  - city           : case-insensitive city match
 *  - min_price_cents / max_price_cents : hourly rate band (inclusive)
 *  - min_rating     : minimum rating_avg
 *  - sort           : rating_desc (default) | price_asc | price_desc | recent
 *  - limit          : 1..50, default 20
 *  - offset         : >=0, default 0
 *
 * Auth is enforced upstream in the route file. The handler trusts the
 * caller-provided client (which is the user-scoped Supabase client when
 * called from the route — so RLS gates which rows are visible).
 */

export type SearchRow = {
  user_id: string;
  display_name: string | null;
  headline: string | null;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  services: string[] | null;
  languages: string[] | null;
  certifications: string[] | null;
  tags: string[] | null;
  care_formats: string[] | null;
  gender: string | null;
  has_drivers_license: boolean | null;
  has_own_vehicle: boolean | null;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: string | null;
  created_at: string | null;
  is_online?: boolean | null;
  last_online_at?: string | null;
};

export type ApiSearchCarer = {
  user_id: string;
  display_name: string | null;
  headline: string | null;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  services: string[];
  languages: string[];
  certifications: string[];
  tags: string[];
  care_formats: string[];
  gender: string | null;
  has_drivers_license: boolean;
  has_own_vehicle: boolean;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: "GBP" | "USD";
  is_online: boolean;
  last_online_at: string | null;
};

export type ApiSearchResponse = {
  carers: ApiSearchCarer[];
  total: number;
  limit: number;
  offset: number;
};

export const CANONICAL_SERVICES = [
  "childcare",
  "elderly_care",
  "special_needs",
  "postnatal",
  "complex_care",
] as const;
export type CanonicalService = (typeof CANONICAL_SERVICES)[number];

const SORTS = ["rating_desc", "price_asc", "price_desc", "recent"] as const;
export type Sort = (typeof SORTS)[number];

export type SearchQueryParams = {
  q?: string | null;
  service?: string | null;
  city?: string | null;
  min_price_cents?: string | null;
  max_price_cents?: string | null;
  min_rating?: string | null;
  sort?: string | null;
  limit?: string | null;
  offset?: string | null;
};

export type ParsedSearchParams = {
  q: string | null;
  service: CanonicalService | null;
  city: string | null;
  min_price_cents: number | null;
  max_price_cents: number | null;
  min_rating: number | null;
  sort: Sort;
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseIntInRange(
  raw: string | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function parseFloatNonNeg(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function isCanonicalService(v: string): v is CanonicalService {
  return (CANONICAL_SERVICES as readonly string[]).includes(v);
}

function isSort(v: string): v is Sort {
  return (SORTS as readonly string[]).includes(v);
}

export function parseSearchParams(raw: SearchQueryParams): ParsedSearchParams {
  const q = raw.q && raw.q.trim().length > 0 ? raw.q.trim() : null;
  const serviceRaw = raw.service?.trim() ?? "";
  const service =
    serviceRaw && isCanonicalService(serviceRaw) ? serviceRaw : null;
  const city = raw.city && raw.city.trim().length > 0 ? raw.city.trim() : null;
  const min_price_cents = parseFloatNonNeg(raw.min_price_cents);
  const max_price_cents = parseFloatNonNeg(raw.max_price_cents);
  const minRatingParsed = parseFloatNonNeg(raw.min_rating);
  const min_rating =
    minRatingParsed == null ? null : Math.min(5, minRatingParsed);
  const sortRaw = raw.sort?.trim() ?? "";
  const sort: Sort = sortRaw && isSort(sortRaw) ? sortRaw : "rating_desc";
  const limit = parseIntInRange(raw.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);
  const offset = parseIntInRange(raw.offset, 0, 10000, 0);
  return {
    q,
    service,
    city,
    min_price_cents:
      min_price_cents == null ? null : Math.floor(min_price_cents),
    max_price_cents:
      max_price_cents == null ? null : Math.floor(max_price_cents),
    min_rating,
    sort,
    limit,
    offset,
  };
}

/**
 * Minimal shape of the Supabase query builder we touch. Mirrors the
 * surface used inside handleSearch so unit tests can stub it without
 * dragging in @supabase/supabase-js.
 */
export type SearchQueryClient = {
  from(table: "caregiver_profiles"): SearchSelectBuilder;
};

export type SearchSelectBuilder = {
  select(
    cols: string,
    opts?: { count?: "exact"; head?: boolean },
  ): SearchFilterBuilder;
};

export type SearchFilterBuilder = {
  eq(col: string, value: unknown): SearchFilterBuilder;
  ilike(col: string, value: string): SearchFilterBuilder;
  contains(col: string, value: unknown[]): SearchFilterBuilder;
  gte(col: string, value: unknown): SearchFilterBuilder;
  lte(col: string, value: unknown): SearchFilterBuilder;
  or(filter: string): SearchFilterBuilder;
  order(
    col: string,
    opts: { ascending: boolean; nullsFirst?: boolean },
  ): SearchFilterBuilder;
  range(
    from: number,
    to: number,
  ): Promise<{
    data: SearchRow[] | null;
    error: { message: string } | null;
    count: number | null;
  }>;
};

function normaliseCurrency(c: string | null): "GBP" | "USD" {
  const up = (c ?? "GBP").toUpperCase();
  return up === "USD" ? "USD" : "GBP";
}

function toCarer(r: SearchRow): ApiSearchCarer {
  return {
    user_id: r.user_id,
    display_name: r.display_name,
    headline: r.headline,
    photo_url: r.photo_url,
    city: r.city,
    country: r.country,
    services: (r.services ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    ),
    languages: (r.languages ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    ),
    certifications: (r.certifications ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    ),
    tags: (r.tags ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    ),
    care_formats: (r.care_formats ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    ),
    gender: r.gender,
    has_drivers_license: r.has_drivers_license === true,
    has_own_vehicle: r.has_own_vehicle === true,
    years_experience: r.years_experience,
    rating_avg:
      r.rating_avg != null && Number.isFinite(Number(r.rating_avg))
        ? Number(r.rating_avg)
        : null,
    rating_count: Number(r.rating_count ?? 0),
    hourly_rate_cents: r.hourly_rate_cents,
    weekly_rate_cents: r.weekly_rate_cents,
    currency: normaliseCurrency(r.currency),
    is_online: r.is_online === true,
    last_online_at: r.last_online_at ?? null,
  };
}

const BASE_COLS =
  "user_id, display_name, headline, photo_url, city, country, services, languages, certifications, tags, care_formats, gender, has_drivers_license, has_own_vehicle, years_experience, rating_avg, rating_count, hourly_rate_cents, weekly_rate_cents, currency, created_at";
// Presence columns come from the gap-18 go-online migration. If that
// migration hasn't run yet, selecting them errors; we detect that and retry
// with BASE_COLS so search keeps working (carers just render as offline).
const PRESENCE_COLS = "is_online, last_online_at";
const SELECT_COLS = `${BASE_COLS}, ${PRESENCE_COLS}`;

/** Returns true when a Postgres error looks like an unknown-column error. */
function isMissingColumnError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("is_online") ||
    m.includes("last_online_at") ||
    m.includes("column") ||
    m.includes("does not exist")
  );
}

function runQuery(
  client: SearchQueryClient,
  cols: string,
  p: ParsedSearchParams,
) {
  let q = client
    .from("caregiver_profiles")
    .select(cols, { count: "exact" })
    .eq("is_published", true);

  if (p.service) q = q.contains("services", [p.service]);
  if (p.city) q = q.ilike("city", p.city);
  if (p.min_price_cents != null)
    q = q.gte("hourly_rate_cents", p.min_price_cents);
  if (p.max_price_cents != null)
    q = q.lte("hourly_rate_cents", p.max_price_cents);
  if (p.min_rating != null) q = q.gte("rating_avg", p.min_rating);
  if (p.q) {
    // Escape % and , so user input cannot break the .or() filter syntax.
    const safe = p.q.replace(/[%,()]/g, " ").trim();
    if (safe.length > 0) {
      const needle = `%${safe}%`;
      q = q.or(`display_name.ilike.${needle},headline.ilike.${needle}`);
    }
  }

  switch (p.sort) {
    case "price_asc":
      q = q.order("hourly_rate_cents", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      q = q.order("hourly_rate_cents", { ascending: false, nullsFirst: false });
      break;
    case "recent":
      q = q.order("created_at", { ascending: false, nullsFirst: false });
      break;
    case "rating_desc":
    default:
      q = q
        .order("rating_avg", { ascending: false, nullsFirst: false })
        .order("rating_count", { ascending: false });
      break;
  }
  // Stable tiebreaker so paging is deterministic.
  q = q.order("user_id", { ascending: true });

  const from = p.offset;
  const to = p.offset + p.limit - 1;
  return q.range(from, to);
}

export async function handleSearch(args: {
  client: SearchQueryClient;
  params: SearchQueryParams;
}): Promise<
  | { status: 200; body: ApiSearchResponse }
  | { status: 500; body: { error: string } }
> {
  const { client, params } = args;
  const p = parseSearchParams(params);

  let { data, error, count } = await runQuery(client, SELECT_COLS, p);
  if (error && isMissingColumnError(error.message)) {
    ({ data, error, count } = await runQuery(client, BASE_COLS, p));
  }
  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  const carers = (data ?? []).map(toCarer);
  return {
    status: 200,
    body: {
      carers,
      total: count ?? carers.length,
      limit: p.limit,
      offset: p.offset,
    },
  };
}
