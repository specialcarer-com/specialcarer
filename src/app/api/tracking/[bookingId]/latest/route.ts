import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getLatestPosition,
  getTrackingEligibility,
} from "@/lib/tracking/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ bookingId: string }> };

/** GET /api/tracking/:bookingId/latest → { position, eligibility } */
export async function GET(_req: Request, ctx: RouteParams) {
  const { bookingId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const eligibility = await getTrackingEligibility(bookingId);
  const position = eligibility.eligible
    ? await getLatestPosition(bookingId)
    : null;

  return NextResponse.json({ eligibility, position });
}
