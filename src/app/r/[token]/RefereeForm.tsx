"use client";

import { useState } from "react";

export default function RefereeForm({ token }: { token: string }) {
  const [rating, setRating] = useState<number>(5);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErr(null);
    try {
      const res = await fetch("/api/references/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          rating,
          recommend,
          comment: comment.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setState("err");
        setErr(prettyError(json.error));
        return;
      }
      setState("ok");
    } catch {
      setState("err");
      setErr("Network error. Please try again.");
    }
  }

  if (state === "ok") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800">
        Thank you! Your reference has been received.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Overall rating
        </label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="text-3xl leading-none focus:outline-none"
            >
              <span className={n <= rating ? "text-amber-500" : "text-slate-300"}>
                ★
              </span>
            </button>
          ))}
          <span className="ml-3 text-sm text-slate-600">{rating}/5</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Would you recommend this carer to others?
        </label>
        <div className="flex gap-2">
          {[
            { v: true, label: "Yes" },
            { v: false, label: "No" },
          ].map((opt) => {
            const on = recommend === opt.v;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setRecommend(opt.v)}
                className={`px-4 py-2 rounded-full border text-sm font-semibold transition ${
                  on
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Anything else you'd like families to know?{" "}
          <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="How long did you know them? In what capacity? Strengths?"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      {err && <p className="text-sm text-rose-700">{err}</p>}
      <button
        type="submit"
        disabled={state === "submitting"}
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60"
      >
        {state === "submitting" ? "Submitting…" : "Submit reference"}
      </button>
    </form>
  );
}

function prettyError(code: string | undefined): string {
  switch (code) {
    case "expired":
      return "This link has expired.";
    case "already_submitted":
      return "This reference has already been submitted.";
    case "not_found":
      return "Reference link not found.";
    default:
      return "Something went wrong. Please try again.";
  }
}
