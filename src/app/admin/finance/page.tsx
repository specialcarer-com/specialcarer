import { getFinanceSnapshot, fmtMoney } from "@/lib/admin/finance";

export const dynamic = "force-dynamic";

function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const ring =
    tone === "danger"
      ? "border-rose-200 bg-rose-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : tone === "good"
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border ${ring} p-4`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default async function AdminFinancePage() {
  const { blocks, generated_at } = await getFinanceSnapshot();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Finance</h1>
        <p className="text-sm text-slate-500 mt-1">
          GMV, platform fee revenue, payout schedule, and refund metrics by
          currency. SpecialCarer charges a 30% platform fee and holds funds
          until the shift completes plus a 24-hour cool-off window.
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Snapshot generated {new Date(generated_at).toLocaleString("en-GB")}
        </p>
      </div>

      {blocks.map((b) => {
        const flag = b.currency === "gbp" ? "🇬🇧 GBP (UK)" : "🇺🇸 USD (US)";
        return (
          <section key={b.currency} className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">{flag}</h2>

            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Gross Merchandise Value (paid bookings, ex-refunds)
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Today"
                  value={fmtMoney(b.gmv_today_cents, b.currency)}
                />
                <KpiCard
                  label="Last 7 days"
                  value={fmtMoney(b.gmv_7d_cents, b.currency)}
                />
                <KpiCard
                  label="Last 30 days"
                  value={fmtMoney(b.gmv_30d_cents, b.currency)}
                />
                <KpiCard
                  label="Month-to-date"
                  value={fmtMoney(b.gmv_mtd_cents, b.currency)}
                />
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Platform fee revenue (30% of GMV)
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Today"
                  value={fmtMoney(b.fees_today_cents, b.currency)}
                />
                <KpiCard
                  label="Last 7 days"
                  value={fmtMoney(b.fees_7d_cents, b.currency)}
                />
                <KpiCard
                  label="Last 30 days"
                  value={fmtMoney(b.fees_30d_cents, b.currency)}
                  tone="good"
                />
                <KpiCard
                  label="Month-to-date"
                  value={fmtMoney(b.fees_mtd_cents, b.currency)}
                  tone="good"
                />
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Payout schedule
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Eligible now"
                  value={fmtMoney(b.eligible_now_cents, b.currency)}
                  sub={`${b.eligible_now_count} booking${b.eligible_now_count === 1 ? "" : "s"} ready to release`}
                  tone={b.eligible_now_count > 0 ? "good" : "default"}
                />
                <KpiCard
                  label="Held (cool-off)"
                  value={fmtMoney(b.held_cents, b.currency)}
                  sub={`${b.held_count} booking${b.held_count === 1 ? "" : "s"} within 24h hold`}
                />
                <KpiCard
                  label="Overdue (>24h)"
                  value={fmtMoney(b.overdue_cents, b.currency)}
                  sub={`${b.overdue_count} eligible >24h ago`}
                  tone={b.overdue_count > 0 ? "danger" : "default"}
                />
                <KpiCard
                  label="Paid out · 30d"
                  value={fmtMoney(b.paid_out_30d_cents, b.currency)}
                  sub={`${b.paid_out_30d_count} payout${b.paid_out_30d_count === 1 ? "" : "s"} in last 30d`}
                />
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Refunds &amp; reconciliation
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <KpiCard
                  label="Refunded · 30d"
                  value={fmtMoney(b.refunded_30d_cents, b.currency)}
                  sub={`${b.refunded_30d_count} refund${b.refunded_30d_count === 1 ? "" : "s"}`}
                  tone={b.refunded_30d_count > 5 ? "warn" : "default"}
                />
                <KpiCard
                  label="Refund rate · 30d"
                  value={`${(b.refund_rate_30d * 100).toFixed(1)}%`}
                  sub="refunds ÷ paid bookings"
                  tone={
                    b.refund_rate_30d > 0.05
                      ? "danger"
                      : b.refund_rate_30d > 0.02
                        ? "warn"
                        : "default"
                  }
                />
                <KpiCard
                  label="Net retained · 30d"
                  value={fmtMoney(
                    b.fees_30d_cents -
                      Math.round(b.refunded_30d_cents * 0.3),
                    b.currency,
                  )}
                  sub="fees minus est. refunded fees"
                />
              </div>
            </div>
          </section>
        );
      })}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Notes:</span> GMV
        excludes <code>refunded</code> and <code>cancelled</code> bookings.
        Payout schedule reflects the daily cron at <code>02:00 UTC</code>.
        Currency reconciliation is per-ledger — UK and US Stripe balances
        settle independently. All figures pulled live from the bookings ledger.
      </div>
    </div>
  );
}
