"use client";

import { useState } from "react";
import type { QuizQuestionPublic, Vertical } from "@/lib/vetting/types";

type Props = {
  vertical: Vertical;
  label: string;
  lastScore: number | null;
  lastPassed: boolean | null;
  lastAt: string | null;
};

type Phase = "summary" | "loading" | "quiz" | "result";

type StartResp = {
  questions: QuizQuestionPublic[];
  cooldown_until: string | null;
  pass_threshold: number;
};

type SubmitResp = {
  ok: boolean;
  score?: number;
  passed?: boolean;
  pass_threshold?: number;
  correct?: number;
  total?: number;
};

export default function SkillsQuizClient({
  vertical,
  label,
  lastScore,
  lastPassed,
  lastAt,
}: Props) {
  const [phase, setPhase] = useState<Phase>("summary");
  const [questions, setQuestions] = useState<QuizQuestionPublic[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [cooldown, setCooldown] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResp | null>(null);

  async function start() {
    setPhase("loading");
    setErr(null);
    try {
      const res = await fetch(
        `/api/carer/skills-quiz?vertical=${vertical}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as StartResp & { error?: string };
      if (!res.ok || !json.questions) {
        setErr(json.error ?? "Couldn't load quiz.");
        setPhase("summary");
        return;
      }
      setQuestions(json.questions);
      setAnswers(new Array(json.questions.length).fill(-1));
      setCooldown(json.cooldown_until ?? null);
      setPhase("quiz");
    } catch {
      setErr("Network error.");
      setPhase("summary");
    }
  }

  async function submit() {
    if (answers.some((a) => a < 0)) {
      setErr("Please answer every question.");
      return;
    }
    setErr(null);
    try {
      const res = await fetch("/api/carer/skills-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical, answers }),
      });
      const json = (await res.json()) as SubmitResp & { error?: string };
      if (!res.ok || json.ok === false) {
        setErr(json.error === "cooldown"
          ? "You can retake this quiz in 24 hours."
          : (json.error ?? "Couldn't submit."));
        return;
      }
      setResult(json);
      setPhase("result");
    } catch {
      setErr("Network error.");
    }
  }

  if (phase === "summary") {
    const cooldownActive =
      lastPassed === false && lastAt
        ? Date.now() - new Date(lastAt).getTime() < 24 * 3600 * 1000
        : false;
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 h-full flex flex-col">
        <p className="font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">
          {lastScore == null
            ? "Not started"
            : lastPassed
              ? `Passed · ${lastScore}%`
              : `Last attempt: ${lastScore}%`}
        </p>
        {cooldownActive ? (
          <p className="mt-2 text-xs text-slate-500">
            Retake available in 24h.
          </p>
        ) : null}
        <button
          type="button"
          onClick={start}
          disabled={cooldownActive}
          className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 self-start"
        >
          {lastPassed ? "Retake" : "Start quiz"}
        </button>
        {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        Loading…
      </div>
    );
  }

  if (phase === "quiz") {
    if (cooldown) {
      return (
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <p className="font-semibold text-slate-900">{label}</p>
          <p className="mt-1 text-sm text-slate-600">
            You can retake this quiz at{" "}
            {new Date(cooldown).toLocaleString("en-GB")}.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
        <p className="font-semibold text-slate-900">{label} quiz</p>
        <ol className="space-y-4">
          {questions.map((q, qi) => (
            <li key={q.id} className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                {qi + 1}. {q.prompt}
              </p>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                      answers[qi] === oi
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[qi] === oi}
                      onChange={() => {
                        const next = [...answers];
                        next[qi] = oi;
                        setAnswers(next);
                      }}
                      className="mt-0.5"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ol>
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <button
          type="button"
          onClick={submit}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
        >
          Submit
        </button>
      </div>
    );
  }

  // result
  const ok = !!result?.passed;
  return (
    <div
      className={`rounded-2xl border p-5 ${
        ok
          ? "bg-emerald-50 border-emerald-200"
          : "bg-rose-50 border-rose-200"
      }`}
    >
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-sm">
        {ok ? "Passed!" : "Not passed."} Score: {result?.score}% (
        {result?.correct}/{result?.total})
      </p>
      <p className="mt-1 text-xs text-slate-600">
        {ok
          ? "You're cleared for this vertical."
          : "Try again in 24 hours."}
      </p>
    </div>
  );
}
