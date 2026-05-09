import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTrackingEligibility } from "@/lib/tracking/server";
import { fetchAndCacheETA } from "@/lib/tracking/eta";

export const dynamic = "force-dynamic";

/**
 * GET /api/tracking/[bookingId]/eta
 *
 * Returns the cached ETA (or a freshly-computed one if the cache is
 * older than 60 s) for the carer's drive to the booking address.
 *
 *   { eta_seconds: number | null, eta_calculated_at: string | null, fresh: boolean }
 *
 * Eligibility piggy-backs on the tracker's existing rules: anyone who
 * can see the live position can see the ETA.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const eligibility = await getTrackingEligibility(bookingId);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.reason ?? "Not eligible" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const result = await fetchAndCacheETA(admin, bookingId);
  return NextResponse.json({
    eta_seconds: result.eta_seconds,
    eta_calculated_at: result.eta_calculated_at,
    fresh: result.refreshed,
  });
}
