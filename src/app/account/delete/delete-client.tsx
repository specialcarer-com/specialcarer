"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAccountClient({
  userEmail,
}: {
  userEmail: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirm.trim().toUpperCase() === "DELETE" && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete account");
      // Force full reload so the auth cookie is cleared on the server side
      window.location.href = "/?deleted=1";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <p className="text-sm text-slate-700">
        Logged in as <span className="font-medium">{userEmail}</span>. To
        confirm, type <span className="font-mono font-semibold">DELETE</span>{" "}
        below.
      </p>
      <input
        type="text"
        autoComplete="off"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type DELETE to confirm"
        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Permanently delete my account"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
