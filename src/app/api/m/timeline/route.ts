import { NextResponse } from "next/server";
import { getTimelineFeed } from "@/lib/timeline/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/timeline?seekerId=...&cursor=...&limit=20
 *
 * Paginated family-timeline feed (gap 41). RLS on timeline_events is the
 * authoritative gate: the caller only ever sees events for families they're
 * the seeker / an active member of, plus booking events for bookings they
 * carer on. A caller with no visible events gets an empty page (not a 403).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const seekerId = url.searchParams.get("seekerId");
  const cursor = url.searchParams.get("cursor");
  const eventId = url.searchParams.get("event");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const result = await getTimelineFeed({
    seekerId,
    cursor,
    eventId,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(result);
}
