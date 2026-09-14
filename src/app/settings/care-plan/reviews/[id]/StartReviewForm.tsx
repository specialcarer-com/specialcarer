"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CarePlanReviewRow, ReviewCadenceMonths } from "@/lib/care-plan/reviews";
import { REVIEW_CADENCE_MONTHS } from "@/lib/care-plan/reviews";

export default function StartReviewForm({ review }: { review: CarePlanReviewRow }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [cadence, setCadence] = useState<ReviewCadenceMonths>(review.cadence_months);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/care-plan/reviews/${review.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerNotes: notes.trim() || null,
            nextCadenceMonths: cadence,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        next?: { scheduled_for?: string };
      };
      if (!res.ok) {
        setError(json.error ?? "Could not complete review.");
        return;
      }
      setInfo(
        `Review marked complete. Next review scheduled ${json.next?.scheduled_for ?? "shortly"}.`,
      );
      setTimeout(() => router.push("/settings/care-plan/reviews"), 900);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white border border-slate-200 p-6 space-y-5"
    >
      <div>
        <label
          htmlFor="reviewer-notes"
          className="block text-sm font-medium text-slate-900 mb-1"
        >
          Reviewer notes
        </label>
        <textarea
          id="reviewer-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          rows={6}
          placeholder="Confirm the care plan still fits, list any changes, or record why nothing needs updating."
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-500">
          Up to 4,000 characters. Notes are visible to the seeker, the carer on
          the booking, and admins.
        </p>
      </div>

      <div>
        <p className="block text-sm font-medium text-slate-900 mb-2">
          Cadence for the next review
        </p>
        <div className="flex gap-2">
          {REVIEW_CADENCE_MONTHS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                cadence === c
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700"
              }`}
              aria-pressed={cadence === c}
            >
              {c} months
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">
          {info}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-slate-700 underline hover:no-underline"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Saving…" : "Mark review complete"}
        </button>
      </div>
    </form>
  );
}
