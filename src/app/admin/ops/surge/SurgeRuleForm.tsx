"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SURGE_MAX_MULTIPLIER,
  SURGE_VERTICALS,
  type SurgeVertical,
} from "@/lib/admin-ops/types";

export default function SurgeRuleForm() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [vertical, setVertical] = useState<SurgeVertical>("elderly_care");
  const [mult, setMult] = useState("1.30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const m = Number(mult);
      if (!Number.isFinite(m) || m < 1 || m > SURGE_MAX_MULTIPLIER) {
        setErr(`Multiplier must be between 1.00 and ${SURGE_MAX_MULTIPLIER}.`);
        return;
      }
      const res = await fetch("/api/admin/ops/surge-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_slug: city.trim(),
          vertical,
          multiplier: m,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      setCity("");
      setMult("1.30");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-900">Add surge rule</p>
      <div className="grid sm:grid-cols-4 gap-2">
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            City slug
          </span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="london-uk"
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Vertical
          </span>
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value as SurgeVertical)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            {SURGE_VERTICALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Multiplier (1.00–{SURGE_MAX_MULTIPLIER})
          </span>
          <input
            type="number"
            min="1.00"
            max={SURGE_MAX_MULTIPLIER}
            step="0.05"
            value={mult}
            onChange={(e) => setMult(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !city.trim()}
            className="w-full px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add rule"}
          </button>
        </div>
      </div>
      {err && (
        <p aria-live="polite" className="text-xs text-rose-700">
          {err}
        </p>
      )}
    </div>
  );
}
