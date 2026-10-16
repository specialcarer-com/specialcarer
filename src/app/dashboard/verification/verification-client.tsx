"use client";

import { useState } from "react";

type Props = {
  inviteUrl: string | null;
  allCleared: boolean;
  country: "GB" | "US";
  /**
   * When true (GB + no real uCheck API key wired), the self-serve invite URL
   * is a stub that resolves to a non-existent host. We hide the button and
   * surface a clear message instead, so carers don't hit a broken page.
   */
  stubMode?: boolean;
  /** Stub mode, but the carer already has check rows: show their state, not "opens soon". */
  stubWithChecks?: boolean;
};

export default function VerificationClient({
  inviteUrl,
  allCleared,
  country,
  stubMode = false,
  stubWithChecks = false,
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

  // Stub mode: the live uCheck connection is not switched on yet. Hide the
  // broken self-serve link and say plainly what is going on. We deliberately
  // do not promise a manual process or a timescale: carers have no way to
  // send documents here, so the honest message is "nothing to do yet".
  if (stubWithChecks) {
    return (
      <p className="text-sm text-slate-600">
        Your verification is already under way. The status of each check is
        shown above and updates here as it changes.
      </p>
    );
  }

  if (stubMode) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        <p className="font-medium">Verification opens soon.</p>
        <p className="mt-1">
          We&rsquo;re setting up DBS checks. There is nothing for you to do yet,
          and your checks are free. Check back here later. In the meantime you
          can finish your profile and set up payouts.
        </p>
        <p className="mt-2">
          <a href="/dashboard/profile" className="underline font-medium">
            Finish your profile
          </a>
          {" · "}
          <a href="/dashboard/support" className="underline">
            Contact support
          </a>
        </p>
      </div>
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
