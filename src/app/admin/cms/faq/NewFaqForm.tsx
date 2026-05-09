"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewFaqForm() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/cms/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          question: question.trim(),
          answer_md: answer,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      setCategory("");
      setQuestion("");
      setAnswer("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-900">New FAQ</p>
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category (e.g. Safety)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
        placeholder="Answer (markdown)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
      />
      {err && (
        <p aria-live="polite" className="text-xs text-rose-700">
          {err}
        </p>
      )}
      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={busy || !category.trim() || !question.trim()}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add FAQ"}
        </button>
      </div>
    </div>
  );
}
