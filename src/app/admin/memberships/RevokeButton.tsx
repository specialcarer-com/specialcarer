"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RevokeButton({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (!confirm("Revoke this comp membership?")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/memberships/${encodeURIComponent(subscriptionId)}`,
        { method: "DELETE" }
      );
      const data: { error?: string; ok?: boolean } = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Request failed (${res.status})`);
        alert(data.error || `Request failed (${res.status})`);
      } else {
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      alert(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="text-xs font-medium px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {busy ? "Revoking\u2026" : "Revoke"}
      </button>
      {error ? <span className="sr-only">{error}</span> : null}
    </div>
  );
}
