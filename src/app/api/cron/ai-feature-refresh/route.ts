import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertCaregiverFeatures } from "@/lib/ai/matching";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ai-feature-refresh
 *
 * Nightly — recompute ai_match_features for every published carer.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;
  const admin = createAdminClient();
  const { data } = await admin
    .from("caregiver_profiles")
    .select("user_id")
    .eq("is_published", true)
    .limit(5000);
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);

  let refreshed = 0;
  for (const id of ids) {
    try {
      await upsertCaregiverFeatures(id);
      refreshed += 1;
    } catch (e) {
      console.error("feature refresh failed for", id, e);
    }
  }
  return NextResponse.json({
    ok: true,
    pool: ids.length,
    refreshed,
  });
}
