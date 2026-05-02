"use client";

import { useState } from "react";

type Props = {
  inviteUrl: string | null;
  allCleared: boolean;
  country: "GB" | "US";
};

export default function VerificationClient({
  inviteUrl,
  allCleared,
  country,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(inviteUrl);

  async function startOrResume() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/background-checks/start", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not start verification");
      }
      if (data.invite_url) {
        setLink(data.invite_url);
        window.location.href = data.invite_url;
      } else {
        // No invite URL returned (e.g. already cleared) — refresh
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (allCleared) {
    return (
      <p className="text-sm text-emerald-700">
        Verification complete. Nothing more to do here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={startOrResume}
        disabled={loading}
        className="px-4 py-3 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
      >
        {loading
          ? "Connecting to uCheck…"
          : link
          ? "Continue verification"
          : "Start verification"}
      </button>
      {link && !loading && (
        <p className="text-xs text-slate-500">
          Or open the secure portal directly:{" "}
          <a
            href={link}
            className="text-brand hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            uCheck portal
          </a>
        </p>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
