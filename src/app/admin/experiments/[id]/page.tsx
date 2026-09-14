import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeExperimentReadout,
  type DailyRollup,
} from "@/lib/experiments/readout";

export const dynamic = "force-dynamic";

/**
 * /admin/experiments/[id]
 *
 * Server-component readout for one A/B experiment. Reads the last
 * 30 days of `experiment_daily_rollup`, groups by arm, and prints:
 *   • total n per arm
 *   • accept rate per arm
 *   • absolute delta with 95% CI (Wald)
 *   • MDE status text
 *
 * No charts — the E3 brief calls this out explicitly.
 *
 * Auth: `requireAdmin()` bounces non-admins the same way every other
 * admin page does (defence-in-depth against the middleware being
 * bypassed by direct RSC fetches).
 */
export default async function ExperimentReadoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: exp }, { data: rollups }] = await Promise.all([
    admin
      .from("match_experiments")
      .select("id, description, active, created_at, activated_at, concluded_at")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("experiment_daily_rollup")
      .select("day, variant, n_offers, n_accepted, n_declined, n_expired")
      .eq("experiment_id", id)
      .gte(
        "day",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      )
      .order("day", { ascending: false }),
  ]);

  if (!exp) notFound();

  const rows: DailyRollup[] = (rollups ?? []).map((r) => ({
    day: r.day as string,
    variant: r.variant as "control" | "treatment",
    n_offers: Number(r.n_offers ?? 0),
    n_accepted: Number(r.n_accepted ?? 0),
    n_declined: Number(r.n_declined ?? 0),
    n_expired: Number(r.n_expired ?? 0),
  }));

  const readout = computeExperimentReadout(rows);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          Experiment: {exp.id}
        </h1>
        {exp.description ? (
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {exp.description}
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Status</dt>
            <dd>
              {exp.active ? (
                <span className="text-[#039EA0]">Active</span>
              ) : (
                <span>Inactive</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Created</dt>
            <dd>{formatDate(exp.created_at as string | null)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Activated</dt>
            <dd>{formatDate(exp.activated_at as string | null)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Concluded</dt>
            <dd>{formatDate(exp.concluded_at as string | null)}</dd>
          </div>
        </dl>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Per-arm accept-rate (last 30 days)
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Arm</th>
                <th className="px-4 py-2 text-right">Offers</th>
                <th className="px-4 py-2 text-right">Accepted</th>
                <th className="px-4 py-2 text-right">Declined</th>
                <th className="px-4 py-2 text-right">Expired</th>
                <th className="px-4 py-2 text-right">Accept rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(["control", "treatment"] as const).map((arm) => {
                const a = readout.arms[arm];
                return (
                  <tr key={arm}>
                    <td className="px-4 py-2 font-medium capitalize">{arm}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {a.n_offers.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {a.n_accepted.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {a.n_declined.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {a.n_expired.toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {a.denominator > 0
                        ? `${(a.accept_rate * 100).toFixed(2)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Treatment vs control
        </h2>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 space-y-2">
          {readout.delta.available ? (
            <>
              <p>
                Absolute delta (treatment − control):{" "}
                <span className="font-semibold tabular-nums">
                  {formatPp(readout.delta.value)}
                </span>
              </p>
              <p>
                95% CI (Wald):{" "}
                <span className="tabular-nums">
                  [{formatPp(readout.delta.ciLow)},{" "}
                  {formatPp(readout.delta.ciHigh)}]
                </span>
              </p>
              <p className="text-slate-500">
                CI is a normal-approximation (Wald) two-proportion interval —
                fine for a sanity read once each arm has {">"}~30 events.
                Don't treat it as a stopping rule.
              </p>
            </>
          ) : (
            <p className="text-slate-500">
              Not enough data to compute a delta yet. Both arms need at
              least one offer with a resolved status (accepted / declined /
              expired).
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">MDE status</h2>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p>
            Need ~1,200 offers per arm for a 5pp lift @ 80% power / α = 0.05.
            Current: control{" "}
            <span className="font-semibold tabular-nums">
              N = {readout.arms.control.n_offers.toLocaleString("en-GB")}
            </span>
            , treatment{" "}
            <span className="font-semibold tabular-nums">
              N = {readout.arms.treatment.n_offers.toLocaleString("en-GB")}
            </span>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPp(v: number): string {
  const pp = v * 100;
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(2)}pp`;
}
