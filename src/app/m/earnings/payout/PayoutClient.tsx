"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "../../_components/ui";
import {
  INSTANT_PAYOUT_MIN_CENTS,
  instantPayoutFeeCents,
  instantPayoutNetCents,
} from "@/lib/earnings/fees";

type Summary = {
  available_balance_cents: number;
  currency: string;
};

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export default function PayoutClient() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/earnings/summary", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { summary: Summary };
        if (!cancelled) {
          setSummary(json.summary);
          // Default to full balance.
          setAmount(((json.summary.available_balance_cents ?? 0) / 100).toFixed(2));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cents = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amount]);
  const fee = instantPayoutFeeCents(cents);
  const net = instantPayoutNetCents(cents);

  if (!summary) {
    return (
      <div className="px-5 pt-6 text-subheading text-sm text-center">
        Loading…
      </div>
    );
  }
  const currency = summary.currency;
  const valid =
    cents >= INSTANT_PAYOUT_MIN_CENTS &&
    cents <= summary.available_balance_cents;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/earnings/instant-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: cents, currency }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        payout_id?: string;
        error?: string;
      };
      if (!res.ok || !json.payout_id) {
        setErr(json.error ?? "Couldn't start payout.");
        return;
      }
      router.push("/m/earnings?payout=ok");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-12 space-y-4">
      <Card className="p-5 text-center">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Available
        </p>
        <p className="mt-1 text-[28px] font-extrabold text-heading tabular-nums">
          {fmtMoney(summary.available_balance_cents, currency)}
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <label className="block">
          <span className="block text-[13px] font-semibold text-heading mb-1">
            Cash out amount
          </span>
          <div className="flex items-center gap-2">
            <span className="text-subheading">
              {currency.toUpperCase() === "USD" ? "$" : "£"}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-line text-[15px] tabular-nums"
            />
          </div>
        </label>

        <div className="rounded-card bg-muted p-3 text-[13px] text-heading space-y-1">
          <Row
            label="Amount"
            value={fmtMoney(cents, currency)}
          />
          <Row
            label="Instant fee (1%, min/max £0.50–£5)"
            value={`− ${fmtMoney(fee, currency)}`}
            tone="muted"
          />
          <hr className="border-line my-1" />
          <Row
            label="You'll receive"
            value={fmtMoney(net, currency)}
            highlighted
          />
        </div>

        {!valid && cents > 0 && (
          <p className="text-[12px] text-rose-700">
            {cents < INSTANT_PAYOUT_MIN_CENTS
              ? `Minimum cash-out is ${fmtMoney(INSTANT_PAYOUT_MIN_CENTS, currency)}.`
              : "That's more than your available balance."}
          </p>
        )}
        {err && <p className="text-[12px] text-rose-700">{err}</p>}

        {confirming ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !valid}>
              {busy ? "Sending…" : "Confirm"}
            </Button>
          </div>
        ) : (
          <Button
            block
            onClick={() => setConfirming(true)}
            disabled={!valid}
          >
            Cash out {fmtMoney(net, currency)}
          </Button>
        )}
        <p className="text-[11px] text-subheading">
          Instant payouts arrive in your linked bank within 30 minutes when
          your bank supports it. Otherwise you&rsquo;ll get the standard
          weekly direct deposit on Monday.
        </p>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  highlighted,
}: {
  label: string;
  value: string;
  tone?: "muted";
  highlighted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`${
          tone === "muted" ? "text-subheading" : "text-heading"
        } ${highlighted ? "font-bold" : ""}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          tone === "muted" ? "text-subheading" : "text-heading"
        } ${highlighted ? "font-bold text-primary text-[15px]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
