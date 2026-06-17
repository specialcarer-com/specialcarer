"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar, BottomNav } from "../_components/ui";
import { isDbsEnabled } from "@/lib/dbs/flag";

type Application = {
  id: string;
  kind: "adult" | "child";
  status: string;
  recovery_status: string | null;
  recovery_collected_pence: number | null;
  cost_pence: number | null;
  submitted_at: string | null;
  decision_at: string | null;
};

type StatusResponse = {
  overall_status: string;
  search_eligible: boolean;
  recovery_collected_pence: number;
  recovery_target_pence: number;
  applications: Application[];
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  in_progress: "In progress",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

export default function CarerDbsPage() {
  const router = useRouter();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isDbsEnabled()) {
      router.replace("/m/home");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/m/dbs/status");
        if (res.ok) setData(await res.json());
      } finally {
        setLoaded(true);
      }
    })();
  }, [router]);

  async function payUpfront() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/m/dbs/pay-upfront", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMsg(body.error ?? "Could not start payment.");
        return;
      }
      setMsg(
        "Upfront payment started — earnings recovery will be skipped once it completes.",
      );
      const res2 = await fetch("/api/m/dbs/status");
      if (res2.ok) setData(await res2.json());
    } finally {
      setBusy(false);
    }
  }

  if (!isDbsEnabled()) return null;

  const collectedPounds = ((data?.recovery_collected_pence ?? 0) / 100).toFixed(2);
  const targetPounds = ((data?.recovery_target_pence ?? 6000) / 100).toFixed(2);
  const paidUpfront = (data?.applications ?? []).some(
    (a) => a.recovery_status === "paid_upfront",
  );

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="DBS Check" />

      <div className="px-5 pt-3 space-y-4">
        {!loaded && <p className="text-subheading text-sm">Loading…</p>}

        {loaded && data && (
          <>
            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
                Overall status
              </p>
              <p className="mt-1 text-[18px] font-bold text-heading">
                {STATUS_LABEL[data.overall_status] ?? data.overall_status}
              </p>
              <p className="mt-1 text-[13px] text-subheading">
                {data.search_eligible
                  ? "Your DBS is approved — you can appear in search and accept bookings."
                  : "Both your Adult and Child DBS must be approved before you appear in search or accept bookings."}
              </p>
            </div>

            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
                Applications
              </p>
              <ul className="mt-2 divide-y divide-line">
                {data.applications.length === 0 && (
                  <li className="py-2 text-[13px] text-subheading">
                    No DBS applications yet.
                  </li>
                )}
                {data.applications.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between py-2.5"
                  >
                    <span className="text-[14px] font-medium capitalize text-heading">
                      {a.kind} workforce
                    </span>
                    <span className="text-[13px] capitalize text-subheading">
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
                Cost recovery
              </p>
              {paidUpfront ? (
                <p className="mt-1 text-[14px] font-medium text-heading">
                  Paid upfront — no deductions from your earnings.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[13px] text-subheading">
                    SpecialCarers fronts the £{targetPounds} DBS cost and recovers
                    it from your first earnings (10% of each payout, £6 minimum).
                  </p>
                  <p className="mt-2 text-[14px] font-medium text-heading">
                    Recovered £{collectedPounds} of £{targetPounds}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(
                          100,
                          ((data.recovery_collected_pence ?? 0) /
                            (data.recovery_target_pence || 6000)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={payUpfront}
                    disabled={busy}
                    className="mt-4 inline-flex h-10 items-center rounded-pill bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-50"
                  >
                    Pay £{targetPounds} upfront instead
                  </button>
                </>
              )}
              {msg && (
                <p className="mt-3 text-[13px] text-primary">{msg}</p>
              )}
            </div>
          </>
        )}
      </div>

      <BottomNav active="profile" role="carer" />
    </div>
  );
}
