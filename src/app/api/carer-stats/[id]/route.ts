import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchStatsForId } from "@/lib/care/caregiver-stats";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/carer-stats/[id]
 * Returns the public-facing CaregiverStatsDisplay shape for a single
 * caregiver. Anon-callable: the underlying caregiver_stats view holds
 * only aggregate counts derived from public booking activity, and the
 * helper hides anything below MIN_BOOKINGS_FOR_STATS.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const supabase = await createClient();
  const stats = await fetchStatsForId(supabase, id);
  return NextResponse.json({ stats });
}
