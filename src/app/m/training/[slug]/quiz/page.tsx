"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar, Button } from "../../../_components/ui";
import { createClient } from "@/lib/supabase/client";

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

export default function MobileQuizPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const supabase = createClient();
  const [title, setTitle] = useState<string>("Quiz");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: c } = await supabase
        .from("training_courses")
        .select("id, title")
        .eq("slug", slug)
        .maybeSingle();
      if (!c || cancelled) return;
      setTitle(c.title);
      const { data: qs } = await supabase
        .from("training_quiz_questions")
        .select("id, prompt, options, explanation")
        .eq("course_id", c.id)
        .order("sort_order", { ascending: true });
      if (!cancelled) setQuestions((qs ?? []) as Question[]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function submit() {
    if (!questions) return;
    setBusy(true);
    setErr(null);
    setCooldownUntil(null);
    try {
      const res = await fetch(`/api/training/${slug}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((q) => ({
            question_id: q.id,
            selected_index: answers[q.id],
          })),
        }),
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

  if (!questions) {
    return (
      <div className="min-h-screen bg-bg-screen pb-32">
        <TopBar title="Quiz" back={`/m/training/${slug}`} />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  const allAnswered = questions.every((q) => typeof answers[q.id] === "number");

  if (cooldownUntil) {
    return (
      <div className="min-h-screen bg-bg-screen pb-32">
        <TopBar title="Quiz" back={`/m/training/${slug}`} />
        <div className="px-5 pt-4">
          <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
            You can retake this quiz after{" "}
            <strong>{new Date(cooldownUntil).toLocaleString()}</strong>.
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-bg-screen pb-32">
        <TopBar title="Quiz result" back={`/m/training/${slug}`} />
        <div className="px-5 pt-3 space-y-4">
          <div
            className={`rounded-card p-4 ${
              result.passed
                ? "bg-status-completed text-[#2C7A3F]"
                : "bg-rose-50 text-rose-900"
            }`}
          >
            <p className="text-[16px] font-bold">
              {result.passed ? "Passed" : "Not passed"} — {result.score}%
            </p>
            {result.passed ? (
              <p className="mt-1 text-[13px]">
                You earned {result.ceu_awarded.toFixed(2)} CEU credits.
              </p>
            ) : (
              <p className="mt-1 text-[13px]">
                Need at least 80%. Try again after a 1-hour cooldown.
              </p>
            )}
          </div>

          <ol className="space-y-3 list-decimal pl-5">
            {questions.map((q) => {
              const correct = result.correct_indices[q.id];
              const selected = answers[q.id];
              return (
                <li key={q.id} className="rounded-card bg-white p-4 shadow-card">
                  <p className="text-[13.5px] font-semibold text-heading">
                    {q.prompt}
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[12.5px]">
                    {q.options.map((opt, idx) => {
                      const isCorrect = idx === correct;
                      const isSelected = idx === selected;
                      return (
                        <li
                          key={idx}
                          className={`px-2.5 py-1.5 rounded-md border ${
                            isCorrect
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                              : isSelected
                                ? "border-rose-300 bg-rose-50 text-rose-900"
                                : "border-line text-heading"
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
                    <p className="mt-2 text-[11.5px] text-subheading">
                      {q.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
            {result.passed && result.certificate_url ? (
              <a
                href={result.certificate_url}
                target="_blank"
                rel="noreferrer"
              >
                <Button block>Download certificate</Button>
              </a>
            ) : (
              <Link href={`/m/training/${slug}`}>
                <Button block>Back to course</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title={`Quiz: ${title}`} back={`/m/training/${slug}`} />
      <div className="px-5 pt-3 space-y-3">
        <p className="text-[12px] text-subheading">
          Pass with 80% or higher (4 of 5).
        </p>
        <ol className="space-y-3 list-decimal pl-5">
          {questions.map((q) => (
            <li key={q.id} className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[13.5px] font-semibold text-heading">
                {q.prompt}
              </p>
              <ul className="mt-2 space-y-1.5">
                {q.options.map((opt, idx) => (
                  <li key={idx}>
                    <label className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line">
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === idx}
                        onChange={() =>
                          setAnswers((p) => ({ ...p, [q.id]: idx }))
                        }
                        className="mt-1"
                      />
                      <span className="text-[13px] text-heading">{opt}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {err && <p className="text-[12px] text-rose-700">{err}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={submit} disabled={!allAnswered || busy}>
          {busy ? "Submitting…" : "Submit answers"}
        </Button>
      </div>
    </div>
  );
}
