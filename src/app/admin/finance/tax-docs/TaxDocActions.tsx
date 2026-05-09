"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TAX_DOC_STATUSES,
  type TaxDocStatus,
} from "@/lib/admin-ops/types";

type Props = {
  docId: string;
  current: TaxDocStatus;
};

export default function TaxDocActions({ docId, current }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(next: TaxDocStatus) {
    if (next === current) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/finance/tax-docs/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <select
        value={current}
        onChange={(e) => setStatus(e.target.value as TaxDocStatus)}
        disabled={busy}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
        aria-label="Change status"
      >
        {TAX_DOC_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {err && (
        <p aria-live="polite" className="mt-1 text-[11px] text-rose-700">
          {err}
        </p>
      )}
    </div>
  );
}
