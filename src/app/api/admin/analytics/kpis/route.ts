import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  KPI_METRICS,
  type KpiMetric,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

type Row = {
  day: string;
  metric: KpiMetric;
  value: number;
};

/**
 * GET /api/admin/analytics/kpis?metrics=bookings,gmv&days=14
 *
 * Returns one entry per requested metric, with:
 *   - series: 14 daily points oldest→newest (national scope only)
 *   - today, yesterday, avg7d
 *   - delta_pct: (today - 7d-avg) / 7d-avg, signed
 *
 * Reads from kpi_rollups_daily where dimension @> '{"scope":"national"}'.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const metricsParam = url.searchParams.get("metrics");
  const daysParam = url.searchParams.get("days");
  const days = (() => {
    const n = Number(daysParam);
    return Number.isInteger(n) && n >= 2 && n <= 90 ? n : 14;
  })();

  const requested: KpiMetric[] = (() => {
    if (!metricsParam) return [...KPI_METRICS];
    const parsed = metricsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is KpiMetric =>
        (KPI_METRICS as readonly string[]).includes(s),
      );
    return parsed.length > 0 ? parsed : [...KPI_METRICS];
  })();

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceDay = since.toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kpi_rollups_daily")
    .select("day, metric, value")
    .in("metric", requested)
    .gte("day", sinceDay)
    .contains("dimension", { scope: "national" })
    .order("day", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  // Build a complete day grid so the sparkline always has `days` slots.
  const todayIso = new Date().toISOString().slice(0, 10);
  const grid: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    grid.push(d.toISOString().slice(0, 10));
  }

  const out = requested.map((metric) => {
    const byDay = new Map(
      rows
        .filter((r) => r.metric === metric)
        .map((r) => [r.day, Number(r.value)] as const),
    );
    const series = grid.map((d) => ({
      day: d,
      value: byDay.has(d) ? (byDay.get(d) as number) : null,
    }));
    const today = byDay.get(todayIso) ?? null;
    // Yesterday = day grid[length-2]
    const yIso = grid[grid.length - 2];
    const yesterday = byDay.get(yIso) ?? null;
    // 7-day average over the trailing 7 entries (excluding today)
    const trailingDays = grid.slice(-8, -1); // last 7 not including today
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

  return NextResponse.json({ kpis: out });
}
