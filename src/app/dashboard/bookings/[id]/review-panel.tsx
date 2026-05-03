"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewPanel({
  bookingId,
  caregiverName,
  existing,
}: {
  bookingId: string;
  caregiverName: string;
  existing: { rating: number; body: string | null } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(existing?.rating ?? 5);
  const [body, setBody] = useState<string>(existing?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Submit failed");
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-100">
      <h2 className="font-semibold">Rate {caregiverName}</h2>
      <p className="mt-1 text-sm text-slate-600">
        How was the shift? Your review helps other families and the caregiver.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="text-3xl leading-none focus:outline-none"
            >
              <span
                className={
                  n <= rating ? "text-amber-500" : "text-slate-300"
                }
              >
                ★
              </span>
            </button>
          ))}
          <span className="ml-3 text-sm text-slate-600">{rating}/5</span>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="What stood out? Anything other families should know?"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
          >
            {submitting
              ? "Saving…"
              : existing
                ? "Update review"
                : "Submit review"}
          </button>
          {savedAt && (
            <span className="text-sm text-emerald-700">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </form>
    </div>
  );
}
