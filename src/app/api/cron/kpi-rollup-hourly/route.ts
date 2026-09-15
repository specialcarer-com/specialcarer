import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deriveKpisForDay,
  type BookingRow,
  type BookingRangeRow,
  type ReviewRow,
} from "./derive";

export const dynamic = "force-dynamic";

/**
 * /api/cron/kpi-rollup-hourly
 *
 * Recomputes today's national rollup row for each of the 6 KPI metrics
 * and UPSERTs into kpi_rollups_daily.
 *
 * B2 (2026-09): The prior implementation emitted a mock-deterministic
 * value for any metric it couldn't derive, keeping the dashboard "alive"
 * with fabricated numbers. That's removed. Metrics without a real
 * derivation now write NULL + state='error' + error_code='no_derivation_wired',
 * which the reader / UI render honestly as unavailable.
 *
 * Deploy-safe: if the migration adding `state` / `error_code` hasn't
 * applied yet, upserts fall back to the pre-migration shape (value-only
 * for ok rows) and non-ok rows are skipped for that hour.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. Accepts POST (spec) and
 * GET (Vercel cron default).
 */
async function run(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "service_role_missing" },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getUTCHours();
  const startOfDay = `${today}T00:00:00Z`;
  const endOfDay = `${today}T23:59:59Z`;

  const kpis = await deriveKpisForDay(today, {
    async fetchBookingsForDay() {
      const { data, error } = await admin
        .from("bookings")
        .select("id, total_cents, currency, status, created_at")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .limit(5000);
      return {
        rows: (data as BookingRow[] | null) ?? null,
        error: error?.message ?? null,
      };
    },
    async fetchBookingsForRange(fromDay, toDay) {
      const { data, error } = await admin
        .from("bookings")
        .select("id, seeker_id, caregiver_id, created_at, status")
        .gte("created_at", `${fromDay}T00:00:00Z`)
        .lte("created_at", `${toDay}T23:59:59Z`)
        .limit(20000);
      return {
        rows: (data as BookingRangeRow[] | null) ?? null,
        error: error?.message ?? null,
      };
    },
    async fetchReviewsForRange(fromDay, toDay) {
      const { data, error } = await admin
        .from("reviews")
        .select("rating, hidden_at, created_at")
        .gte("created_at", `${fromDay}T00:00:00Z`)
        .lte("created_at", `${toDay}T23:59:59Z`)
        .limit(20000);
      return {
        rows: (data as ReviewRow[] | null) ?? null,
        error: error?.message ?? null,
      };
    },
  });

  const now = new Date().toISOString();
  let upserts = 0;
  let schemaNotReady = false;

  for (const k of kpis) {
    // Read existing row (portable path — the JS client can't target the
    // named unique constraint via .upsert without a compound `onConflict`
    // over the generated column, which isn't allowed).
    const { data: existing } = await admin
      .from("kpi_rollups_daily")
      .select("id")
      .eq("day", today)
      .eq("metric", k.metric)
      .contains("dimension", { scope: "national" })
      .maybeSingle<{ id: string }>();

    // Preferred: write value + state + error_code. On pre-migration
    // schemas the state column doesn't exist; catch and downgrade.
    const patch: Record<string, unknown> = {
      value: k.value,
      state: k.state,
      error_code: k.errorCode ?? null,
      computed_at: now,
    };

    if (existing) {
      const { error } = await admin
        .from("kpi_rollups_daily")
        .update(patch)
        .eq("id", existing.id);
      if (isSchemaNotReady(error?.message)) {
        schemaNotReady = true;
        if (k.state === "ok" && k.value != null) {
          // Best-effort fallback on the old schema — only ok rows.
          const { error: fbErr } = await admin
            .from("kpi_rollups_daily")
            .update({ value: k.value, computed_at: now })
            .eq("id", existing.id);
          if (!fbErr) upserts += 1;
        }
      } else if (!error) {
        upserts += 1;
      }
    } else {
      const insert: Record<string, unknown> = {
        day: today,
        metric: k.metric,
        dimension: { scope: "national" },
        ...patch,
      };
      const { error } = await admin.from("kpi_rollups_daily").insert(insert);
      if (isSchemaNotReady(error?.message)) {
        schemaNotReady = true;
        if (k.state === "ok" && k.value != null) {
          const { error: fbErr } = await admin
            .from("kpi_rollups_daily")
            .insert({
              day: today,
              metric: k.metric,
              dimension: { scope: "national" },
              value: k.value,
            });
          if (!fbErr) upserts += 1;
        }
      } else if (!error) {
        upserts += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    day: today,
    hour,
    upserts,
    ...(schemaNotReady ? { skippedReason: "schema_not_ready" } : {}),
    computed: Object.fromEntries(
      kpis.map((k) => [
        k.metric,
        { state: k.state, value: k.value, error_code: k.errorCode ?? null },
      ]),
    ),
  });
}

function isSchemaNotReady(msg: string | undefined | null): boolean {
  if (!msg) return false;
  return /column .* does not exist|state.*does not exist|error_code.*does not exist/i.test(
    msg,
  );
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
