"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

const VALID_CHECK_TYPES = new Set([
  "enhanced_dbs_barred",
  "right_to_work",
  "digital_id",
  "us_criminal",
  "us_healthcare_sanctions",
]);

const MIN_REASON_LEN = 10;

/**
 * Mark a background check as cleared via admin override.
 *
 * If a row already exists for (user_id, check_type) we update the most recent.
 * If none exists we insert a new admin_override row.
 */
export async function clearCheckAction(input: {
  userId: string;
  checkType: string;
  existingId: string | null;
  reason: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();

  if (!input.userId || typeof input.userId !== "string") {
    return { ok: false, error: "missing_user_id" };
  }
  if (!VALID_CHECK_TYPES.has(input.checkType)) {
    return { ok: false, error: "invalid_check_type" };
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < MIN_REASON_LEN) {
    return {
      ok: false,
      error: `Reason must be at least ${MIN_REASON_LEN} characters`,
    };
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  if (input.existingId) {
    const { error } = await admin
      .from("background_checks")
      .update({
        status: "cleared",
        issued_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", input.existingId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("background_checks").insert({
      user_id: input.userId,
      check_type: input.checkType,
      vendor: "admin_override",
      status: "cleared",
      issued_at: nowIso,
    });
    if (error) return { ok: false, error: error.message };
  }

  await logAdminAction({
    admin: me,
    action: "checks.clear",
    targetType: "caregiver",
    targetId: input.userId,
    details: {
      check_type: input.checkType,
      existing_id: input.existingId,
      reason,
    },
  });

  revalidatePath(`/admin/caregivers/${input.userId}/checks`);
  revalidatePath("/admin/caregivers");
  return { ok: true };
}

/**
 * Reset a background check to "invited" — useful when a vendor decision was
 * wrong and we want the carer to be able to restart the flow.
 */
export async function resetCheckAction(input: {
  userId: string;
  checkType: string;
  existingId: string;
  reason: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();

  if (!VALID_CHECK_TYPES.has(input.checkType)) {
    return { ok: false, error: "invalid_check_type" };
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < MIN_REASON_LEN) {
    return {
      ok: false,
      error: `Reason must be at least ${MIN_REASON_LEN} characters`,
    };
  }
  if (!input.existingId) {
    return { ok: false, error: "missing_existing_id" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("background_checks")
    .update({
      status: "invited",
      issued_at: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.existingId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction({
    admin: me,
    action: "checks.reset",
    targetType: "caregiver",
    targetId: input.userId,
    details: {
      check_type: input.checkType,
      existing_id: input.existingId,
      reason,
    },
  });

  revalidatePath(`/admin/caregivers/${input.userId}/checks`);
  revalidatePath("/admin/caregivers");
  return { ok: true };
}
