"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KINDS, validateDecision, type KindKey } from "@/lib/verification/kinds";
import { recordManualClearance } from "@/lib/verification/clear";

type ActionResult = { ok: true } | { ok: false; error: string };

const BUCKET = "verification-docs";

/**
 * Approve or reject a carer's submitted evidence. Approving a publish-gating
 * kind (right to work, photo ID, DBS) also writes the cleared background_checks
 * row the publish gate reads.
 */
export async function decideSubmissionAction(input: {
  id: string;
  decision: "approved" | "rejected";
  checklist: Record<string, boolean>;
  note: string;
  expiresOn: string | null;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { ok: false, error: "invalid_decision" };
  }

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("verification_submissions")
    .select("id, user_id, kind, status, files")
    .eq("id", input.id)
    .maybeSingle();
  if (readErr || !row) return { ok: false, error: "Submission not found." };
  if (row.status !== "submitted") return { ok: false, error: "This has already been decided." };
  if (!(row.kind in KINDS)) return { ok: false, error: "Unknown check type." };
  const kind = row.kind as KindKey;
  const def = KINDS[kind];

  const checked = validateDecision(kind, input.decision, input.checklist ?? {}, input.note, input.expiresOn);
  if (!checked.ok) return { ok: false, error: checked.error };

  // Photo ID is deleted before the decision is recorded: if deletion fails the
  // decision is not saved and nothing is reported as done.
  if (def.deleteFilesOnDecision) {
    const paths = Object.values((row.files ?? {}) as Record<string, string>);
    if (paths.length) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
      if (rmErr) {
        console.error("verification_file_delete_failed", { id: row.id, message: rmErr.message });
        return { ok: false, error: "Could not delete the uploaded photo, so the decision was not saved. Please try again." };
      }
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("verification_submissions")
    .update({
      status: input.decision,
      checklist: input.checklist ?? {},
      files: def.deleteFilesOnDecision ? {} : row.files ?? {},
      review_note: (input.note ?? "").trim() || null,
      expires_at: checked.expiresAt,
      reviewed_by: me.id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .eq("status", "submitted")
    .select("id");
  if (updErr) return { ok: false, error: updErr.message };
  if (!updated || updated.length === 0) return { ok: false, error: "This has already been decided." };

  if (input.decision === "approved" && def.bgCheckType) {
    const cleared = await recordManualClearance(admin, {
      userId: row.user_id,
      checkType: def.bgCheckType,
      expiresAt: checked.expiresAt,
      summary: `Verified by SpecialCarer back office on ${nowIso.slice(0, 10)}`,
    });
    if (!cleared.ok) {
      // Put the submission back in the queue so the decision can be retried.
      await admin
        .from("verification_submissions")
        .update({ status: "submitted", reviewed_by: null, reviewed_at: null, updated_at: nowIso })
        .eq("id", row.id);
      return {
        ok: false,
        error: `Could not record the check: ${cleared.error}.${def.deleteFilesOnDecision ? " The photo has already been deleted, so reject this and ask the carer to resubmit." : ""}`,
      };
    }
  }

  await logAdminAction({
    admin: me,
    action: `verification.${input.decision}`,
    targetType: "caregiver",
    targetId: row.user_id,
    details: { submission_id: row.id, kind, expires_at: checked.expiresAt },
  });

  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${row.id}`);
  revalidatePath(`/admin/caregivers/${row.user_id}/checks`);
  return { ok: true };
}
