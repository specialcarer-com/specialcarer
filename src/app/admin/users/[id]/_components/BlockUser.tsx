"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Block / Unblock toggle. When the user is currently active we show a
 * red "Block user" button; when blocked we show an emerald "Unblock"
 * button. Both require a reason. Self-block is disabled.
 */
export default function BlockUser({
  userId,
  isBlocked,
  isSelf,
  userEmail,
}: {
  userId: string;
  isBlocked: boolean;
  isSelf: boolean;
  userEmail: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const action = isBlocked ? "unblock" : "block";

  async function submit() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/block`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setOpen(false);
      setReason("");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (isSelf && !isBlocked) {
    return (
      <button
        disabled
        className="text-xs font-medium px-3 py-1 rounded-md bg-slate-100 text-slate-400 cursor-not-allowed"
        title="You cannot block your own account."
      >
        Block user
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-xs font-medium px-3 py-1 rounded-md ${
          isBlocked
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-amber-600 text-white hover:bg-amber-700"
        }`}
      >
        {isBlocked ? "Unblock user" : "Block user"}
      </button>
    );
  }

  const tone = isBlocked
    ? {
        wrap: "border-emerald-300 bg-emerald-50",
        title: "text-emerald-900",
        body: "text-emerald-800",
        btn: "bg-emerald-600 hover:bg-emerald-700",
        border: "border-emerald-300",
      }
    : {
        wrap: "border-amber-300 bg-amber-50",
        title: "text-amber-900",
        body: "text-amber-800",
        btn: "bg-amber-600 hover:bg-amber-700",
        border: "border-amber-300",
      };

  return (
    <div className={`rounded-2xl border ${tone.wrap} p-4 space-y-3`}>
      <h3 className={`text-sm font-semibold ${tone.title}`}>
        {isBlocked ? "Unblock this user" : "Block this user"}
      </h3>
      <p className={`text-xs ${tone.body}`}>
        {isBlocked ? (
          <>
            Restoring access for <strong>{userEmail ?? userId}</strong>. They
            will be able to sign in again immediately.
          </>
        ) : (
          <>
            Blocking <strong>{userEmail ?? userId}</strong> revokes their
            current sessions and prevents new logins. Their data is kept
            intact and the action is fully reversible.
          </>
        )}
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required) — recorded in audit log"
        rows={2}
        className={`w-full text-sm border ${tone.border} rounded-md px-2 py-1.5 bg-white`}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !reason.trim()}
          className={`text-sm font-medium px-4 py-1.5 rounded-md text-white ${tone.btn} disabled:opacity-50`}
        >
          {pending
            ? "Saving…"
            : isBlocked
              ? "Confirm unblock"
              : "Confirm block"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>
    </div>
  );
}
