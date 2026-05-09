import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CAREGIVER_STAGES,
  type CaregiverStage,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/caregivers/[id]/stage
 * Body: { to_stage: CaregiverStage, note?: string }
 * Updates caregiver_profiles.application_stage and appends a row to
 * caregiver_stage_history.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const to = p.to_stage;
  const note =
    typeof p.note === "string" ? p.note.trim().slice(0, 500) : null;

  if (
    typeof to !== "string" ||
    !(CAREGIVER_STAGES as readonly string[]).includes(to)
  ) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 });
  }
  const toStage = to as CaregiverStage;

  const admin = createAdminClient();
  const { data: cur } = await admin
    .from("caregiver_profiles")
    .select("user_id, application_stage")
    .eq("user_id", id)
    .maybeSingle<{ user_id: string; application_stage: CaregiverStage }>();
  if (!cur) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (cur.application_stage === toStage) {
    return NextResponse.json({
      ok: true,
      stage: toStage,
      changed: false,
    });
  }

  const now = new Date().toISOString();
  const { error: e1 } = await admin
    .from("caregiver_profiles")
    .update({ application_stage: toStage, stage_entered_at: now })
    .eq("user_id", id);
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  const { error: e2 } = await admin.from("caregiver_stage_history").insert({
    caregiver_id: id,
    from_stage: cur.application_stage,
    to_stage: toStage,
    moved_by: me.id,
    note,
  });
  if (e2) {
    // Best-effort log — the stage change still happened.
    console.error("stage_history insert failed", e2);
  }

  await logAdminAction({
    admin: me,
    action: "caregiver.stage.update",
    targetType: "caregiver",
    targetId: id,
    details: { from: cur.application_stage, to: toStage, note },
  });

  return NextResponse.json({
    ok: true,
    stage: toStage,
    changed: true,
  });
}
