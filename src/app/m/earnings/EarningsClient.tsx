"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Tag } from "../_components/ui";

type Summary = {
  today_cents: number;
  week_cents: number;
  month_cents: number;
  year_cents: number;
  lifetime_cents: number;
  tips_today_cents: number;
  tips_week_cents: number;
  tips_month_cents: number;
  tips_year_cents: number;
  completed_bookings_this_week: number;
  last_payout_at: string | null;
  available_balance_cents: number;
  currency: string;
};

type Period = "today" | "week" | "month" | "year";

type Bucket = { key: string; cents: number };

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export default function EarningsClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [stripeStatus, setStripeStatus] = useState<{
    onboarded: boolean;
    payouts_enabled: boolean;
    has_account: boolean;
  } | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/earnings/summary", {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setErr(j.error ?? "Couldn't load earnings.");
          return;
        }
        const json = (await res.json()) as {
          summary: Summary;
          streak_weeks: number;
          stripe: {
            onboarded: boolean;
            payouts_enabled: boolean;
            has_account: boolean;
          };
        };
        if (cancelled) return;
        setSummary(json.summary);
        setStreak(json.streak_weeks);
        setStripeStatus(json.stripe);
      } catch {
        if (!cancelled) setErr("Network error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // History bucket fetch — varies with period.
  useEffect(() => {
    let cancelled = false;
    const histPeriod = period === "today" ? "day" : period === "year" ? "month" : period;
    (async () => {
      try {
        const res = await fetch(
          `/api/m/earnings/history?period=${histPeriod}&limit=12`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { buckets?: Bucket[] };
        if (!cancelled) setBuckets(json.buckets ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (err && !summary) {
    return (
      <div className="px-5 pt-6 text-rose-700 text-sm text-center">{err}</div>
    );
  }
  if (!summary) {
    return (
      <div className="px-5 pt-6 text-subheading text-sm text-center">
        Loading…
      </div>
    );
  }

  const periodCents =
    period === "today"
      ? summary.today_cents
      : period === "week"
        ? summary.week_cents
        : period === "month"
          ? summary.month_cents
          : summary.year_cents;
  const periodTipsCents =
    period === "today"
      ? summary.tips_today_cents
      : period === "week"
        ? summary.tips_week_cents
        : period === "month"
          ? summary.tips_month_cents
          : summary.tips_year_cents;
  const max = Math.max(1, ...buckets.map((b) => b.cents));

  return (
    <div className="px-5 pt-3 pb-12 space-y-4">
      {/* Available balance + cash out */}
      <Card className="p-5 bg-primary text-white">
        <p className="text-[12px] uppercase tracking-wide text-white/80">
          Available now
        </p>
        <p className="mt-1 text-[30px] font-extrabold tabular-nums leading-none">
          {fmtMoney(summary.available_balance_cents, summary.currency)}
        </p>
        <p className="mt-2 text-[12px] text-white/80">
          {summary.last_payout_at
            ? `Last payout ${new Date(summary.last_payout_at).toLocaleDateString("en-GB")}`
            : "No payouts yet"}
        </p>
        <Link href="/m/earnings/payout" className="block mt-3">
          <button
            type="button"
            className="w-full h-12 rounded-btn bg-white text-primary font-bold text-[15px]"
            disabled={summary.available_balance_cents <= 0}
          >
            Cash out instantly
          </button>
        </Link>
      </Card>

      {/* Period toggle */}
      <div className="rounded-pill bg-muted p-1 grid grid-cols-4 gap-1">
        {(["today", "week", "month", "year"] as const).map((p) => {
          const on = period === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`h-9 rounded-pill text-[12px] font-semibold transition ${
                on ? "bg-white text-heading shadow-sm" : "text-subheading"
              }`}
            >
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Period summary card + tiny bar chart */}
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          {period === "today"
            ? "Today"
            : period === "week"
              ? "This week"
              : period === "month"
                ? "This month"
                : "This year"}
        </p>
        <p className="mt-1 text-[24px] font-extrabold text-heading tabular-nums">
          {fmtMoney(periodCents, summary.currency)}
        </p>
        <p className="text-[12px] text-subheading">
          + tips {fmtMoney(periodTipsCents, summary.currency)}
        </p>
        {buckets.length > 0 && (
          <div className="mt-3 flex items-end gap-1.5 h-24">
            {buckets.map((b) => {
              const h = Math.max(2, Math.round((b.cents / max) * 100));
              return (
                <div key={b.key} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-primary rounded-t-sm"
                    style={{ height: `${h}%` }}
                    title={`${b.key} · ${fmtMoney(b.cents, summary.currency)}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Tips */}
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Tips
        </p>
        <p className="mt-1 text-[14px] text-heading">
          This month:{" "}
          <strong>{fmtMoney(summary.tips_month_cents, summary.currency)}</strong>
        </p>
        <p className="text-[12px] text-subheading">
          Tips are 0% fee — every penny is yours.
        </p>
      </Card>

      {/* Streak */}
      {streak > 0 && (
        <Card className="p-4">
          <p className="text-[14px] font-bold text-heading">
            🔥 {streak}-week streak — keep it going!
          </p>
          <p className="mt-1 text-[12px] text-subheading">
            You&rsquo;ve completed at least 3 bookings every week for{" "}
            {streak} {streak === 1 ? "week" : "weeks"}.
          </p>
        </Card>
      )}

      {/* Bonuses advisory */}
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Earn more
        </p>
        <ul className="mt-2 space-y-2 text-[13px] text-heading">
          <li className="flex items-start gap-2">
            <span aria-hidden>🌙</span>
            <span>
              Care between 22:00–06:00 or weekends earns ~20% more —{" "}
              <Link
                href="/m/profile/availability"
                className="text-primary font-semibold underline"
              >
                update availability
              </Link>
              .
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden>🤝</span>
            <span>
              Refer another carer — both of you earn a bonus once they
              complete 5 bookings.{" "}
              <Link
                href="/m/earnings/referrals"
                className="text-primary font-semibold underline"
              >
                Get your code
              </Link>
              .
            </span>
          </li>
        </ul>
      </Card>

      {/* Stripe Connect status */}
      {stripeStatus && !stripeStatus.payouts_enabled && (
        <Card className="p-4 bg-amber-50 border border-amber-200">
          <p className="text-[13px] font-bold text-amber-900">
            Finish payout setup
          </p>
          <p className="mt-1 text-[12px] text-amber-800">
            Stripe still needs a few details before you can be paid.
          </p>
          <Link href="/dashboard/payouts" className="block mt-2">
            <Button variant="outline">Open Stripe setup</Button>
          </Link>
        </Card>
      )}

      {/* Footer links */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/m/earnings/tax"
          className="rounded-card border border-line bg-white p-3 text-center text-[12px] font-semibold text-heading"
        >
          Tax exports
        </Link>
        <Link
          href="/m/earnings/referrals"
          className="rounded-card border border-line bg-white p-3 text-center text-[12px] font-semibold text-heading"
        >
          Referrals
        </Link>
        <Link
          href="/m/earnings/history"
          className="rounded-card border border-line bg-white p-3 text-center text-[12px] font-semibold text-heading"
        >
          Payout history
        </Link>
      </div>

      <p className="text-[11px] text-subheading text-center">
        Lifetime gross:{" "}
        <strong className="text-heading">
          {fmtMoney(summary.lifetime_cents, summary.currency)}
        </strong>
        . <Tag tone="green">25% platform fee</Tag>
      </p>
    </div>
  );
}
