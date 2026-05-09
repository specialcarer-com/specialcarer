"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TAX_DOC_TYPES,
  type TaxDocType,
} from "@/lib/admin-ops/types";

type Props = { defaultYear: number };

export default function GenerateButton({ defaultYear }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [docType, setDocType] = useState<TaxDocType>("1099");
  const [taxYear, setTaxYear] = useState(defaultYear);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/finance/tax-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId.trim(),
          doc_type: docType,
          tax_year: taxYear,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      setOpen(false);
      setUserId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
      >
        Generate (placeholder)
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-700">Generate stub row</p>
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span>User ID</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="uuid"
            className="rounded-md border border-slate-200 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Doc type</span>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as TaxDocType)}
            className="rounded-md border border-slate-200 px-2 py-1"
          >
            {TAX_DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>Tax year</span>
          <input
            type="number"
            min={2020}
            max={2099}
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="rounded-md border border-slate-200 px-2 py-1"
          />
        </label>
      </div>
      {err && (
        <p aria-live="polite" className="text-[11px] text-rose-700">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
        >
          Cancel
        </button>
        <button
          onClick={generate}
          disabled={busy || !userId.trim()}
          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "Generating…" : "Create draft"}
        </button>
      </div>
    </div>
  );
}
