"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Hard-delete an auth user from the admin panel. Requires the admin to
 * type "DELETE" verbatim AND provide a reason. Self-deletion is blocked
 * server-side, but we also disable the UI when isSelf is true.
 */
export default function DeleteUser({
  userId,
  userEmail,
  isSelf,
}: {
  userId: string;
  userEmail: string | null;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/users/${userId}?reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      // After delete, send the admin back to the user list
      startTransition(() => router.push("/admin/users"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (isSelf) {
    return (
      <button
        disabled
        className="text-xs font-medium px-3 py-1 rounded-md bg-rose-100 text-rose-400 cursor-not-allowed"
        title="You cannot delete your own account from the admin panel."
      >
        Delete user
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1 rounded-md bg-rose-600 text-white hover:bg-rose-700"
      >
        Delete user
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-rose-900">
        Permanently delete this user
      </h3>
      <p className="text-xs text-rose-800">
        This removes the auth account for{" "}
        <strong>{userEmail ?? userId}</strong> and cascades to their profile,
        bookings, messages, and other data. <strong>This is irreversible.</strong>
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required) — recorded in audit log"
        rows={2}
        className="w-full text-sm border border-rose-300 rounded-md px-2 py-1.5 bg-white"
      />
      <div>
        <label className="block text-xs text-rose-900 mb-1">
          Type <span className="font-mono font-semibold">DELETE</span> to
          confirm
        </label>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full text-sm border border-rose-300 rounded-md px-2 py-1.5 bg-white font-mono"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !reason.trim() || confirm !== "DELETE"}
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete forever"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setReason("");
            setConfirm("");
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
