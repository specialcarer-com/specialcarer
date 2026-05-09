"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CAREGIVER_STAGES,
  CAREGIVER_STAGE_LABEL,
  type CaregiverStage,
} from "@/lib/admin-ops/types";

type Props = {
  caregiverId: string;
  currentStage: CaregiverStage;
};

export default function StageMover({ caregiverId, currentStage }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function move(to: CaregiverStage) {
    if (to === currentStage) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/caregivers/${caregiverId}/stage`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_stage: to }),
        },
      );
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
    <div className="mt-2">
      <select
        value={currentStage}
        onChange={(e) => move(e.target.value as CaregiverStage)}
        disabled={busy}
        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
        aria-label="Move to stage"
      >
        {CAREGIVER_STAGES.map((s) => (
          <option key={s} value={s}>
            {s === currentStage ? "Stay in" : "Move to"}{" "}
            {CAREGIVER_STAGE_LABEL[s]}
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
