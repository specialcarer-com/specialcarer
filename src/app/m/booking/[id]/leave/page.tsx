"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { TopBar, Button, TextArea, Toggle } from "../../../_components/ui";
import {
  LEAVE_REQUEST_REASONS,
  LEAVE_REQUEST_REASON_LABEL,
  type LeaveRequestReason,
} from "@/lib/safety/types";

export default function LeaveRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = params?.id ?? "";
  const [reason, setReason] = useState<LeaveRequestReason>("feeling_unsafe");
  const [description, setDescription] = useState("");
  const [replacementNeeded, setReplacementNeeded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ok = description.trim().length >= 10 && description.trim().length <= 2000;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/safety/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          reason,
          description: description.trim(),
          replacementNeeded,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          (json as { message?: string; error?: string })?.message ??
            (json as { error?: string })?.error ??
            "Could not submit request.",
        );
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Request submitted" back="/m/support" />
        <div className="px-5 pt-4 space-y-4">
          <div className="rounded-card border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[14px] font-bold text-emerald-900">
              Request submitted.
            </p>
            <p className="mt-1 text-[13px] text-emerald-800">
              We&rsquo;ll contact the customer to communicate the change and
              {replacementNeeded
                ? " arrange a replacement carer."
                : " confirm cover is not required."}{" "}
              You&rsquo;ll be paid for hours actually worked.
            </p>
            <p className="mt-2 text-[12.5px] text-emerald-800">
              If you&rsquo;re in immediate physical danger, leave first — use
              SOS or call 999 / 911.
            </p>
          </div>
          <Button block onClick={() => router.replace("/m/support")}>
            Back to Support
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title="Request to leave" back="/m/support" />
      <div className="px-5 pt-3 space-y-3">
        <p className="text-[12px] text-subheading">
          Use this form if a shift becomes unsafe or you need to leave for
          another reason. We will arrange replacement cover where needed.
        </p>

        <label className="block">
          <span className="block text-[13px] font-semibold text-heading mb-1">
            Reason
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as LeaveRequestReason)}
            className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
          >
            {LEAVE_REQUEST_REASONS.map((r) => (
              <option key={r} value={r}>
                {LEAVE_REQUEST_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        <TextArea
          label="What's happening?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Brief, specific. We use this to brief the customer and any replacement carer."
          hint={`${description.trim().length} / 2000 (min 10)`}
        />

        <div className="flex items-center justify-between rounded-card bg-white p-4 shadow-card">
          <div>
            <p className="text-[13.5px] font-semibold text-heading">
              Replacement carer needed
            </p>
            <p className="text-[11.5px] text-subheading">
              Tick if the customer still needs cover.
            </p>
          </div>
          <Toggle
            checked={replacementNeeded}
            onChange={setReplacementNeeded}
          />
        </div>

        {err && (
          <p aria-live="polite" className="text-[12px] text-rose-700">
            {err}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block disabled={!ok || busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </div>
  );
}
