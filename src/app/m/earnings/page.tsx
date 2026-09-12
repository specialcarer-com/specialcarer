import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar, BottomNav } from "../_components/ui";
import EarningsClient from "./EarningsClient";
import EarningsV1Client from "./EarningsV1Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Earnings — SpecialCarer" };

// Postgres error code for undefined_table — the payout_alerts table
// may not yet exist during the deploy window before migration
// 20260912154500 is applied. Treat as "no alerts" and render nothing.
const PG_UNDEFINED_TABLE = "42P01";

type AlertBannerRow = {
  id: string;
  alert_type: string;
  amount_cents: number | null;
  currency: string;
  state: string;
  created_at: string;
};

async function loadOpenAlerts(userId: string): Promise<AlertBannerRow[]> {
  // Read via the service-role client — payout_alerts RLS denies
  // anon/authenticated (service-role only, same pattern as
  // stripe_dispute_cases). We scope the query to the logged-in carer
  // explicitly with .eq("carer_id", userId) — nothing else is read.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payout_alerts")
    .select("id, alert_type, amount_cents, currency, state, created_at")
    .eq("carer_id", userId)
    .in("state", ["new", "notified", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === PG_UNDEFINED_TABLE) return [];
    console.warn("[m/earnings] payout_alerts read failed", error);
    return [];
  }
  return (data ?? []) as AlertBannerRow[];
}

function formatMoney(pence: number | null, currency: string): string {
  if (pence == null) return "—";
  const up = (currency ?? "gbp").toUpperCase();
  const symbol =
    up === "GBP" ? "£" : up === "USD" ? "$" : up === "EUR" ? "€" : `${up} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

function alertLabel(alertType: string): string {
  switch (alertType) {
    case "failed":
      return "couldn't be sent";
    case "delayed":
      return "is delayed";
    case "held_dispute":
      return "is on hold — under review";
    case "held_dbs":
      return "is on hold — DBS check needed";
    default:
      return "needs attention";
  }
}

export default async function EarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/earnings");

  // Fetch open payout alerts for this carer. Renders no banner section
  // at all when the list is empty (per acceptance criterion 5) —
  // banner is conditional, not an empty div.
  const alerts = await loadOpenAlerts(user.id);

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Earnings" back="/m/profile" />
      {alerts.length > 0 ? (
        <div className="px-5 pt-3">
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
            data-testid="payout-alerts-banner"
          >
            <p className="text-sm font-semibold text-rose-900">
              {alerts.length === 1
                ? "There's a payout that needs your attention"
                : `${alerts.length} payouts need your attention`}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-rose-800">
              {alerts.slice(0, 3).map((a) => (
                <li key={a.id}>
                  {formatMoney(a.amount_cents, a.currency)} —{" "}
                  {alertLabel(a.alert_type)}
                </li>
              ))}
              {alerts.length > 3 ? (
                <li className="text-xs text-rose-700">
                  +{alerts.length - 3} more
                </li>
              ) : null}
            </ul>
            <p className="mt-3 text-xs text-rose-700">
              Check your bank details or contact support if this looks wrong.
            </p>
          </div>
        </div>
      ) : null}
      <div className="px-5 pt-3">
        <EarningsV1Client />
      </div>
      <EarningsClient />
      <BottomNav active="jobs" role="carer" />
    </div>
  );
}
