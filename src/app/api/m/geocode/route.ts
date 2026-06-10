import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodePostcode } from "@/lib/mapbox/server";
import type { Country } from "@/lib/care/postcode";
import { handleGeocode } from "./geocode-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/geocode
 *
 * Query params:
 *   postcode   optional UK postcode / US ZIP. When present it's the explicit
 *              search origin; when absent we fall back to the seeker's saved
 *              household-recipient postcode.
 *
 * Returns: { origin: { lat, lng, source, postcode } | null }
 *
 * Powers the "Nearest" sort on the carer search page: the client geocodes an
 * origin once (debounced), then passes originLat/originLng to the search API.
 *
 * Auth: any signed-in user. Saved-postcode lookup is RLS-scoped to the caller.
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
  const inputPostcode = url.searchParams.get("postcode");

  const result = await handleGeocode({
    inputPostcode,
    geocode: (postcode, country: Country | null) =>
      geocodePostcode(postcode, country ?? "GB"),
    getSavedPostcode: async () => {
      const { data } = await supabase
        .from("household_recipients")
        .select("postcode")
        .not("postcode", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.postcode as string | undefined) ?? null;
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}
