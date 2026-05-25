import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleSearch,
  type SearchQueryClient,
  type SearchQueryParams,
} from "./search-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/carers/search
 *
 * Query params (all optional):
 *   q                   free text against display_name / headline
 *   service             childcare | elderly_care | special_needs | postnatal | complex_care
 *   city                case-insensitive city match
 *   min_price_cents     hourly rate floor (inclusive)
 *   max_price_cents     hourly rate ceiling (inclusive)
 *   min_rating          0..5
 *   sort                rating_desc (default) | price_asc | price_desc | recent
 *   limit               1..50, default 20
 *   offset              >=0, default 0
 *
 * Auth: any signed-in user. The Supabase user-scoped client is passed
 * through so RLS enforces row visibility (in addition to is_published).
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const params: SearchQueryParams = {
    q: url.searchParams.get("q"),
    service: url.searchParams.get("service"),
    city: url.searchParams.get("city"),
    min_price_cents: url.searchParams.get("min_price_cents"),
    max_price_cents: url.searchParams.get("max_price_cents"),
    min_rating: url.searchParams.get("min_rating"),
    sort: url.searchParams.get("sort"),
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  };

  const result = await handleSearch({
    client: supabase as unknown as SearchQueryClient,
    params,
  });
  return NextResponse.json(result.body, { status: result.status });
}
