import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYOUT_STATUSES, type PayoutStatus } from "@/lib/admin-ops/types";
import FinanceTabs from "../_tabs";
import ReleaseButton from "./ReleaseButton";

export const dynamic = "force-dynamic";

// Postgres error code for undefined_table — the payout_alerts table
// (C4 migration 20260912154500) may not yet exist during the deploy
// window. When absent, the alerts panel simply hides itself.
const PG_UNDEFINED_TABLE = "42P01";

type AlertAggregate = {
  alert_type: string;
  count: number;
};

type AlertDetailRow = {
  id: string;
  carer_id: string;
  alert_type: string;
  state: string;
  created_at: string;
  amount_cents: number | null;
  currency: string;
};

async function loadAlertsPanel(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{
  aggregate: AlertAggregate[];
  recent: AlertDetailRow[];
  nameById: Map<string, string | null>;
  schemaMissing: boolean;
} | null> {
  // Pull all open (non-resolved) alerts in one small query — the
  // partial index (carer_id, state, created_at desc) makes this cheap.
  // We cap the projection so a runaway table doesn't OOM the render.
  const { data, error } = await admin
    .from("payout_alerts")
    .select(
      "id, carer_id, alert_type, state, created_at, amount_cents, currency",
    )
    .neq("state", "resolved")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === PG_UNDEFINED_TABLE) {
      return { aggregate: [], recent: [], nameById: new Map(), schemaMissing: true };
    }
    console.warn("[admin/finance/payouts] alerts read failed", error);
    return null;
  }
  const rows = (data ?? []) as AlertDetailRow[];
  const byType = new Map<string, number>();
  for (const r of rows) {
    byType.set(r.alert_type, (byType.get(r.alert_type) ?? 0) + 1);
  }
  const aggregate = Array.from(byType.entries())
    .map(([alert_type, count]) => ({ alert_type, count }))
    .sort((a, b) => b.count - a.count);

  const carerIds = Array.from(new Set(rows.map((r) => r.carer_id)));
  const nameById = new Map<string, string | null>();
  if (carerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", carerIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      nameById.set(p.id, p.full_name ?? null);
    }
  }

  return {
    aggregate,
    recent: rows.slice(0, 25),
    nameById,
    schemaMissing: false,
  };
}

function formatMoneyPence(pence: number | null, currency: string): string {
  if (pence == null) return "—";
  const up = (currency ?? "gbp").toUpperCase();
  const symbol =
    up === "GBP" ? "£" : up === "USD" ? "$" : up === "EUR" ? "€" : `${up} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

type Row = {
  id: string;
  caregiver_id: string;
  period_start: string;
  period_end: string;
  gross: number;
  fees: number;
  net: number;
  status: PayoutStatus;
  scheduled_for: string | null;
  paid_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<PayoutStatus, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  processing: "bg-sky-50 text-sky-800 border-sky-200",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
  on_hold: "bg-slate-100 text-slate-700 border-slate-200",
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "all";

  const admin = createAdminClient();

  // C4 alerts panel — deploy-safe if the table isn't there yet.
  const alertsPanel = await loadAlertsPanel(admin);

  let q = admin
    .from("payouts")
    .select(
      "id, caregiver_id, period_start, period_end, gross, fees, net, status, scheduled_for, paid_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (
    status !== "all" &&
    (PAYOUT_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  // Resolve caregiver names in one batch.
  const ids = Array.from(new Set(rows.map((r) => r.caregiver_id)));
  let nameById = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    nameById = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        (p.full_name ?? null) as string | null,
      ]),
    );
  }

  return (
    <div className="space-y-6">
      <FinanceTabs active="/admin/finance/payouts" />

      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Payouts</h1>
        <p className="text-sm text-slate-500 mt-1">
          Period-bucketed caregiver payouts. The release button steps a row
          from <code>pending</code> → <code>processing</code>; real money
          movement happens via the Stripe pipeline.
        </p>
      </div>

      {alertsPanel && !alertsPanel.schemaMissing && alertsPanel.recent.length > 0 ? (
        <section
          aria-labelledby="payout-alerts-heading"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
        >
          <div className="flex items-baseline justify-between">
            <h2
              id="payout-alerts-heading"
              className="text-sm font-semibold text-rose-900"
            >
              Payout alerts — open
            </h2>
            <span className="text-xs text-rose-700">
              {alertsPanel.recent.length} shown
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {alertsPanel.aggregate.map((a) => (
              <span
                key={a.alert_type}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-rose-800"
              >
                {a.alert_type}: {a.count}
              </span>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-rose-100 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-rose-50/60 text-[10px] uppercase tracking-wide text-rose-700">
                <tr>
                  <th className="text-left px-3 py-2">Carer</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">State</th>
                  <th className="text-left px-3 py-2">Opened</th>
                </tr>
              </thead>
              <tbody>
                {alertsPanel.recent.map((r) => (
                  <tr key={r.id} className="border-t border-rose-100">
                    <td className="px-3 py-2 text-slate-800">
                      {alertsPanel.nameById.get(r.carer_id) ??
                        r.carer_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.alert_type}</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatMoneyPence(r.amount_cents, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{r.state}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(r.created_at).toLocaleString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...PAYOUT_STATUSES] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/finance/payouts?status=${s}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              status === s
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No payouts in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Caregiver</th>
                <th className="text-left px-4 py-2.5">Period</th>
                <th className="text-right px-4 py-2.5">Gross</th>
                <th className="text-right px-4 py-2.5">Fees</th>
                <th className="text-right px-4 py-2.5">Net</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Scheduled</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {nameById.get(r.caregiver_id) ??
                        r.caregiver_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {r.caregiver_id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {new Date(r.period_start).toLocaleDateString("en-GB")}
                    {" – "}
                    {new Date(r.period_end).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {fmtMoney(r.gross)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {fmtMoney(r.fees)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {fmtMoney(r.net)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.scheduled_for
                      ? new Date(r.scheduled_for).toLocaleString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ReleaseButton
                      payoutId={r.id}
                      disabled={r.status !== "pending"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
