"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GrantForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState<"lite" | "plus" | "premium">("plus");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId.trim(),
          plan,
          reason: reason.trim() || undefined,
          expires_at: expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
        }),
      });
      const data: { error?: string; ok?: boolean } = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Request failed (${res.status})`);
      } else {
        setUserId("");
        setReason("");
        setExpiresAt("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Grant a comp membership
        </h2>
        <span className="text-[11px] text-slate-500">
          For founders, partners, support credits
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">
            User ID (Supabase auth UUID)
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Plan</label>
          <select
            value={plan}
            onChange={(e) =>
              setPlan(e.target.value as "lite" | "plus" | "premium")
            }
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
          >
            <option value="lite">Lite</option>
            <option value="plus">Plus</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Expires (optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs text-slate-500 mb-1">
            Reason (internal note)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Founder cohort \u2014 batch 1"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting || !userId.trim()}
            className="w-full text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Granting\u2026" : "Grant"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-[12px] text-red-600">{error}</p>
      ) : null}
    </form>
  );
}
