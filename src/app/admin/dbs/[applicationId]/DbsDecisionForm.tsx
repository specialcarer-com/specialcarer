"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND = "#039EA0";

export default function DbsDecisionForm({
  applicationId,
  currentStatus,
  recoveryStatus,
  certificateNumber,
  certificateIssuedOn,
}: {
  applicationId: string;
  currentStatus: string;
  recoveryStatus: string;
  certificateNumber: string;
  certificateIssuedOn: string;
}) {
  const router = useRouter();
  const [certNumber, setCertNumber] = useState(certificateNumber);
  const [issuedOn, setIssuedOn] = useState(certificateIssuedOn);
  const [notes, setNotes] = useState("");
  const [surnameOverride, setSurnameOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/dbs/${applicationId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          certificateNumber: certNumber || undefined,
          certificateIssuedOn: issuedOn || undefined,
          notes: notes || undefined,
          surnameOverride,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to record decision");
        return;
      }
      setDone(`Recorded: ${decision}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function markPaidUpfront() {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/dbs/${applicationId}/paid-upfront`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed");
        return;
      }
      setDone("Marked as paid upfront — recovery skipped.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isDecided = currentStatus === "approved" || currentStatus === "rejected";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Record decision</h2>

      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
          {err}
        </div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-sm">
          {done}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="block text-slate-500 mb-1">Certificate number</span>
          <input
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            placeholder="12-digit certificate number"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-500 mb-1">Issued date</span>
          <input
            type="date"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </label>
      </div>

      <label className="text-sm block">
        <span className="block text-slate-500 mb-1">Notes (audit log)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Free-text notes — recorded in the admin audit log."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={surnameOverride}
          onChange={(e) => setSurnameOverride(e.target.checked)}
        />
        Surname mismatch override (hyphenation / maiden name — documented)
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={busy}
          className="px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: BRAND }}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("rejected")}
          disabled={busy}
          className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-rose-600 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={markPaidUpfront}
          disabled={busy || recoveryStatus === "paid_upfront"}
          className="px-4 py-2 rounded-full text-sm font-semibold text-slate-700 bg-slate-100 disabled:opacity-50"
        >
          {recoveryStatus === "paid_upfront"
            ? "Paid upfront ✓"
            : "Mark as paid upfront"}
        </button>
      </div>

      {isDecided && (
        <p className="text-xs text-slate-500">
          This application is already <strong>{currentStatus}</strong>. Recording
          a new decision overwrites it and recomputes the carer&apos;s overall
          status.
        </p>
      )}
    </div>
  );
}
