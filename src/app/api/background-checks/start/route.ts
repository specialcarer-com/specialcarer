import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createApplicant,
  startCheck,
  UCHECK_COST_CENTS_GBP,
  UCHECK_REQUIRED_TYPES,
  type UCheckCheckType,
} from "@/lib/uchecks/server";

export const runtime = "nodejs";

/**
 * POST /api/background-checks/start
 *
 * Caregiver-initiated. Creates (or reuses) a uCheck applicant and starts every
 * required check that isn't already in flight. Returns the hosted invite URL
 * so the caregiver can complete ID + DBS in one journey.
 *
 * Platform absorbs the fee; a vendor_costs row is written per check ordered.
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

  // Ensure caller is a caregiver
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, country")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json(
      { error: "Only caregivers can start background checks" },
      { status: 403 }
    );
  }
  if (profile.country && profile.country !== "GB") {
    return NextResponse.json(
      { error: "uCheck supports UK caregivers only — US uses Checkr (coming soon)" },
      { status: 400 }
    );
  }

  // Split full name into first/last (uCheck requires both)
  const fullName = (profile.full_name || "").trim();
  const parts = fullName.split(/\s+/);
  const first_name = parts[0] || "Caregiver";
  const last_name = parts.slice(1).join(" ") || "User";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://specialcarer.com";

  // Reuse an existing applicant if any check row already has one
  const { data: existing } = await admin
    .from("background_checks")
    .select("vendor_applicant_id, invite_url, check_type, status")
    .eq("user_id", user.id)
    .eq("vendor", "uchecks");

  let vendor_applicant_id =
    existing?.find((r) => r.vendor_applicant_id)?.vendor_applicant_id ?? null;
  let invite_url =
    existing?.find((r) => r.invite_url)?.invite_url ?? null;

  if (!vendor_applicant_id) {
    const created = await createApplicant({
      user_id: user.id,
      email: user.email || "",
      first_name,
      last_name,
      redirect_to: `${siteUrl}/dashboard/verification`,
    });
    vendor_applicant_id = created.vendor_applicant_id;
    invite_url = created.invite_url;
  }

  // Order any required checks that don't yet exist
  const existingTypes = new Set(
    (existing ?? []).map((r) => r.check_type as UCheckCheckType)
  );

  const ordered: { check_type: UCheckCheckType; status: string }[] = [];
  for (const type of UCHECK_REQUIRED_TYPES) {
    if (existingTypes.has(type)) continue;
    const check = await startCheck({
      vendor_applicant_id: vendor_applicant_id!,
      check_type: type,
    });

    const { data: row } = await admin
      .from("background_checks")
      .insert({
        user_id: user.id,
        vendor: "uchecks",
        check_type: type,
        status: check.status,
        vendor_applicant_id,
        vendor_check_id: check.vendor_check_id,
        invite_url,
        issued_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // Platform-pays accounting
    await admin.from("vendor_costs").insert({
      user_id: user.id,
      vendor: "uchecks",
      cost_type: type,
      amount_cents: UCHECK_COST_CENTS_GBP[type],
      currency: "gbp",
      vendor_reference: check.vendor_check_id,
      related_background_check_id: row?.id ?? null,
    });

    ordered.push({ check_type: type, status: check.status });
  }

  return NextResponse.json({
    vendor_applicant_id,
    invite_url,
    ordered,
  });
}
