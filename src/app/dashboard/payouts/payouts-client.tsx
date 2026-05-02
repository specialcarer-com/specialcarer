"use client";

import { useState } from "react";

export default function PayoutsClient({
  hasAccount,
  payoutsEnabled,
  defaultCountry,
}: {
  hasAccount: boolean;
  payoutsEnabled: boolean;
  defaultCountry: "GB" | "US";
}) {
  const [country, setCountry] = useState<"GB" | "US">(defaultCountry);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startOnboarding() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/onboard-caregiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Could not start onboarding");
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  if (payoutsEnabled) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
        Payouts are enabled. You&rsquo;re ready to receive paid bookings.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hasAccount && (
        <label className="block text-sm">
          <span className="text-slate-700 font-medium">Country</span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as "GB" | "US")}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
          >
            <option value="GB">United Kingdom</option>
            <option value="US">United States</option>
          </select>
        </label>
      )}

      <button
        onClick={startOnboarding}
        disabled={submitting}
        className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
      >
        {submitting
          ? "Opening Stripe…"
          : hasAccount
            ? "Continue Stripe onboarding"
            : "Set up payouts with Stripe"}
      </button>

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
