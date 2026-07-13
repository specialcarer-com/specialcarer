"use client";

/**
 * Ops photo cell for a single visit event (Sprint 4.5 v2).
 *
 * Shows the clock-in selfie thumbnail (click → full-size modal), the advisory
 * verification badge + similarity, and — until the automated match engine
 * ships — manual "Mark verified / Mark failed" actions that write the status
 * server-side. Passed/failed badge styles are wired now but only appear once a
 * decision (manual or, later, automated) is recorded.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoVerificationStatus } from "@/lib/admin/visit-events";

const BADGE: Record<PhotoVerificationStatus, { label: string; cls: string }> = {
  // passed = brand teal, failed = brand peach, skipped/error/pending = muted.
  passed: { label: "Match verified", cls: "bg-[#E6F5F5] text-[#016E70]" },
  failed: { label: "Match failed", cls: "bg-[#FBEEDF] text-[#B9651A]" },
  pending: { label: "Awaiting review", cls: "bg-slate-100 text-slate-600" },
  skipped: { label: "Photo skipped", cls: "bg-[#F4EFE6] text-[#0F1416]" },
  error: { label: "Capture error", cls: "bg-[#F4EFE6] text-[#0F1416]" },
};

export default function VisitPhotoCell({
  eventId,
  signedUrl,
  status,
  similarityPct,
  verifiedByName,
}: {
  eventId: string;
  signedUrl: string | null;
  status: PhotoVerificationStatus;
  similarityPct: string | null;
  verifiedByName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const badge = BADGE[status];

  // Modal a11y: close on ESC, trap focus on the close control while open, and
  // return focus to the thumbnail trigger on close.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  async function review(next: "passed" | "failed") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/visit-events/${eventId}/photo-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
      if (!res.ok) {
        setErr("Couldn't save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setErr("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-ph-no-capture>
      {signedUrl ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="block h-14 w-14 overflow-hidden rounded-lg border border-slate-200"
          aria-label="View clock-in photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Clock-in selfie"
            className="h-full w-full object-cover"
            data-ph-no-capture
          />
        </button>
      ) : (
        <span className="text-slate-400">—</span>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${badge.cls}`}
        >
          {badge.label}
        </span>
        {similarityPct && (status === "passed" || status === "failed") && (
          <span className="text-xs text-slate-500">{similarityPct}</span>
        )}
      </div>

      {verifiedByName && (
        <span className="text-[11px] text-slate-400">by {verifiedByName}</span>
      )}

      {signedUrl && (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void review("passed")}
            className="rounded-md border border-[#016E70] px-2 py-0.5 text-xs font-medium text-[#016E70] disabled:opacity-50"
          >
            Mark verified
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void review("failed")}
            className="rounded-md border border-[#B9651A] px-2 py-0.5 text-xs font-medium text-[#B9651A] disabled:opacity-50"
          >
            Mark failed
          </button>
        </div>
      )}
      {err && <span className="text-[11px] text-[#B9651A]">{err}</span>}

      {open && signedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1416]/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Clock-in photo (full size)"
          onClick={() => setOpen(false)}
        >
          <button
            ref={closeRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute right-4 top-4 rounded-md bg-[#F4EFE6] px-3 py-1 text-sm font-medium text-[#0F1416]"
            aria-label="Close photo"
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Clock-in selfie (full size)"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            data-ph-no-capture
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
