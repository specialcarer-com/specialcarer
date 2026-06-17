/**
 * POST /api/admin/dbs/[applicationId]/decision
 *
 * Admin records a manual approve/reject decision on a DBS application.
 * Body: {
 *   decision: "approved" | "rejected",
 *   certificateNumber?: string,   // required-ish on approve
 *   certificateIssuedOn?: string, // ISO date
 *   notes?: string,
 *   surnameOverride?: boolean,
 * }
 *
 * Gated by NEXT_PUBLIC_DBS_ENABLED (the service throws DbsDisabledError when
 * off). Admin-only via requireAdminApi().
 */

import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { recordManualDecision } from "@/lib/dbs/service";
import { recordSurnameOverride } from "@/lib/dbs/cross-check";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDbsEnabled } from "@/lib/dbs/flag";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!isDbsEnabled()) {
    return NextResponse.json(
      { error: "DBS feature is disabled" },
      { status: 403 },
    );
  }

  const { applicationId } = await params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (payload ?? {}) as Record<string, unknown>;
  const decision = b.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }
  const certificateNumber =
    typeof b.certificateNumber === "string" ? b.certificateNumber.trim() : undefined;
  const certificateIssuedOn =
    typeof b.certificateIssuedOn === "string" ? b.certificateIssuedOn.trim() : undefined;
  const notes = typeof b.notes === "string" ? b.notes.slice(0, 2000) : undefined;
  const surnameOverride = b.surnameOverride === true;

  // A surname override (hyphenation / maiden name) is recorded against all of
  // the carer's applications so a re-run cross-check passes. Resolve the carer
  // from the application id first.
  if (surnameOverride) {
    const admin = createAdminClient();
    const { data: appRow } = await admin
      .from("dbs_applications")
      .select("carer_id")
      .eq("id", applicationId)
      .maybeSingle<{ carer_id: string }>();
    if (appRow) {
      try {
        await recordSurnameOverride(
          appRow.carer_id,
          guard.admin.id,
          notes ?? "Surname mismatch override (admin)",
        );
      } catch {
        // override failure must not block the decision below
      }
    }
  }

  try {
    await recordManualDecision(
      applicationId,
      decision,
      guard.admin.id,
      certificateNumber,
      certificateIssuedOn,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to record decision" },
      { status: 400 },
    );
  }

  // Extra context (notes, surname override) recorded in the audit log; the
  // core dbs.<decision> action is logged inside recordManualDecision.
  if (notes || surnameOverride) {
    await logAdminAction({
      admin: guard.admin,
      action: "dbs.decision_context",
      targetType: "dbs_application",
      targetId: applicationId,
      details: { notes, surnameOverride },
    });
  }

  return NextResponse.json({ ok: true });
}
