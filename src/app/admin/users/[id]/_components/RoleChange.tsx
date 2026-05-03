"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["seeker", "caregiver", "admin"] as const;
type Role = (typeof ROLES)[number];

export default function RoleChange({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: Role | null;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(currentRole ?? "seeker");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, reason }),
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800"
      >
        Change role
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-900">Change role</h3>
      <div className="flex flex-wrap items-center gap-2">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            disabled={isSelf && r !== "admin"}
            className={`text-xs font-medium px-3 py-1 rounded-md border ${
              role === r
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={
              isSelf && r !== "admin"
                ? "You cannot remove your own admin role."
                : undefined
            }
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required) — recorded in audit log"
        rows={2}
        className="w-full text-sm border border-amber-300 rounded-md px-2 py-1.5 bg-white"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !reason.trim() || role === currentRole}
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : `Set role to ${role}`}
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
