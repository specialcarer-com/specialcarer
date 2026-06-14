"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Toggle } from "../../_components/ui";

type Payment = {
  id: string;
  bookingId: string;
  amountCents: number;
  paidAt: string | null;
  caregiverName: string | null;
  eligible: boolean;
};

type SummaryResponse =
  | { enabled: false }
  | {
      enabled: true;
      year: number;
      totalCents: number;
      currency: string;
      count: number;
      payments: Payment[];
    };

const NOW = new Date().getUTCFullYear();
const YEARS = [NOW, NOW - 1, NOW - 2];

function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder
    .toString()
    .padStart(2, "0")}`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function ExpensesClient() {
  const [year, setYear] = useState<number>(NOW);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/m/family/hsa-summary?year=${y}&all=1`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setErr("Couldn't load your expenses.");
        return;
      }
      const json = (await res.json()) as SummaryResponse;
      if (!json.enabled) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      setPayments(json.payments);
      setTotalCents(json.totalCents);
      setCount(json.count);
    } catch {
      setErr("Couldn't load your expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year);
  }, [year, load]);

  async function toggle(p: Payment, next: boolean) {
    setSavingId(p.id);
    setErr(null);
    // Optimistic update.
    setPayments((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, eligible: next } : x)),
    );
    setTotalCents((t) => t + (next ? p.amountCents : -p.amountCents));
    setCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/m/payments/${p.id}/hsa-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eligible: next }),
      });
      if (!res.ok) throw new Error("toggle failed");
    } catch {
      // Roll back.
      setPayments((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, eligible: !next } : x)),
      );
      setTotalCents((t) => t - (next ? p.amountCents : -p.amountCents));
      setCount((c) => c - (next ? 1 : -1));
      setErr("Couldn't update that payment. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  function exportPdf() {
    window.open(`/api/m/family/hsa-summary.pdf?year=${year}`, "_blank");
  }

  if (enabled === false) {
    return (
      <div className="px-4 py-6">
        <Card>
          <h2 className="text-[16px] font-bold text-heading mb-2">
            HSA / FSA tagging is currently US-only
          </h2>
          <p className="text-[14px] text-subheading">
            Contact support if you&apos;d like a UK pilot.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Year picker */}
      <div className="flex gap-2 mb-4">
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={`h-9 px-4 rounded-pill text-[14px] font-bold transition ${
              y === year
                ? "bg-primary text-white"
                : "bg-primary-50 text-primary"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Total summary */}
      <Card className="mb-4">
        <p className="text-[13px] text-subheading">
          Total eligible expenses ({year})
        </p>
        <p className="text-[28px] font-bold text-heading leading-tight">
          {formatUsd(totalCents)}
        </p>
        <p className="text-[13px] text-subheading">
          {count} payment{count === 1 ? "" : "s"} tagged
        </p>
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={exportPdf}
            disabled={loading}
          >
            Export PDF
          </Button>
        </div>
      </Card>

      {err && (
        <p className="text-[13px] text-[#C22] mb-3" role="alert">
          {err}
        </p>
      )}

      {loading ? (
        <p className="text-[14px] text-subheading px-1">Loading…</p>
      ) : payments.length === 0 ? (
        <Card>
          <p className="text-[14px] text-subheading">
            No payments found for {year}.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <Card key={p.id} className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-heading truncate">
                  {formatUsd(p.amountCents)}
                </p>
                <p className="text-[13px] text-subheading truncate">
                  {p.caregiverName ?? "Caregiver"} · {formatDate(p.paidAt)}
                </p>
              </div>
              <div className="flex-shrink-0 pl-3">
                <Toggle
                  checked={p.eligible}
                  onChange={(v) => {
                    if (savingId !== p.id) void toggle(p, v);
                  }}
                  label="HSA/FSA eligible"
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
