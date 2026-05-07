import { createAdminClient } from "@/lib/supabase/admin";

export type Currency = "gbp" | "usd";

export type FinanceCurrencyBlock = {
  currency: Currency;
  // GMV = total_cents on bookings paid (not refunded)
  gmv_today_cents: number;
  gmv_7d_cents: number;
  gmv_30d_cents: number;
  gmv_mtd_cents: number;
  // Platform fee revenue (sum of platform_fee_cents)
  fees_today_cents: number;
  fees_7d_cents: number;
  fees_30d_cents: number;
  fees_mtd_cents: number;
  // Payouts
  eligible_now_cents: number;
  eligible_now_count: number;
  held_cents: number;
  held_count: number;
  overdue_cents: number;
  overdue_count: number;
  paid_out_30d_cents: number;
  paid_out_30d_count: number;
  // Refunds
  refunded_30d_cents: number;
  refunded_30d_count: number;
  refund_rate_30d: number; // 0..1, refunds / paid bookings in last 30d
};

type Row = {
  status: string;
  total_cents: number | null;
  subtotal_cents: number | null;
  platform_fee_cents: number | null;
  currency: string;
  paid_at: string | null;
  shift_completed_at: string | null;
  payout_eligible_at: string | null;
  paid_out_at: string | null;
  refunded_at: string | null;
};

function startOfDayISO(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthISO(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getFinanceSnapshot(): Promise<{
  blocks: FinanceCurrencyBlock[];
  generated_at: string;
}> {
  const admin = createAdminClient();

  // Pull a wide-but-bounded slice. We need enough history to compute MTD + 30d.
  const since = startOfDayISO(90); // 90 days back is enough for MTD + 30d windows
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "status, total_cents, subtotal_cents, platform_fee_cents, currency, paid_at, shift_completed_at, payout_eligible_at, paid_out_at, refunded_at",
    )
    .or(
      `paid_at.gte.${since},paid_out_at.gte.${since},refunded_at.gte.${since}`,
    )
    .limit(20000);

  const rows = (bookings ?? []) as Row[];

  const now = Date.now();
  const today = startOfDayISO(0);
  const t7 = startOfDayISO(7);
  const t30 = startOfDayISO(30);
  const tMTD = startOfMonthISO();

  function build(currency: Currency): FinanceCurrencyBlock {
    const cur = rows.filter((r) => r.currency === currency);

    // GMV = bookings whose paid_at >= window AND status not in (refunded, cancelled)
    function gmvSince(iso: string) {
      let total = 0;
      for (const r of cur) {
        if (!r.paid_at) continue;
        if (r.paid_at < iso) continue;
        if (r.status === "refunded" || r.status === "cancelled") continue;
        total += r.total_cents ?? 0;
      }
      return total;
    }
    function feesSince(iso: string) {
      let total = 0;
      for (const r of cur) {
        if (!r.paid_at) continue;
        if (r.paid_at < iso) continue;
        if (r.status === "refunded" || r.status === "cancelled") continue;
        total += r.platform_fee_cents ?? 0;
      }
      return total;
    }

    // Payout schedule: bookings paid + eligible (eligible_at <= now) but not paid_out & not refunded
    let eligibleNow = 0;
    let eligibleNowCount = 0;
    let held = 0;
    let heldCount = 0;
    let overdue = 0;
    let overdueCount = 0;
    let paidOut30 = 0;
    let paidOut30Count = 0;
    let refunded30 = 0;
    let refunded30Count = 0;
    let paid30Count = 0;

    // Carer payout in cents under the split-fee model: subtotal − 20%.
    // (`total_cents` is what the *client* paid, which includes the 10%
    // client uplift — not what the carer receives.)
    const carerPayoutCents = (r: Row) => {
      const sub = r.subtotal_cents ?? 0;
      return sub - Math.round((sub * 20) / 100);
    };

    for (const r of cur) {
      const isRefunded = r.status === "refunded" || r.refunded_at;
      const isPaidOut = !!r.paid_out_at;
      const eligibleAt = r.payout_eligible_at
        ? new Date(r.payout_eligible_at).getTime()
        : null;

      // Eligible-now: not paid out, not refunded, eligible_at exists and <= now
      if (!isPaidOut && !isRefunded && eligibleAt !== null && eligibleAt <= now) {
        eligibleNow += carerPayoutCents(r);
        eligibleNowCount += 1;
        // Overdue = eligible >24h ago and still not paid out
        if (now - eligibleAt > 24 * 3600 * 1000) {
          overdue += carerPayoutCents(r);
          overdueCount += 1;
        }
      }
      // Held: paid but not yet eligible (future eligible_at) and not refunded/paid_out
      if (
        !isPaidOut &&
        !isRefunded &&
        eligibleAt !== null &&
        eligibleAt > now
      ) {
        held += carerPayoutCents(r);
        heldCount += 1;
      }

      if (isPaidOut && r.paid_out_at && r.paid_out_at >= t30) {
        paidOut30 += carerPayoutCents(r);
        paidOut30Count += 1;
      }

      if (r.refunded_at && r.refunded_at >= t30) {
        // Refunds are returned to the *client*, so use total_cents here.
        refunded30 += r.total_cents ?? 0;
        refunded30Count += 1;
      }
      if (r.paid_at && r.paid_at >= t30) {
        paid30Count += 1;
      }
    }

    const refundRate =
      paid30Count === 0 ? 0 : refunded30Count / paid30Count;

    return {
      currency,
      gmv_today_cents: gmvSince(today),
      gmv_7d_cents: gmvSince(t7),
      gmv_30d_cents: gmvSince(t30),
      gmv_mtd_cents: gmvSince(tMTD),
      fees_today_cents: feesSince(today),
      fees_7d_cents: feesSince(t7),
      fees_30d_cents: feesSince(t30),
      fees_mtd_cents: feesSince(tMTD),
      eligible_now_cents: eligibleNow,
      eligible_now_count: eligibleNowCount,
      held_cents: held,
      held_count: heldCount,
      overdue_cents: overdue,
      overdue_count: overdueCount,
      paid_out_30d_cents: paidOut30,
      paid_out_30d_count: paidOut30Count,
      refunded_30d_cents: refunded30,
      refunded_30d_count: refunded30Count,
      refund_rate_30d: refundRate,
    };
  }

  return {
    blocks: [build("gbp"), build("usd")],
    generated_at: new Date().toISOString(),
  };
}

export function fmtMoney(cents: number, currency: Currency) {
  const sym = currency === "gbp" ? "£" : "$";
  return `${sym}${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
