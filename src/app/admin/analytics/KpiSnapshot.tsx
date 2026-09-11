import {
  KPI_METRIC_LABEL,
  formatKpi,
  kpiHigherIsBetter,
  type KpiMetric,
} from "@/lib/admin-ops/types";
import {
  getKpiSnapshots,
  type KpiSnapshot,
  type KpiPointState,
} from "@/lib/admin-ops/kpi-server";
import Sparkline from "./Sparkline";

/**
 * KPI Snapshot strip — 6 cards, 3-col grid on desktop.
 *
 * B2 (2026-09): renders data-quality state honestly. If a metric's
 * rollup for today is state='error' (e.g. no_derivation_wired,
 * schema_not_ready) or 'stale' / missing, the card shows an honest
 * placeholder + reason instead of a mock-generated number.
 *
 * Server component. Reads kpi_rollups_daily via getKpiSnapshots().
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
          Metrics without a real derivation are shown as unavailable, not
          filled with placeholder numbers.
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
  const state = snap.today_state;
  const errorCode = snap.today_error_code;
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
  const arrow = delta == null ? "" : delta >= 0 ? "▲" : "▼";

  const hasOkValue = state === "ok" && typeof today === "number";
  const badge = badgeForState(state, errorCode);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4"
      data-metric={metric}
      data-state={state}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {KPI_METRIC_LABEL[metric]}
            </p>
            {badge ? (
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.tone}`}
                title={badge.title}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
          <p
            className={`mt-1 text-2xl font-semibold ${
              hasOkValue ? "text-slate-900" : "text-slate-400"
            }`}
          >
            {hasOkValue ? formatKpi(metric, today) : "—"}
          </p>
          {!hasOkValue ? (
            <p className="mt-0.5 text-[11px] italic text-slate-500">
              {unavailableReason(state, errorCode)}
            </p>
          ) : null}
        </div>
        <Sparkline values={snap.series.map((s) => visibleValue(s.value, s.state))} />
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

/** A stale/error/missing point is rendered as a gap in the sparkline. */
function visibleValue(v: number | null, state: KpiPointState): number | null {
  if (state === "ok") return v;
  return null;
}

function badgeForState(
  state: KpiPointState,
  _errorCode: string | null,
): { label: string; tone: string; title: string } | null {
  if (state === "ok") return null;
  if (state === "stale") {
    return {
      label: "stale",
      tone: "bg-amber-100 text-amber-800",
      title: "Last successful compute; not refreshed this hour.",
    };
  }
  if (state === "error") {
    return {
      label: "unavailable",
      tone: "bg-rose-100 text-rose-800",
      title: "Derivation failed; see error code below the value.",
    };
  }
  // missing
  return {
    label: "no data",
    tone: "bg-slate-100 text-slate-700",
    title: "No rollup row for today yet.",
  };
}

/**
 * Human-readable reason to sit under the "—" placeholder. Uses the
 * error_code when present, otherwise a generic sentence per state.
 */
function unavailableReason(
  state: KpiPointState,
  errorCode: string | null,
): string {
  if (state === "error") {
    switch (errorCode) {
      case "no_derivation_wired":
        return "Not yet wired to a data source.";
      case "schema_not_ready":
        return "Waiting for a database migration to apply.";
      case "permission_denied":
        return "Service role can't read the source table.";
      case "timeout":
        return "Source query timed out this hour.";
      case "db_error":
        return "Database error while computing this hour.";
      case "bookings_read_returned_null":
        return "No response from the bookings read.";
      default:
        return errorCode
          ? `Unavailable (${errorCode}).`
          : "Unavailable this hour.";
    }
  }
  if (state === "stale") return "Showing last known good value; not refreshed.";
  return "No rollup for today yet.";
}
