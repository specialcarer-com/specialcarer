import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authorizeCarer,
  handleEarnings,
  parsePageSize,
  parsePeriod,
  type EarningsQueryClient,
} from "@/lib/earnings/dashboard-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/earnings?period=this_month&limit=20&cursor=<iso>
 *
 * Carer earnings dashboard V1 (gap 36). Returns headline totals for the
 * selected period, a vs-prior-period delta, an upcoming (not-yet-earned)
 * tile, and a paginated list of recent completed bookings.
 *
 * Auth: signed-in AND a carer. A non-carer (no caregiver_profiles row)
 * is hard-failed with 403 — earnings are carer-only.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Carer guard — presence of a caregiver_profiles row is the platform's
  // canonical "is a carer" signal (see /api/m/me/online-status). Earnings
  // are carer-only: a seeker is hard-failed with 403.
  let hasCarerProfile = false;
  if (user) {
    const { data: carerProfile } = await admin
      .from("caregiver_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle<{ user_id: string }>();
    hasCarerProfile = !!carerProfile;
  }
  const gate = authorizeCarer({ userId: user?.id, hasCarerProfile });
  if (!gate.ok || !user) {
    const status = gate.ok ? 401 : gate.status;
    const error = gate.ok ? "Not authenticated" : gate.error;
    return NextResponse.json({ error }, { status });
  }

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const pageSize = parsePageSize(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");

  const client: EarningsQueryClient = {
    async completedBookings(carerId) {
      const { data, error } = await admin
        .from("bookings")
        .select(
          "id, seeker_id, status, shift_completed_at, service_type, hours, starts_at, ends_at, subtotal_cents, platform_fee_cents, currency",
        )
        .eq("caregiver_id", carerId)
        .in("status", ["completed", "paid_out"])
        .not("shift_completed_at", "is", null)
        .order("shift_completed_at", { ascending: false })
        .limit(2000);
      return { data: (data as never) ?? null, error };
    },
    async upcomingBookings(carerId) {
      const { data, error } = await admin
        .from("bookings")
        .select("status, subtotal_cents, platform_fee_cents")
        .eq("caregiver_id", carerId)
        .in("status", ["accepted", "paid", "in_progress"]);
      return { data: (data as never) ?? null, error };
    },
    async seekerProfiles(ids) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      return { data: (data as never) ?? null, error };
    },
  };

  const result = await handleEarnings({
    carerId: user.id,
    period,
    pageSize,
    cursor,
    client,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}
