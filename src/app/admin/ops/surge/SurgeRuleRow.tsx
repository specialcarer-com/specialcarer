"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  ruleId: string;
  initialMultiplier: number;
  initialActive: boolean;
};

export default function SurgeRuleRow({
  ruleId,
  initialMultiplier,
  initialActive,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [mult, setMult] = useState(String(initialMultiplier));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy("patch");
    setErr(null);
    try {
      const res = await fetch(`/api/admin/ops/surge-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function del() {
    if (!confirm("Delete rule?")) return;
    setBusy("del");
    setErr(null);
    try {
      const res = await fetch(`/api/admin/ops/surge-rules/${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <label className="inline-flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            const next = e.target.checked;
            setActive(next);
            void patch({ active: next });
          }}
          disabled={busy !== null}
        />
        Active
      </label>
      <input
        type="number"
        step="0.05"
        min="1.00"
        max="1.50"
        value={mult}
        onChange={(e) => setMult(e.target.value)}
        className="w-24 rounded-md border border-slate-200 px-2 py-1 text-xs"
      />
      <button
        onClick={() => patch({ multiplier: Number(mult) })}
        disabled={busy !== null}
        className="text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white"
      >
        {busy === "patch" ? "…" : "Save"}
      </button>
      <button
        onClick={del}
        disabled={busy !== null}
        className="text-xs px-2.5 py-1 rounded-md border border-rose-300 text-rose-700"
      >
        {busy === "del" ? "…" : "Delete"}
      </button>
      {err && (
        <span aria-live="polite" className="text-[11px] text-rose-700">
          {err}
        </span>
      )}
    </div>
  );
}
