import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import {
  KPI_METRICS,
  type KpiMetric,
} from "@/lib/admin-ops/types";
import { getKpiSnapshots } from "@/lib/admin-ops/kpi-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/kpis?metrics=bookings,gmv&days=14
 *
 * Returns one entry per requested metric, with:
 *   - series: N daily points oldest→newest (national scope only), each
 *     carrying its own state (ok | stale | error | missing)
 *   - today, yesterday, avg7d: numeric only when the underlying row is
 *     state='ok'. Stale / error rows do NOT contribute a number.
 *   - today_state, today_error_code: what to show when the value is
 *     absent (e.g. "no_derivation_wired", "schema_not_ready").
 *   - delta_pct: (today - 7d-avg) / 7d-avg, signed. Null when today or
 *     avg7d isn't an ok number.
 *
 * Reads from kpi_rollups_daily where dimension @> '{"scope":"national"}'.
 * Deploy-safe against pre-B2 schemas — see getKpiSnapshots for details.
 */
export async function GET(req: Request) {
  const _adminGuard = await requireAdminApi();
  if (!_adminGuard.ok) return _adminGuard.response;

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

  const kpis = await getKpiSnapshots(requested, days);
  return NextResponse.json({ kpis });
}
