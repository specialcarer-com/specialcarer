import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYOUT_STATUSES, type PayoutStatus } from "@/lib/admin-ops/types";
import FinanceTabs from "../_tabs";
import ReleaseButton from "./ReleaseButton";

export const dynamic = "force-dynamic";

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
