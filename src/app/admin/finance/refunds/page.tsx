import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import FinanceTabs from "../_tabs";

export const dynamic = "force-dynamic";

/**
 * E1 — Admin refund reconciliation dashboard (read-only).
 *
 * Shows the state distribution + a table of the most recent mismatched
 * cases. Read-only by design — no links to Stripe, no action buttons —
 * so it can ship behind requireAdmin() alone. The route is reachable
 * for any admin who knows the URL; the NEXT_PUBLIC_ADMIN_FINANCE_V2
 * flag only hides the nav link.
 *
 * Server component. Uses the service-role admin client because
 * `refund_reconciliation` has no RLS (mirrors refund_ledger and
 * stripe_webhook_events — all populated by service-role only).
 * `requireAdmin()` is the auth gate.
 */

type StateCounter = {
  initiated: number;
  partial: number;
  fully_refunded: number;
  mismatch: number;
  reconciled: number;
};

type MismatchRow = {
  stripe_refund_id: string;
  booking_id: string | null;
  mismatch_reason: string | null;
  initiated_at: string;
};

const STATE_LABELS: Record<keyof StateCounter, string> = {
  initiated: "Initiated",
  partial: "Partial",
  fully_refunded: "Fully refunded",
  mismatch: "Mismatch",
  reconciled: "Reconciled",
};

// Same tone vocabulary as the disputes page, adapted for reconciliation.
const TONE: Record<keyof StateCounter, string> = {
  initiated: "bg-slate-50 text-slate-800 border-slate-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  fully_refunded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  mismatch: "bg-rose-50 text-rose-800 border-rose-200",
  reconciled: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

function isSchemaNotReady(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) return true;
  const msg = (err as { message?: string } | null)?.message ?? "";
  return /refund_reconciliation.*does not exist/i.test(msg);
}

export default async function RefundReconciliationPage() {
  await requireAdmin();
  const admin = createAdminClient();

  let counters: StateCounter = {
    initiated: 0,
    partial: 0,
    fully_refunded: 0,
    mismatch: 0,
    reconciled: 0,
  };
  let mismatches: MismatchRow[] = [];
  let schemaMissing = false;

  const { data: countRows, error: countErr } = await admin
    .from("refund_reconciliation")
    .select("state");

  if (countErr) {
    if (isSchemaNotReady(countErr)) {
      schemaMissing = true;
    } else {
      throw new Error(countErr.message);
    }
  } else {
    for (const r of countRows ?? []) {
      const s = (r.state as keyof StateCounter | null) ?? null;
      if (s && s in counters) counters[s] += 1;
    }
  }

  if (!schemaMissing) {
    const { data: mismatchData, error: mismatchErr } = await admin
      .from("refund_reconciliation")
      .select("stripe_refund_id, booking_id, mismatch_reason, initiated_at")
      .eq("state", "mismatch")
      .order("initiated_at", { ascending: false })
      .limit(50);
    if (mismatchErr) {
      if (isSchemaNotReady(mismatchErr)) {
        schemaMissing = true;
      } else {
        throw new Error(mismatchErr.message);
      }
    } else {
      mismatches = (mismatchData ?? []) as MismatchRow[];
    }
  }

  return (
    <div className="space-y-6 p-6">
      <FinanceTabs active="/admin/finance/refunds" />

      <header>
        <h1 className="text-lg font-semibold text-slate-900">
          Refund reconciliation
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          State machine derived from{" "}
          <code className="text-xs">refund_ledger</code>. Populated hourly by{" "}
          <code className="text-xs">/api/cron/refund-reconciliation</code>.
          Read-only.
        </p>
      </header>

      {schemaMissing ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          The <code>refund_reconciliation</code> table is not present yet.
          The migration will apply on the next deploy and this page will
          populate on the next hourly cron cycle.
        </div>
      ) : (
        <>
          <section aria-labelledby="counters" className="space-y-2">
            <h2
              id="counters"
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              State distribution
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(
                [
                  "initiated",
                  "partial",
                  "fully_refunded",
                  "mismatch",
                  "reconciled",
                ] as const
              ).map((k) => (
                <div
                  key={k}
                  className={`rounded-lg border p-3 ${TONE[k]}`}
                  data-testid={`counter-${k}`}
                >
                  <div className="text-xs font-medium">{STATE_LABELS[k]}</div>
                  <div className="text-2xl font-semibold tabular-nums mt-1">
                    {counters[k]}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="mismatches" className="space-y-2">
            <h2
              id="mismatches"
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              Recent mismatches (last 50)
            </h2>
            {mismatches.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                No mismatches recorded.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">
                        Refund id
                      </th>
                      <th className="text-left px-3 py-2 font-medium">
                        Booking id
                      </th>
                      <th className="text-left px-3 py-2 font-medium">
                        Reason
                      </th>
                      <th className="text-left px-3 py-2 font-medium">
                        Initiated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mismatches.map((row) => (
                      <tr key={row.stripe_refund_id}>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.stripe_refund_id}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.booking_id ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.mismatch_reason ?? "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(row.initiated_at).toISOString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
