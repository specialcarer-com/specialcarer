import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import SurgeRuleForm from "./SurgeRuleForm";
import SurgeRuleRow from "./SurgeRuleRow";

export const dynamic = "force-dynamic";

type Rule = {
  id: string;
  city_slug: string;
  vertical: string;
  multiplier: number;
  active: boolean;
  created_at: string;
};

type Event = {
  id: string;
  city_slug: string;
  vertical: string;
  multiplier: number;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
  rule_id: string | null;
};

export default async function SurgePage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: rules }, { data: openEvents }, { data: recent }] =
    await Promise.all([
      admin
        .from("surge_rules")
        .select(
          "id, city_slug, vertical, multiplier, active, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("surge_events")
        .select(
          "id, city_slug, vertical, multiplier, started_at, ended_at, reason, rule_id",
        )
        .is("ended_at", null)
        .order("started_at", { ascending: false }),
      admin
        .from("surge_events")
        .select(
          "id, city_slug, vertical, multiplier, started_at, ended_at, reason, rule_id",
        )
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(20),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Surge rules</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manual rules per (city, vertical) override auto-surge. Multiplier is
          capped at 1.5×. Auto-events are opened by{" "}
          <code className="text-[11px]">/api/cron/surge-recompute</code>.
        </p>
      </div>

      <SurgeRuleForm />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Active surge events ({(openEvents ?? []).length})
        </h2>
        {(openEvents ?? []).length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No active surge events.
          </div>
        ) : (
          <ul className="space-y-2">
            {((openEvents ?? []) as Event[]).map((e) => (
              <li
                key={e.id}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-amber-900">
                    {e.city_slug} · {e.vertical} · ×{Number(e.multiplier).toFixed(2)}
                  </p>
                  <span className="text-[11px] text-amber-800">
                    {e.rule_id ? "Manual" : "Auto"}
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Started {new Date(e.started_at).toLocaleString("en-GB")}
                  {e.reason && ` · ${e.reason}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Manual rules ({(rules ?? []).length})
        </h2>
        {(rules ?? []).length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No manual rules yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {((rules ?? []) as Rule[]).map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {r.city_slug} · {r.vertical}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Created{" "}
                      {new Date(r.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      r.active
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {r.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <SurgeRuleRow
                  ruleId={r.id}
                  initialMultiplier={Number(r.multiplier)}
                  initialActive={r.active}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Recently ended ({(recent ?? []).length})
        </h2>
        {(recent ?? []).length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            None yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {((recent ?? []) as Event[]).map((e) => (
              <li
                key={e.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-sm"
              >
                <p className="font-semibold text-slate-900">
                  {e.city_slug} · {e.vertical} · ×{Number(e.multiplier).toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(e.started_at).toLocaleString("en-GB")} →{" "}
                  {e.ended_at
                    ? new Date(e.ended_at).toLocaleString("en-GB")
                    : "open"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="pt-2 text-xs text-slate-500">
        See live demand mix at{" "}
        <Link
          href="/admin/ops/heatmap"
          className="text-teal-700 hover:underline"
        >
          /admin/ops/heatmap
        </Link>
        .
      </p>
    </div>
  );
}
