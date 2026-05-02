import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createApplicant as uchecksCreateApplicant,
  startCheck as uchecksStartCheck,
  UCHECK_COST_CENTS_GBP,
  UCHECK_REQUIRED_TYPES,
  type UCheckCheckType,
} from "@/lib/uchecks/server";
import {
  createCandidateAndInvitation as checkrCreateInvitation,
  CHECKR_COST_CENTS_USD,
  CHECKR_REQUIRED_TYPES,
  getPackageSlug,
  type CheckrCheckType,
} from "@/lib/checkr/server";

export const runtime = "nodejs";

/**
 * POST /api/background-checks/start
 *
 * Caregiver-initiated. Routes by profile.country:
 *   GB → uCheck (Enhanced DBS + Right-to-Work + Digital ID)
 *   US → Checkr (Criminal + Healthcare Sanctions)
 *
 * Platform absorbs the fee; a vendor_costs row is written per check.
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
    .select("role, full_name, country")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json(
      { error: "Only caregivers can start background checks" },
      { status: 403 }
    );
  }

  const country = (profile.country as "GB" | "US") || "GB";
  const fullName = (profile.full_name || "").trim();
  const parts = fullName.split(/\s+/);
  const first_name = parts[0] || "Caregiver";
  const last_name = parts.slice(1).join(" ") || "User";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://specialcarer.com";
  const redirect_to = `${siteUrl}/dashboard/verification`;

  if (country === "GB") {
    return await startUKBundle({
      admin,
      userId: user.id,
      email: user.email || "",
      first_name,
      last_name,
      redirect_to,
    });
  }
  if (country === "US") {
    return await startUSBundle({
      admin,
      userId: user.id,
      email: user.email || "",
      first_name,
      last_name,
      redirect_to,
    });
  }
  return NextResponse.json(
    { error: `Country ${country} not supported for background checks` },
    { status: 400 }
  );
}

type StartArgs = {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  email: string;
  first_name: string;
  last_name: string;
  redirect_to: string;
};

async function startUKBundle(a: StartArgs) {
  const { data: existing } = await a.admin
    .from("background_checks")
    .select("vendor_applicant_id, invite_url, check_type, status")
    .eq("user_id", a.userId)
    .eq("vendor", "uchecks");

  let vendor_applicant_id =
    existing?.find((r) => r.vendor_applicant_id)?.vendor_applicant_id ?? null;
  let invite_url =
    existing?.find((r) => r.invite_url)?.invite_url ?? null;

  if (!vendor_applicant_id) {
    const created = await uchecksCreateApplicant({
      user_id: a.userId,
      email: a.email,
      first_name: a.first_name,
      last_name: a.last_name,
      redirect_to: a.redirect_to,
    });
    vendor_applicant_id = created.vendor_applicant_id;
    invite_url = created.invite_url;
  }

  const existingTypes = new Set(
    (existing ?? []).map((r) => r.check_type as UCheckCheckType)
  );
  const ordered: { check_type: UCheckCheckType; status: string }[] = [];
  for (const type of UCHECK_REQUIRED_TYPES) {
    if (existingTypes.has(type)) continue;
    const check = await uchecksStartCheck({
      vendor_applicant_id: vendor_applicant_id!,
      check_type: type,
    });
    const { data: row } = await a.admin
      .from("background_checks")
      .insert({
        user_id: a.userId,
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
    await a.admin.from("vendor_costs").insert({
      user_id: a.userId,
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
    vendor: "uchecks",
    country: "GB",
    vendor_applicant_id,
    invite_url,
    ordered,
  });
}

async function startUSBundle(a: StartArgs) {
  const { data: existing } = await a.admin
    .from("background_checks")
    .select("vendor_applicant_id, invite_url, check_type, status")
    .eq("user_id", a.userId)
    .eq("vendor", "checkr");

  let vendor_candidate_id =
    existing?.find((r) => r.vendor_applicant_id)?.vendor_applicant_id ?? null;
  let invitation_url =
    existing?.find((r) => r.invite_url)?.invite_url ?? null;
  let vendor_invitation_id: string | null = null;

  if (!vendor_candidate_id) {
    const created = await checkrCreateInvitation({
      user_id: a.userId,
      email: a.email,
      first_name: a.first_name,
      last_name: a.last_name,
      redirect_to: a.redirect_to,
    });
    vendor_candidate_id = created.vendor_candidate_id;
    vendor_invitation_id = created.vendor_invitation_id;
    invitation_url = created.invitation_url;
  }

  const existingTypes = new Set(
    (existing ?? []).map((r) => r.check_type as CheckrCheckType)
  );
  const ordered: { check_type: CheckrCheckType; status: string }[] = [];
  for (const type of CHECKR_REQUIRED_TYPES) {
    if (existingTypes.has(type)) continue;
    // Checkr issues all checks under one invitation; we create per-type rows
    // so the UI can show progress, and reconcile with webhook events.
    const { data: row } = await a.admin
      .from("background_checks")
      .insert({
        user_id: a.userId,
        vendor: "checkr",
        check_type: type,
        status: "invited",
        vendor_applicant_id: vendor_candidate_id,
        vendor_check_id: vendor_invitation_id, // overwritten by webhook with real report id
        invite_url: invitation_url,
        issued_at: new Date().toISOString(),
        raw: { package: getPackageSlug() } as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();
    await a.admin.from("vendor_costs").insert({
      user_id: a.userId,
      vendor: "checkr",
      cost_type: type,
      amount_cents: CHECKR_COST_CENTS_USD[type],
      currency: "usd",
      vendor_reference: vendor_invitation_id ?? vendor_candidate_id,
      related_background_check_id: row?.id ?? null,
    });
    ordered.push({ check_type: type, status: "invited" });
  }

  return NextResponse.json({
    vendor: "checkr",
    country: "US",
    vendor_applicant_id: vendor_candidate_id,
    invite_url: invitation_url,
    ordered,
  });
}
