import {
  getSignupCohorts,
  getFunnel,
  getRetention,
} from "@/lib/admin/analytics";
import KpiSnapshot from "./KpiSnapshot";

export const dynamic = "force-dynamic";

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}
function fmtWeek(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export default async function AdminAnalyticsPage() {
  const [cohorts, funnel, retention] = await Promise.all([
    getSignupCohorts(12),
    getFunnel(),
    getRetention(4),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Signup cohorts, conversion funnel, and 4-week activation retention.
          All values computed live from <code>auth.users</code>,{" "}
          <code>profiles</code>, and <code>bookings</code>.
        </p>
      </div>

      {/* KPI snapshot — added in Admin Ops 3.12. */}
      <KpiSnapshot />

      {/* Funnel */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Conversion funnel
        </h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          {funnel.map((step, i) => {
            const widthPct = Math.max(2, step.pct_of_top * 100);
            const prev = funnel[i - 1];
            const stepConv =
              prev && prev.count > 0 ? step.count / prev.count : 1;
            return (
              <div key={step.label} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-slate-800">
                    {step.label}
                  </span>
                  <span className="text-slate-500 text-xs">
                    <span className="font-semibold text-slate-900">
                      {step.count.toLocaleString()}
                    </span>
                    <span> · </span>
                    <span>{fmtPct(step.pct_of_top)} of signups</span>
                    {i > 0 && (
                      <span className="text-slate-400">
                        {" "}
                        · {fmtPct(stepConv)} step conv.
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Signup cohorts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Signup cohorts (last 12 weeks)
        </h2>
        {cohorts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No signups in the last 12 weeks.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">
                    Week beginning
                  </th>
                  <th className="text-right px-4 py-2 font-medium">Signups</th>
                  <th className="text-right px-4 py-2 font-medium">Seekers</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Caregivers
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Mix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cohorts.map((c) => {
                  const pctCare =
                    c.signups === 0 ? 0 : c.caregivers / c.signups;
                  return (
                    <tr key={c.week} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {fmtWeek(c.week)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">
                        {c.signups}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {c.seekers}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {c.caregivers}
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${pctCare * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Retention */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          4-week activation retention
        </h2>
        <p className="text-xs text-slate-500">
          A user is &quot;active&quot; in week N if they appear on a booking
          (as seeker or caregiver) in that week. Cohorts are weekly.
        </p>
        {retention.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Not enough data yet to compute retention.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Cohort</th>
                  <th className="text-right px-4 py-2 font-medium">Size</th>
                  <th className="text-right px-4 py-2 font-medium">W1</th>
                  <th className="text-right px-4 py-2 font-medium">W2</th>
                  <th className="text-right px-4 py-2 font-medium">W3</th>
                  <th className="text-right px-4 py-2 font-medium">W4</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {retention.map((r) => {
                  const pct = (n: number) =>
                    r.cohort_size === 0 ? 0 : n / r.cohort_size;
                  function cell(n: number) {
                    const p = pct(n);
                    const tone =
                      p >= 0.3
                        ? "bg-emerald-100 text-emerald-800"
                        : p >= 0.15
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-50 text-slate-700";
                    return (
                      <span
                        className={`inline-block min-w-[48px] text-center px-2 py-0.5 rounded-md text-xs font-medium ${tone}`}
                      >
                        {n} · {fmtPct(p)}
                      </span>
                    );
                  }
                  return (
                    <tr key={r.cohort_week} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {fmtWeek(r.cohort_week)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {r.cohort_size}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {cell(r.w1_retained)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {cell(r.w2_retained)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {cell(r.w3_retained)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {cell(r.w4_retained)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
