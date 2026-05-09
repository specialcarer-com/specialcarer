"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnblockButton({
  caregiverId,
}: {
  caregiverId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unblock() {
    setBusy(true);
    try {
      const res = await fetch("/api/blocked-caregivers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caregiverId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={unblock}
      disabled={busy}
      className="px-3 py-1.5 rounded-pill border border-line bg-white text-[13px] font-semibold text-heading hover:bg-muted disabled:opacity-50"
    >
      {busy ? "…" : "Unblock"}
    </button>
  );
}
