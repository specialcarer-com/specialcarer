import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  KPI_METRICS,
  type KpiMetric,
} from "@/lib/admin-ops/types";

export type KpiSnapshot = {
  metric: KpiMetric;
  series: { day: string; value: number | null }[];
  today: number | null;
  yesterday: number | null;
  avg7d: number | null;
  delta_pct: number | null;
};

/**
 * Server-side equivalent of /api/admin/analytics/kpis. Used by the
 * Analytics page so it doesn't have to self-fetch.
 *
 * Reads from kpi_rollups_daily, national scope only.
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

  const { data, error } = await admin
    .from("kpi_rollups_daily")
    .select("day, metric, value")
    .in("metric", metrics as readonly string[])
    .gte("day", sinceDay)
    .contains("dimension", { scope: "national" })
    .order("day", { ascending: true });
  if (error || !data) {
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
    const byDay = new Map(
      data
        .filter((r) => r.metric === metric)
        .map((r) => [r.day as string, Number(r.value)]),
    );
    const series = grid.map((d) => ({
      day: d,
      value: byDay.has(d) ? (byDay.get(d) as number) : null,
    }));
    const today = byDay.get(todayIso) ?? null;
    const yIso = grid[grid.length - 2];
    const yesterday = byDay.get(yIso) ?? null;
    const trailingDays = grid.slice(-8, -1);
    const trailing = trailingDays
      .map((d) => byDay.get(d))
      .filter((v): v is number => typeof v === "number");
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
      yesterday,
      avg7d,
      delta_pct: deltaPct,
    };
  });
}

function emptySnap(metric: KpiMetric): KpiSnapshot {
  return {
    metric,
    series: [],
    today: null,
    yesterday: null,
    avg7d: null,
    delta_pct: null,
  };
}
