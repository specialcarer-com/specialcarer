"use client";

import Link from "next/link";
import { useState } from "react";

type Question = {
  id: string;
  prompt: string;
  options: string[];
  explanation: string | null;
};

type SubmitResult = {
  score: number;
  passed: boolean;
  correct_indices: Record<string, number>;
  ceu_awarded: number;
  certificate_url: string | null;
};

type Props = {
  slug: string;
  courseTitle: string;
  questions: Question[];
};

export default function QuizClient({ slug, courseTitle, questions }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);

  const allAnswered = questions.every((q) => typeof answers[q.id] === "number");

  async function submit() {
    setBusy(true);
    setErr(null);
    setCooldownUntil(null);
    try {
      const payload = {
        answers: questions.map((q) => ({
          question_id: q.id,
          selected_index: answers[q.id],
        })),
      };
      const res = await fetch(`/api/training/${slug}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 429 && json?.cooldownUntil) {
        setCooldownUntil(json.cooldownUntil);
        return;
      }
      if (!res.ok) {
        setErr(json?.error ?? "Could not submit. Try again.");
        return;
      }
      setResult(json as SubmitResult);
    } finally {
      setBusy(false);
    }
  }

  if (cooldownUntil) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        You can retake this quiz after{" "}
        <strong>{new Date(cooldownUntil).toLocaleString()}</strong>.
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-5">
        <div
          className={`rounded-2xl border p-5 ${
            result.passed
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <p className="text-lg font-bold">
            {result.passed ? "Passed" : "Not passed"} — {result.score}%
          </p>
          {result.passed ? (
            <p className="text-sm mt-1">
              You earned {result.ceu_awarded.toFixed(2)} CEU credits for{" "}
              {courseTitle}.
            </p>
          ) : (
            <p className="text-sm mt-1">
              You need at least 80% to pass. You can try again after a short
              cooldown (1 hour).
            </p>
          )}
        </div>

        <ol className="space-y-3 list-decimal pl-6">
          {questions.map((q) => {
            const correct = result.correct_indices[q.id];
            const selected = answers[q.id];
            const right = selected === correct;
            return (
              <li key={q.id}>
                <p className="font-semibold text-slate-900">{q.prompt}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {q.options.map((opt, idx) => {
                    const isCorrect = idx === correct;
                    const isSelected = idx === selected;
                    return (
                      <li
                        key={idx}
                        className={`px-3 py-1.5 rounded-md border ${
                          isCorrect
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : isSelected
                              ? "border-rose-300 bg-rose-50 text-rose-900"
                              : "border-slate-200 text-slate-700"
                        }`}
                      >
                        {opt}
                        {isCorrect && " ✓"}
                        {!isCorrect && isSelected && " ✗"}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation && (
                  <p
                    className={`mt-2 text-xs ${
                      right ? "text-slate-500" : "text-slate-700"
                    }`}
                  >
                    {q.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-3">
          {result.passed && result.certificate_url && (
            <a
              href={result.certificate_url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Download certificate
            </a>
          )}
          {!result.passed && (
            <Link
              href={`/dashboard/training/${slug}`}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              Back to course
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-5 list-decimal pl-6">
        {questions.map((q) => (
          <li key={q.id}>
            <p className="font-semibold text-slate-900">{q.prompt}</p>
            <ul className="mt-2 space-y-1.5">
              {q.options.map((opt, idx) => (
                <li key={idx}>
                  <label className="flex items-start gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === idx}
                      onChange={() =>
                        setAnswers((p) => ({ ...p, [q.id]: idx }))
                      }
                      className="mt-1"
                    />
                    <span className="text-sm text-slate-800">{opt}</span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {err && <p className="text-sm text-rose-700">{err}</p>}

      <button
        onClick={submit}
        disabled={!allAnswered || busy}
        className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Submitting…" : "Submit answers"}
      </button>
    </div>
  );
}
