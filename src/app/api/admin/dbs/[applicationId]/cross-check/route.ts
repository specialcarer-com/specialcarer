/**
 * POST /api/admin/dbs/[applicationId]/cross-check
 *
 * Re-run the Veriff cross-check for the application's carer, using the DBS
 * identity currently on the application row (certificate surname falls back to
 * the carer's profile name). Admin-only; gated by NEXT_PUBLIC_DBS_ENABLED.
 */

import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { US_REGION_ENABLED } from "@/lib/region";
import { crossCheckDbsAgainstVeriff } from "@/lib/dbs/cross-check";
import { isDbsEnabled } from "@/lib/dbs/flag";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!isDbsEnabled()) {
    return NextResponse.json({ error: "DBS feature is disabled" }, { status: 403 });
  }

  const { applicationId } = await params;
  const admin = createAdminClient();

  // UK-only regional constraint until the US launch (see @/lib/region) —
  // restrict to GB carers via an inner join on caregiver_profiles.country.
  let appQuery = admin
    .from("dbs_applications")
    .select("carer_id, caregiver_profiles!inner(country)")
    .eq("id", applicationId);
  if (!US_REGION_ENABLED) {
    appQuery = appQuery.eq("caregiver_profiles.country", "GB");
  }
  const { data: app, error: appError } =
    await appQuery.maybeSingle<{ carer_id: string }>();
  if (appError) {
    return NextResponse.json(
      { error: "Failed to load application" },
      { status: 500 },
    );
  }
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // DBS-side facts: carer profile full name (surname) + date of birth.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("full_name, date_of_birth")
    .eq("id", app.carer_id)
    .maybeSingle<{ full_name: string | null; date_of_birth: string | null }>();
  if (profileError) {
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 },
    );
  }

  const surname = (profile?.full_name ?? "").trim().split(/\s+/).pop() ?? "";

  try {
    const result = await crossCheckDbsAgainstVeriff(app.carer_id, {
      surname,
      dateOfBirth: profile?.date_of_birth ?? "",
    });
    await logAdminAction({
      admin: guard.admin,
      action: "dbs.cross_check_rerun",
      targetType: "dbs_application",
      targetId: applicationId,
      details: { ok: result.ok, mismatches: result.mismatches },
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error(
      "[/api/admin/dbs/cross-check] re-run failed",
      e instanceof Error ? { name: e.name, message: e.message } : e,
    );
    return NextResponse.json({ error: "Cross-check failed" }, { status: 400 });
  }
}
