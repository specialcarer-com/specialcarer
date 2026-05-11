import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGatesForUser, isUkCarer } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agency-optin/status
 *
 * Returns the calling carer's 4-gate status from v_agency_opt_in_gates,
 * plus a UK eligibility flag for the UI.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country, full_name, agency_opt_in_status")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      country: string | null;
      full_name: string | null;
      agency_opt_in_status: string;
    }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uk_eligible = isUkCarer(profile.country);
  const gates = await getGatesForUser(admin, user.id);

  return NextResponse.json({
    uk_eligible,
    country: profile.country ?? null,
    status: profile.agency_opt_in_status,
    gates: gates ?? null,
  });
}
