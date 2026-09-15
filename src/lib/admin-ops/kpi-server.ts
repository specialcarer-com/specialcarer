import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  KPI_METRICS,
  type KpiMetric,
} from "@/lib/admin-ops/types";
import {
  toneForMinutes,
  type KpiFreshness,
} from "@/lib/admin-ops/kpi-freshness";

export type {
  KpiFreshness,
  KpiFreshnessTone,
} from "@/lib/admin-ops/kpi-freshness";
export { toneForMinutes } from "@/lib/admin-ops/kpi-freshness";

/**
 * State of a single KPI daily rollup row. Mirrors the `state` column
 * added by 20260911210000_kpi_rollup_status.
 *   - ok    → value is trustworthy
 *   - stale → last successful compute; value shown but flagged
 *   - error → derivation failed; value should NOT be rendered as a number
 *   - missing → no row for that day at all (pre-existing gap semantics)
 */
export type KpiPointState = "ok" | "stale" | "error" | "missing";

export type KpiPoint = {
  day: string;
  value: number | null;
  state: KpiPointState;
};

export type KpiSnapshot = {
  metric: KpiMetric;
  series: KpiPoint[];
  today: number | null;
  today_state: KpiPointState;
  today_error_code: string | null;
  yesterday: number | null;
  avg7d: number | null;
  delta_pct: number | null;
};

/**
 * Server-side equivalent of /api/admin/analytics/kpis. Reads from
 * kpi_rollups_daily, national scope only.
 *
 * Deploy-safety: prefers the post-B2 projection (day, metric, value,
 * state, error_code, computed_at). If the `state` column doesn't yet
 * exist (pre-migration), falls back to the legacy projection and
 * treats all rows as state='ok'.
 */
export async function getKpiSnapshots(
  metrics: readonly KpiMetric[] = KPI_METRICS,
  days = 14,
): Promise<KpiSnapshot[]> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return metrics.map(emptySnap);
  }

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceDay = since.toISOString().slice(0, 10);

  const rows = await readRollups(admin, metrics, sinceDay);
  if (rows == null) {
    return metrics.map(emptySnap);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const grid: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    grid.push(d.toISOString().slice(0, 10));
  }

  return metrics.map((metric) => {
    const byDay = new Map<
      string,
      { value: number | null; state: KpiPointState; error_code: string | null }
    >();
    for (const r of rows) {
      if (r.metric !== metric) continue;
      byDay.set(r.day, {
        value: r.value,
        state: r.state,
        error_code: r.error_code,
      });
    }

    const series: KpiPoint[] = grid.map((d) => {
      const hit = byDay.get(d);
      if (!hit) return { day: d, value: null, state: "missing" };
      return { day: d, value: hit.value, state: hit.state };
    });

    // Today: only surfaces a numeric value when state='ok'. stale/error
    // rows still exist as points in the series but do not contribute to
    // headline / avg / delta.
    const todayRow = byDay.get(todayIso);
    const today =
      todayRow && todayRow.state === "ok" && typeof todayRow.value === "number"
        ? todayRow.value
        : null;
    const today_state: KpiPointState = todayRow ? todayRow.state : "missing";
    const today_error_code = todayRow?.error_code ?? null;

    // Yesterday / 7d-avg use only ok rows. If a day is stale/error/missing,
    // it's dropped from the trailing average — a mean over honest points.
    const yIso = grid[grid.length - 2];
    const yRow = byDay.get(yIso);
    const yesterday =
      yRow && yRow.state === "ok" && typeof yRow.value === "number"
        ? yRow.value
        : null;
    const trailingDays = grid.slice(-8, -1);
    const trailing = trailingDays
      .map((d) => byDay.get(d))
      .filter(
        (r): r is { value: number; state: KpiPointState; error_code: null } =>
          !!r && r.state === "ok" && typeof r.value === "number",
      )
      .map((r) => r.value);
    const avg7d =
      trailing.length > 0
        ? trailing.reduce((a, b) => a + b, 0) / trailing.length
        : null;
    const deltaPct =
      avg7d != null && avg7d !== 0 && today != null
        ? ((today - avg7d) / avg7d) * 100
        : null;

    return {
      metric,
      series,
      today,
      today_state,
      today_error_code,
      yesterday,
      avg7d,
      delta_pct: deltaPct,
    };
  });
}

// ── internals ───────────────────────────────────────────────────────

type RollupRow = {
  day: string;
  metric: KpiMetric;
  value: number | null;
  state: KpiPointState;
  error_code: string | null;
};

async function readRollups(
  admin: ReturnType<typeof createAdminClient>,
  metrics: readonly KpiMetric[],
  sinceDay: string,
): Promise<RollupRow[] | null> {
  // Preferred: post-B2 projection.
  const withState = await admin
    .from("kpi_rollups_daily")
    .select("day, metric, value, state, error_code")
    .in("metric", metrics as readonly string[])
    .gte("day", sinceDay)
    .contains("dimension", { scope: "national" })
    .order("day", { ascending: true });

  if (!withState.error && withState.data) {
    return withState.data.map((r) => ({
      day: r.day as string,
      metric: r.metric as KpiMetric,
      value: r.value == null ? null : Number(r.value),
      state: normaliseState(r.state as string | null | undefined),
      error_code: (r.error_code as string | null) ?? null,
    }));
  }

  // Pre-migration schema: treat every row as ok.
  if (
    withState.error &&
    /column .* does not exist|state.*does not exist|error_code.*does not exist/i.test(
      withState.error.message,
    )
  ) {
    const legacy = await admin
      .from("kpi_rollups_daily")
      .select("day, metric, value")
      .in("metric", metrics as readonly string[])
      .gte("day", sinceDay)
      .contains("dimension", { scope: "national" })
      .order("day", { ascending: true });
    if (legacy.error || !legacy.data) return null;
    return legacy.data.map((r) => ({
      day: r.day as string,
      metric: r.metric as KpiMetric,
      value: r.value == null ? null : Number(r.value),
      state: "ok" as KpiPointState,
      error_code: null,
    }));
  }

  return null;
}

function normaliseState(s: string | null | undefined): KpiPointState {
  if (s === "ok" || s === "stale" || s === "error") return s;
  return "ok"; // defensive: unknown / null defaults to ok
}

function emptySnap(metric: KpiMetric): KpiSnapshot {
  return {
    metric,
    series: [],
    today: null,
    today_state: "missing",
    today_error_code: null,
    yesterday: null,
    avg7d: null,
    delta_pct: null,
  };
}

// ── freshness (E5) ─────────────────────────────────────────────────

/**
 * Global freshness of the KPI rollup pipeline. Read from the max
 * `computed_at` across all rows of `kpi_rollups_daily`. Rendered as a
 * banner at the top of `/admin/analytics` so a stuck cron can't hide
 * behind honest-looking per-metric cards (E5 root cause: the cron ran
 * for 0 hours across 4 months and nothing flagged it).
 */
export async function getKpiFreshness(): Promise<KpiFreshness> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { last_rollup_at: null, minutes_since: null, tone: "unknown" };
  }

  const { data, error } = await admin
    .from("kpi_rollups_daily")
    .select("computed_at")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ computed_at: string | null }>();

  if (error || !data || !data.computed_at) {
    return { last_rollup_at: null, minutes_since: null, tone: "unknown" };
  }

  const lastAt = new Date(data.computed_at);
  const minutesSince = Math.max(
    0,
    Math.round((Date.now() - lastAt.getTime()) / 60000),
  );
  return {
    last_rollup_at: data.computed_at,
    minutes_since: minutesSince,
    tone: toneForMinutes(minutesSince),
  };
}

// toneForMinutes is defined in kpi-freshness.ts (pure, no server-only
// import) and re-exported at the top of this module for consumers that
// import it from here.
