import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CAREGIVER_STAGES,
  CAREGIVER_STAGE_LABEL,
  type CaregiverStage,
} from "@/lib/admin-ops/types";
import StageMover from "./StageMover";

export const dynamic = "force-dynamic";

type Row = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  country: string | null;
  application_stage: CaregiverStage;
  stage_entered_at: string;
  created_at: string;
};

type StageHistoryRow = {
  caregiver_id: string;
  to_stage: CaregiverStage;
  moved_at: string;
};

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

const STAGE_TONE: Record<CaregiverStage, string> = {
  applied: "bg-slate-50 border-slate-200",
  screening: "bg-sky-50 border-sky-200",
  interview: "bg-indigo-50 border-indigo-200",
  background_check: "bg-amber-50 border-amber-200",
  training: "bg-violet-50 border-violet-200",
  activated: "bg-emerald-50 border-emerald-200",
  rejected: "bg-rose-50 border-rose-200",
};

export default async function CaregiverPipelinePage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, city, country, application_stage, stage_entered_at, created_at",
    )
    .order("stage_entered_at", { ascending: false })
    .limit(500);
  const list = (rows ?? []) as Row[];

  // Cycle-time per stage = average days between consecutive transitions
  // INTO that stage. Computed across the latest 1000 stage_history rows.
  const { data: hist } = await admin
    .from("caregiver_stage_history")
    .select("caregiver_id, to_stage, moved_at")
    .order("moved_at", { ascending: true })
    .limit(1000);
  const cycleByStage = computeCycleTimes((hist ?? []) as StageHistoryRow[]);

  const grouped = CAREGIVER_STAGES.map((s) => ({
    stage: s,
    rows: list.filter((r) => r.application_stage === s),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Caregiver application pipeline
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {list.length} caregivers across 7 stages. Move a card by picking a
          new stage from its dropdown — every change is logged to the audit
          log and to caregiver_stage_history.
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col auto-cols-[260px] gap-3">
          {grouped.map(({ stage, rows: stageRows }) => (
            <section
              key={stage}
              className="rounded-2xl border border-slate-200 bg-white"
            >
              <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {CAREGIVER_STAGE_LABEL[stage]}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {stageRows.length} ·{" "}
                    {cycleByStage[stage] != null
                      ? `${cycleByStage[stage]?.toFixed(1)}d avg`
                      : "—"}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">
                  {stageRows.length}
                </span>
              </header>
              <ul className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {stageRows.length === 0 ? (
                  <li className="text-xs text-slate-400 italic px-2 py-3">
                    No-one in this stage.
                  </li>
                ) : (
                  stageRows.map((r) => (
                    <li
                      key={r.user_id}
                      className={`rounded-xl border p-3 ${STAGE_TONE[stage]}`}
                    >
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {r.display_name ?? r.user_id.slice(0, 8)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {r.city ?? "—"}{" "}
                        {r.country ? `· ${r.country}` : ""}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Age in stage:{" "}
                        <strong className="text-slate-700">
                          {ageInDays(r.stage_entered_at)}d
                        </strong>
                      </p>
                      <Link
                        href={`/admin/caregivers/${r.user_id}`}
                        className="text-[11px] font-semibold text-slate-900 hover:underline"
                      >
                        Open profile →
                      </Link>
                      <StageMover
                        caregiverId={r.user_id}
                        currentStage={r.application_stage}
                      />
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="pt-4">
        <Link
          href="/admin/caregivers"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to caregivers
        </Link>
      </div>
    </div>
  );
}

/**
 * Compute average dwell time INTO each stage from the history. For
 * each caregiver, walk their history sorted by moved_at and tally
 * (next.moved_at - prev.moved_at) into prev.to_stage.
 */
function computeCycleTimes(
  rows: StageHistoryRow[],
): Partial<Record<CaregiverStage, number>> {
  const byCarer = new Map<string, StageHistoryRow[]>();
  for (const r of rows) {
    const arr = byCarer.get(r.caregiver_id) ?? [];
    arr.push(r);
    byCarer.set(r.caregiver_id, arr);
  }
  const totals = new Map<CaregiverStage, { days: number; n: number }>();
  for (const arr of byCarer.values()) {
    arr.sort((a, b) => a.moved_at.localeCompare(b.moved_at));
    for (let i = 0; i < arr.length - 1; i += 1) {
      const stage = arr[i].to_stage;
      const dt =
        (new Date(arr[i + 1].moved_at).getTime() -
          new Date(arr[i].moved_at).getTime()) /
        86400_000;
      const t = totals.get(stage) ?? { days: 0, n: 0 };
      t.days += dt;
      t.n += 1;
      totals.set(stage, t);
    }
  }
  const out: Partial<Record<CaregiverStage, number>> = {};
  for (const [stage, t] of totals.entries()) {
    out[stage] = t.n > 0 ? t.days / t.n : undefined;
  }
  return out;
}
