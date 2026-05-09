import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payout history — SpecialCarer" };

type PayoutRow = {
  id: string;
  kind: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  status: string;
  failure_reason: string | null;
  requested_at: string;
  paid_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  requested: "bg-amber-50 text-amber-800 border-amber-200",
  processing: "bg-sky-50 text-sky-800 border-sky-200",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export default async function PayoutHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/earnings/history");

  const { data } = await supabase
    .from("payout_intents")
    .select(
      "id, kind, amount_cents, fee_cents, currency, status, failure_reason, requested_at, paid_at",
    )
    .eq("carer_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as PayoutRow[];

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Payout history" back="/m/earnings" />
      <div className="px-5 pt-3 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-card border border-line bg-white p-5 text-center">
            <p className="text-[14px] text-heading font-semibold">
              No payouts yet
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              Your weekly direct deposits and any instant cash-outs will
              show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const net = r.amount_cents - r.fee_cents;
              return (
                <li
                  key={r.id}
                  className="rounded-card border border-line bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-heading">
                        {r.kind === "instant"
                          ? "Instant payout"
                          : r.kind === "weekly"
                            ? "Weekly payout"
                            : "Manual payout"}
                      </p>
                      <p className="text-[11px] text-subheading">
                        {new Date(r.requested_at).toLocaleString("en-GB")}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.requested}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 text-[12px] gap-2">
                    <div>
                      <p className="text-subheading">Gross</p>
                      <p className="text-heading font-semibold tabular-nums">
                        {fmtMoney(r.amount_cents, r.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-subheading">Fee</p>
                      <p className="text-heading font-semibold tabular-nums">
                        {fmtMoney(r.fee_cents, r.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-subheading">Net</p>
                      <p className="text-primary font-bold tabular-nums">
                        {fmtMoney(net, r.currency)}
                      </p>
                    </div>
                  </div>
                  {r.failure_reason && (
                    <p className="mt-2 text-[11px] text-rose-700">
                      {r.failure_reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
