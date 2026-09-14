import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aggregateExperimentOffers,
  type ExperimentRollupClient,
  type RollupInputRow,
} from "@/lib/experiments/rollup";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/experiment-rollup
 *
 * Daily worker (05:00 UTC). Reads `booking_match_offers` for the
 * previous UTC day and upserts per-(experiment_id, variant) aggregate
 * rows into `experiment_daily_rollup`. Idempotent — safe to re-run
 * the same day multiple times.
 *
 * Yesterday-only window keeps the cost predictable and stops us from
 * repeatedly rolling up the same rows every day. Offers with a null
 * experiment_id are skipped (they weren't part of any experiment).
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  // Yesterday, in UTC. offered_at is a timestamptz so we compare
  // against ISO strings.
  const now = Date.now();
  const yesterdayIso = new Date(now - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD
  const dayStart = `${yesterdayIso}T00:00:00.000Z`;
  const dayEnd = `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`;

  const client: ExperimentRollupClient = {
    async listOffers() {
      const { data, error } = await admin
        .from("booking_match_offers")
        .select("experiment_id, variant, status")
        .gte("offered_at", dayStart)
        .lt("offered_at", dayEnd)
        .not("experiment_id", "is", null);
      if (error) return { rows: [] as RollupInputRow[], error: error.message };
      return {
        rows: (data ?? []).map((r) => ({
          experiment_id: (r.experiment_id as string | null) ?? "",
          variant: (r.variant as string | null) ?? "",
          status: (r.status as string | null) ?? "",
        })),
        error: null,
      };
    },
    async upsertRow(row) {
      const { error } = await admin.from("experiment_daily_rollup").upsert(
        {
          ...row,
          day: yesterdayIso,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "experiment_id,variant,day" },
      );
      return error ? { error: error.message } : { error: null };
    },
  };

  const started = Date.now();
  const result = await aggregateExperimentOffers(client);
  const duration = Date.now() - started;

  if (!result.ok) {
    console.error("[cron.experiment-rollup] failed:", result.error);
    return NextResponse.json(
      { ok: false, error: result.error, duration_ms: duration },
      { status: 500 },
    );
  }
  console.log(
    `[cron.experiment-rollup] rolled up day=${yesterdayIso} scanned=${result.scanned} upserted=${result.upserted} in ${duration}ms`,
  );
  return NextResponse.json({
    ok: true,
    day: yesterdayIso,
    scanned: result.scanned,
    upserted: result.upserted,
    duration_ms: duration,
  });
}
