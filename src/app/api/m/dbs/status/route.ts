/**
 * GET /api/m/dbs/status
 *
 * Returns the calling carer's DBS applications + overall roll-up. Used by the
 * carer-facing /m/dbs screen and the home banner. Gated by
 * NEXT_PUBLIC_DBS_ENABLED (403 when off).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDbsEnabled } from "@/lib/dbs/flag";
import { getCarerDbsApplications } from "@/lib/dbs/service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbsEnabled()) {
    return NextResponse.json({ error: "DBS feature is disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const applications = await getCarerDbsApplications(user.id);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("caregiver_profiles")
    .select("dbs_overall_status, dbs_search_eligible")
    .eq("user_id", user.id)
    .maybeSingle();

  const collected = applications.reduce(
    (sum, a) => sum + (a.recovery_collected_pence ?? 0),
    0,
  );

  return NextResponse.json({
    overall_status: profile?.dbs_overall_status ?? "not_started",
    search_eligible: Boolean(profile?.dbs_search_eligible),
    recovery_collected_pence: Math.min(collected, 6000),
    recovery_target_pence: 6000,
    applications,
  });
}
