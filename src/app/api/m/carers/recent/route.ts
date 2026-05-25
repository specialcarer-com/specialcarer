import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleRecentCarers,
  parseLimit,
  type RecentCarersClient,
} from "@/lib/carers/recent-handler";

export const dynamic = "force-dynamic";

export type { ApiRecentCarer, ApiRecentCarersResponse } from "@/lib/carers/recent-handler";

/**
 * GET /api/m/carers/recent
 *
 * Returns the signed-in seeker's most recently engaged carers — distinct
 * caregiver_id from bookings with status in (completed, in_progress,
 * accepted), ordered by max(starts_at) DESC.
 *
 * Query: limit (default 4, max 8).
 *
 * Powers the seeker home "Book again" quick-rebook tiles.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));

  return handleRecentCarers({
    seeker_id: user.id,
    client: supabase as unknown as RecentCarersClient,
    limit,
  });
}
