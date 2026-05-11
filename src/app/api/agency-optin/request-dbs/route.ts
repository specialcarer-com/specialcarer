import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUkCarer } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency-optin/request-dbs
 *
 * Triggers a fresh Enhanced DBS check via uCheck only when the existing
 * DBS is insufficient. We delegate to the existing background-checks
 * pipeline (POST /api/background-checks/start) by returning a marker
 * that tells the client to redirect; alternatively we could call into
 * the uchecks server library directly. For Phase 2 the redirect approach
 * keeps the existing flow untouched.
 *
 * Idempotent: returns {ok:true, action:'none'} if an existing DBS is
 * already cleared and within 12 months.
 */
export async function POST() {
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
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle<{ role: string; country: string | null }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUkCarer(profile.country)) {
    return NextResponse.json(
      { error: "Agency opt-in is available in UK only for now" },
      { status: 400 },
    );
  }

  // Look up existing Enhanced DBS.
  const { data: existing } = await admin
    .from("background_checks")
    .select("status, issued_at, check_type")
    .eq("user_id", user.id)
    .eq("check_type", "enhanced_dbs_barred")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      status: string;
      issued_at: string | null;
      check_type: string;
    }>();

  const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const stillValid =
    !!existing &&
    existing.status === "cleared" &&
    existing.issued_at !== null &&
    new Date(existing.issued_at).getTime() > twelveMonthsAgo;

  if (stillValid) {
    return NextResponse.json({ ok: true, action: "none" });
  }

  // Defer to the existing background-checks start route. We tell the
  // client to redirect rather than re-implement the uchecks flow.
  return NextResponse.json({
    ok: true,
    action: "redirect",
    redirect_to: "/dashboard/verification",
  });
}
