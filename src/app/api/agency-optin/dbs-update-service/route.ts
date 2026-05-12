import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUkCarer } from "@/lib/agency-optin/server";
import {
  getDbsProvider,
  computeNextUsCheckDueAt,
  validateUpdateServiceInput,
  type VerifyUpdateServiceInput,
} from "@/lib/dbs/provider";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency-optin/dbs-update-service
 *
 * Carer submits their DBS Update Service details + explicit consent.
 * Server calls the configured provider:
 *   - status='current' + ok=true => write a background_checks row with
 *     source='update_service' and gate flips green via the view.
 *   - status='changed' or any failure => store a "submitted" row so the
 *     admin queue can see it; gate stays red; client shows an error.
 *
 * Body:
 *   {
 *     carer_legal_name, date_of_birth, certificate_number,
 *     subscription_id, workforce_type, consent (must be true)
 *   }
 */
export async function POST(req: Request) {
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
    .select("role, country, full_name")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      country: string | null;
      full_name: string | null;
    }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUkCarer(profile.country)) {
    return NextResponse.json(
      { error: "DBS Update Service is UK-only." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.consent !== true) {
    return NextResponse.json(
      { error: "Consent is required to perform the Update Service check." },
      { status: 400 },
    );
  }

  const input: Partial<VerifyUpdateServiceInput> = {
    carerLegalName:
      typeof body.carer_legal_name === "string"
        ? body.carer_legal_name
        : profile.full_name ?? "",
    dateOfBirth:
      typeof body.date_of_birth === "string" ? body.date_of_birth : "",
    certificateNumber:
      typeof body.certificate_number === "string"
        ? body.certificate_number.replace(/\s+/g, "")
        : "",
    subscriptionId:
      typeof body.subscription_id === "string"
        ? body.subscription_id.replace(/\s+/g, "")
        : "",
    workforceType:
      body.workforce_type === "adult" ||
      body.workforce_type === "child" ||
      body.workforce_type === "both"
        ? body.workforce_type
        : undefined,
  };

  const errors = validateUpdateServiceInput(input);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  const provider = getDbsProvider();
  const consentAt = new Date().toISOString();
  const result = await provider.verifyUpdateService(
    input as VerifyUpdateServiceInput,
  );

  if (result.ok && result.status === "current") {
    const checkedAt = result.checkedAt.toISOString();
    const nextDue = computeNextUsCheckDueAt(result.checkedAt).toISOString();
    // Strictly additive: insert a NEW background_checks row tagged as
    // an Update Service check. Do not delete or update the existing
    // fresh-Checkr row if any.
    const { error: insertErr } = await admin.from("background_checks").insert({
      user_id: user.id,
      check_type: "enhanced_dbs_barred",
      status: "cleared",
      issued_at: checkedAt,
      source: "update_service",
      update_service_subscription_id: input.subscriptionId!,
      update_service_consent_at: consentAt,
      last_us_check_at: checkedAt,
      next_us_check_due_at: nextDue,
      us_check_result: { status: "current", raw: result.raw, provider: provider.name },
      workforce_type: input.workforceType!,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to record check: ${insertErr.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      action: "verified",
      provider: provider.name,
      next_us_check_due_at: nextDue,
    });
  }

  if (result.ok && result.status === "changed") {
    // Record the attempt + raise a change event so admin sees it.
    await admin.from("background_checks").insert({
      user_id: user.id,
      check_type: "enhanced_dbs_barred",
      status: "failed",
      source: "update_service",
      update_service_subscription_id: input.subscriptionId!,
      update_service_consent_at: consentAt,
      last_us_check_at: new Date().toISOString(),
      us_check_result: { status: "changed", raw: result.raw, provider: provider.name },
      workforce_type: input.workforceType!,
    });
    await admin.from("dbs_change_events").insert({
      carer_id: user.id,
      source: "manual",
      prior_status: "unknown",
      new_status: "changed_on_submission",
      raw_payload: result.raw as object,
    });
    return NextResponse.json(
      {
        ok: false,
        action: "changed",
        message:
          "The Update Service says your certificate no longer reflects current information. Please request a fresh DBS check.",
      },
      { status: 200 },
    );
  }

  // ok === false
  if (!result.ok && result.reason === "manual_pending") {
    // Persist a "pending" row so admin can review on /admin/dbs-changes/queue
    // via the manual-verify path. We DO NOT mark the row as cleared.
    await admin.from("background_checks").insert({
      user_id: user.id,
      check_type: "enhanced_dbs_barred",
      status: "pending",
      source: "update_service",
      update_service_subscription_id: input.subscriptionId!,
      update_service_consent_at: consentAt,
      us_check_result: {
        status: "manual_pending",
        raw: result.raw,
        provider: provider.name,
        submitted_legal_name: input.carerLegalName,
        submitted_dob: input.dateOfBirth,
        submitted_cert_no: input.certificateNumber,
      },
      workforce_type: input.workforceType!,
    });
    await admin.from("dbs_change_events").insert({
      carer_id: user.id,
      source: "manual",
      prior_status: null,
      new_status: "manual_pending",
      raw_payload: {
        carer_legal_name: input.carerLegalName,
        date_of_birth: input.dateOfBirth,
        certificate_number: input.certificateNumber,
        subscription_id: input.subscriptionId,
        workforce_type: input.workforceType,
      },
    });
    return NextResponse.json({
      ok: true,
      action: "manual_pending",
      message:
        "Your details are queued. An admin will verify your Update Service status on gov.uk and your gate will flip green within 1 business day.",
    });
  }

  // Other failure reasons
  return NextResponse.json(
    {
      ok: false,
      action: "failed",
      reason: result.ok ? "unknown" : result.reason,
      message: "Update Service verification could not be completed. You can fall back to a fresh DBS check.",
    },
    { status: 200 },
  );
}
