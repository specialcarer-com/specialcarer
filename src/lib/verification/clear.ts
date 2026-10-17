import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Record a manually verified check in background_checks, which is what the
 * publish gate reads. Uses the (user_id, vendor, check_type) unique key so a
 * repeat approval updates the row instead of failing.
 *
 * vendor is a bg_vendor enum value ('uchecks' for UK checks, 'checkr' for US
 * ones); manual clearances are marked by source = 'admin_manual'.
 */
export async function recordManualClearance(
  admin: SupabaseClient,
  input: {
    userId: string;
    checkType: string;
    expiresAt: string | null;
    summary: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("background_checks").upsert(
    {
      user_id: input.userId,
      vendor: input.checkType.startsWith("us_") ? "checkr" : "uchecks",
      check_type: input.checkType,
      status: "cleared",
      source: "admin_manual",
      issued_at: nowIso,
      expires_at: input.expiresAt,
      result_summary: input.summary,
      updated_at: nowIso,
    },
    { onConflict: "user_id,vendor,check_type" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}
