"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { YesNoUnsure } from "@/lib/vetting/types";

export default function RefRowActions({
  id,
  safeguardingDbs,
  status,
}: {
  id: string;
  safeguardingDbs: YesNoUnsure | null;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/vetting/references/${encodeURIComponent(id)}/resend`,
        { method: "POST" },
      );
      if (res.ok) {
        router.refresh();
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 429
            ? "This invitation has already been resent 3 times in the last 24 hours."
            : (json.error?.replace(/_/g, " ") ?? "Could not resend this reference invitation."),
        );
      }
    } catch {
      setError("Could not resend this reference invitation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function call(action: "verify" | "reject") {
    if (action === "verify" && safeguardingDbs === "yes" && !adminNotes.trim()) {
      setError("Admin notes are required before verifying a safeguarding / DBS “Yes” response.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/vetting/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          reason: reason || undefined,
          admin_notes: adminNotes || undefined,
        }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error?.replace(/_/g, " ") ?? "Could not update this reference.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {safeguardingDbs === "yes" && (
        <p className="text-xs font-semibold text-[#B24747]">
          Safeguarding / DBS is marked Yes. Explain the decision before verifying.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
      {status === "invited" && (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-brand-teal text-white text-xs font-semibold hover:bg-[#039EA0]/90 disabled:opacity-50"
        >
          {busy ? "Resending…" : "Resend invite"}
        </button>
      )}
      {status === "submitted" && <>
      <button
        type="button"
        onClick={() => call("verify")}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-brand-teal text-white text-xs font-semibold hover:bg-[#028688] disabled:opacity-50"
      >
        Verify
      </button>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reject reason (optional)"
        className="text-xs px-2 py-1.5 rounded-lg border border-brand-ink/15 w-64"
      />
      <input
        type="text"
        value={adminNotes}
        onChange={(e) => setAdminNotes(e.target.value)}
        maxLength={1000}
        placeholder={
          safeguardingDbs === "yes"
            ? "Admin notes (required to verify)"
            : "Admin notes (optional)"
        }
        className="text-xs px-2 py-1.5 rounded-lg border border-brand-ink/15 w-72"
      />
      <button
        type="button"
        onClick={() => call("reject")}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-[#B24747] text-white text-xs font-semibold hover:bg-[#B24747]/90 disabled:opacity-50"
      >
        Reject
      </button>
      </>}
      </div>
      {error && <p role="alert" className="text-xs text-[#B24747]">{error}</p>}
    </div>
  );
}
