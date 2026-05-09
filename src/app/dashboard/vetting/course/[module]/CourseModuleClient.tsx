"use client";

import { useEffect, useState } from "react";

export default function CourseModuleClient({
  moduleKey,
  question,
  options,
  initiallyRead,
  previousCorrect,
}: {
  moduleKey: string;
  question: string;
  options: string[];
  initiallyRead: boolean;
  previousCorrect: boolean | null;
}) {
  const [read, setRead] = useState<boolean>(initiallyRead);
  const [answer, setAnswer] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    null | { correct: boolean; correct_index: number }
  >(
    previousCorrect == null
      ? null
      : { correct: previousCorrect, correct_index: -1 },
  );
  const [err, setErr] = useState<string | null>(null);

  // Mark as read once the user lands on the page — the body is short.
  useEffect(() => {
    if (read) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/carer/course/${moduleKey}/read`,
          { method: "POST" },
        );
        if (!cancelled && res.ok) setRead(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleKey, read]);

  async function submit() {
    if (answer == null) {
      setErr("Pick an answer first.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/carer/course/${moduleKey}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const json = (await res.json()) as {
        correct?: boolean;
        correct_index?: number;
        error?: string;
      };
      if (!res.ok || typeof json.correct !== "boolean") {
        setErr(json.error ?? "Couldn't submit.");
        return;
      }
      setResult({
        correct: json.correct,
        correct_index: json.correct_index ?? -1,
      });
    } catch {
      setErr("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
      <h2 className="font-semibold text-slate-900">Knowledge check</h2>
      <p className="text-sm text-slate-700">{question}</p>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <label
            key={i}
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
              answer === i
                ? "border-slate-900 bg-slate-50"
                : "border-slate-200"
            }`}
          >
            <input
              type="radio"
              name="check"
              checked={answer === i}
              onChange={() => setAnswer(i)}
              className="mt-0.5"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      {err && <p className="text-sm text-rose-700">{err}</p>}
      {!result && (
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      )}
      {result && (
        <div
          className={`rounded-xl p-3 text-sm border ${
            result.correct
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {result.correct
            ? "Correct — module complete."
            : "Not quite. Re-read the material and try again."}
          {!result.correct && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setAnswer(null);
                }}
                className="text-xs font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
