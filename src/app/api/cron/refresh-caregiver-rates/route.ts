import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRefresh, type RefreshClient } from "./refresh-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/refresh-caregiver-rates
 *
 * Daily sweep (03:00 UTC, off-peak). Recomputes per-carer response_rate (30d)
 * and completion_rate (90d) via the SECURITY DEFINER RPC
 * refresh_caregiver_rates() and upserts them into caregiver_rates_cache, which
 * the auto-match scorer reads. Idempotent — safe to re-run.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();
  const client: RefreshClient = {
    async refreshRates() {
      const { data, error } = await admin.rpc("refresh_caregiver_rates");
      if (error) {
        return { updated: 0, error: error.message };
      }
      // RPC returns the integer row count it upserted.
      return { updated: Number(data ?? 0), error: null };
    },
  };

  const res = await handleRefresh(client);
  if (res.body.ok) {
    console.log(
      `[cron.refresh-caregiver-rates] updated ${res.body.updated} carer rate row(s) in ${res.body.duration_ms}ms`,
    );
  } else {
    console.error("[cron.refresh-caregiver-rates] failed:", res.body.error);
  }
  return NextResponse.json(res.body, { status: res.status });
}
