import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Snap = {
  city_slug: string;
  vertical: string;
  demand_score: number;
  supply_score: number;
  fill_rate: number;
  taken_at: string;
  hour_of_day: number;
};

const VERTICALS = [
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
] as const;

function fillTone(rate: number): { bg: string; fg: string } {
  // Lower fill rate = hotter colour (more demand than supply).
  if (rate < 0.5) return { bg: "bg-rose-100", fg: "text-rose-900" };
  if (rate < 0.7) return { bg: "bg-amber-100", fg: "text-amber-900" };
  if (rate < 0.85) return { bg: "bg-yellow-50", fg: "text-yellow-900" };
  return { bg: "bg-emerald-50", fg: "text-emerald-900" };
}

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const window = sp.window === "7d" ? "7d" : "24h";
  const since = new Date();
  if (window === "7d") since.setDate(since.getDate() - 7);
  else since.setHours(since.getHours() - 24);

  const admin = createAdminClient();
  const { data } = await admin
    .from("marketplace_demand_snapshots")
    .select(
      "city_slug, vertical, demand_score, supply_score, fill_rate, taken_at, hour_of_day",
    )
    .gte("taken_at", since.toISOString())
    .order("taken_at", { ascending: false })
    .limit(2000);
  const rows = (data ?? []) as Snap[];

  // Latest per (city, vertical)
  const latest = new Map<string, Snap>();
  for (const r of rows) {
    const k = `${r.city_slug}|${r.vertical}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  const cities = Array.from(
    new Set(rows.map((r) => r.city_slug)),
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Marketplace heatmap
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Latest demand vs supply per city × vertical. Window:{" "}
            <strong>{window}</strong>. Lower fill rate = hotter colour.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["24h", "7d"] as const).map((w) => (
            <Link
              key={w}
              href={`/admin/ops/heatmap?window=${w}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                window === w
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              {w}
            </Link>
          ))}
        </div>
      </div>

      {cities.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No snapshots in this window. Seeded demo rows are visible after the
          migration applies; live snapshots arrive once the demand-snapshot
          worker is wired up.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">City</th>
                {VERTICALS.map((v) => (
                  <th key={v} className="text-left px-3 py-2">
                    {v.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr key={city} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">
                    {city}
                  </td>
                  {VERTICALS.map((v) => {
                    const s = latest.get(`${city}|${v}`);
                    if (!s) {
                      return (
                        <td key={v} className="px-3 py-2.5 text-slate-300">
                          —
                        </td>
                      );
                    }
                    const tone = fillTone(s.fill_rate);
                    return (
                      <td key={v} className="px-3 py-2.5">
                        <div
                          className={`inline-flex flex-col gap-0.5 rounded-md px-2.5 py-1.5 ${tone.bg} ${tone.fg}`}
                        >
                          <span className="text-[11px] font-bold">
                            {(s.fill_rate * 100).toFixed(0)}% fill
                          </span>
                          <span className="text-[10px]">
                            d {s.demand_score.toFixed(1)} · s{" "}
                            {s.supply_score.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Auto-surge logic runs from /api/cron/surge-recompute (hourly).
        Manual rules at{" "}
        <Link
          href="/admin/ops/surge"
          className="text-teal-700 hover:underline"
        >
          /admin/ops/surge
        </Link>{" "}
        always override the auto pass.
      </p>
    </div>
  );
}
