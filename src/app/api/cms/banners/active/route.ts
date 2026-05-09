import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cms/banners/active?placement=home_top
 *
 * Returns active banners matching the placement. Filters by the time
 * window if `starts_at` / `ends_at` are set.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const placement = url.searchParams.get("placement") ?? "home_top";
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("cms_banners")
    .select(
      "id, key, title, body, cta_label, cta_href, audience, placement, starts_at, ends_at, active, dismissible",
    )
    .eq("placement", placement)
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("updated_at", { ascending: false });

  return NextResponse.json(
    { banners: data ?? [] },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
