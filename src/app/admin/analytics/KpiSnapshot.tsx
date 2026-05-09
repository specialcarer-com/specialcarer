import {
  KPI_METRIC_LABEL,
  formatKpi,
  kpiHigherIsBetter,
  type KpiMetric,
} from "@/lib/admin-ops/types";
import {
  getKpiSnapshots,
  type KpiSnapshot,
} from "@/lib/admin-ops/kpi-server";
import Sparkline from "./Sparkline";

/**
 * KPI Snapshot strip — 6 cards, 3-col grid on desktop. Each card shows
 * today / yesterday / 7d-avg / delta-% + a 14d inline-SVG sparkline.
 *
 * Server component. Reads kpi_rollups_daily directly (admin client).
 */
export default async function KpiSnapshot() {
  const kpis = await getKpiSnapshots();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">KPI snapshot</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Today vs yesterday vs 7-day average. Sparkline shows the last 14
          days. National rollup; refreshed by{" "}
          <code className="text-[11px]">/api/cron/kpi-rollup-hourly</code>.
        </p>
      </div>

      {kpis.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No KPI rollups available yet. The seed populates 14 days of
          national-scope rows when the migration is applied.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {kpis.map((k) => (
            <KpiCard key={k.metric} snap={k} />
          ))}
        </div>
      )}
    </section>
  );
}

function KpiCard({ snap }: { snap: KpiSnapshot }) {
  const metric = snap.metric;
  const today = snap.today;
  const yesterday = snap.yesterday;
  const avg7d = snap.avg7d;
  const delta = snap.delta_pct;

  const better = kpiHigherIsBetter(metric);
  const deltaTone =
    delta == null
      ? "text-slate-500"
      : (better && delta >= 0) || (!better && delta < 0)
        ? "text-emerald-700"
        : "text-rose-700";
  const arrow =
    delta == null ? "" : delta >= 0 ? "▲" : "▼";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {KPI_METRIC_LABEL[metric]}
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatKpi(metric, today)}
          </p>
        </div>
        <Sparkline values={snap.series.map((s) => s.value)} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
        <div>
          <dt className="uppercase tracking-wide text-slate-500">Yest.</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {formatKpi(metric, yesterday)}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-slate-500">7d avg</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {formatKpi(metric, avg7d)}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-slate-500">Δ vs 7d</dt>
          <dd className={`mt-0.5 font-semibold ${deltaTone}`}>
            {delta == null ? "—" : `${arrow} ${Math.abs(delta).toFixed(1)}%`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
