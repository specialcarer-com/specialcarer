"use client";

import { useState, useTransition } from "react";
import { clearCheckAction, resetCheckAction } from "../actions";

type Props = {
  userId: string;
  checkType: string;
  existingId: string | null;
  currentStatus: string | null;
};

export default function ClearCheckButton({
  userId,
  checkType,
  existingId,
  currentStatus,
}: Props) {
  const [mode, setMode] = useState<"idle" | "clear" | "reset">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCleared = currentStatus === "cleared";
  const canReset = !!existingId && currentStatus !== "invited";

  function submit() {
    setError(null);
    startTransition(async () => {
      const res =
        mode === "clear"
          ? await clearCheckAction({
              userId,
              checkType,
              existingId,
              reason,
            })
          : await resetCheckAction({
              userId,
              checkType,
              existingId: existingId ?? "",
              reason,
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMode("idle");
      setReason("");
    });
  }

  if (mode === "idle") {
    return (
      <div className="flex items-center justify-end gap-2">
        {!isCleared && (
          <button
            type="button"
            onClick={() => setMode("clear")}
            className="text-xs px-3 py-1.5 rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
          >
            Clear
          </button>
        )}
        {canReset && (
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
          >
            Reset
          </button>
        )}
        {isCleared && !canReset && (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 max-w-xs ml-auto">
      <p className="text-xs text-slate-600 text-right">
        {mode === "clear"
          ? "Reason for admin override (required, ≥10 chars):"
          : "Reason for reset (required, ≥10 chars):"}
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand/40"
        placeholder="e.g. paper DBS certificate on file, scan in Drive folder /carer-vetting/steve-g/dbs.pdf"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("idle");
            setReason("");
            setError(null);
          }}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || reason.trim().length < 10}
          className={`text-xs px-3 py-1.5 rounded-md font-medium text-white ${
            mode === "clear"
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-700 hover:bg-slate-800"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {pending
            ? "Saving…"
            : mode === "clear"
              ? "Confirm clear"
              : "Confirm reset"}
        </button>
      </div>
    </div>
  );
}
