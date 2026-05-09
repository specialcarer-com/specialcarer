"use client";

import { useState } from "react";
import { Card } from "../../../_components/ui";

/**
 * Per-booking toggle for whether the carer is allowed to upload photo
 * updates. Seeker-only; persists via PATCH
 * /api/bookings/[id]/photo-consent.
 */
export default function PhotoConsentToggle({
  bookingId,
  initial,
}: {
  bookingId: string;
  initial: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setErr(null);
    setEnabled(next);
    try {
      const res = await fetch(
        `/api/bookings/${bookingId}/photo-consent`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      if (!res.ok) {
        setEnabled(!next);
        setErr("Couldn't update photo consent.");
      }
    } catch {
      setEnabled(!next);
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-heading">
            Photo updates from carer
          </p>
          <p className="mt-0.5 text-[12px] text-subhead">
            {enabled
              ? "Your carer can attach photos to journal entries."
              : "Photos are off — carer can still add written updates."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          disabled={saving}
          className={`relative inline-flex h-7 w-12 flex-none items-center rounded-pill transition ${
            enabled ? "bg-primary" : "bg-line"
          } ${saving ? "opacity-60" : ""}`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
              enabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] text-rose-700">{err}</p>}
    </Card>
  );
}
