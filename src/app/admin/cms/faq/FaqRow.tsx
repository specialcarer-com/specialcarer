"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  initial: {
    category: string;
    question: string;
    answer_md: string;
    sort_order: number;
    audience: string[];
    status: string;
  };
};

export default function FaqRow({ id, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(initial.category);
  const [question, setQuestion] = useState(initial.question);
  const [answer, setAnswer] = useState(initial.answer_md);
  const [sortOrder, setSortOrder] = useState(initial.sort_order);
  const [status, setStatus] = useState(initial.status);
  const [audience, setAudience] = useState(initial.audience.join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/cms/faqs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          question,
          answer_md: answer,
          sort_order: sortOrder,
          status,
          audience: audience
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-teal-700 hover:underline"
      >
        Edit →
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
      <div className="grid sm:grid-cols-3 gap-2">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="rounded border border-slate-200 px-2 py-1"
        />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question"
          className="rounded border border-slate-200 px-2 py-1 sm:col-span-2"
        />
      </div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
        placeholder="Answer (markdown)"
        className="w-full rounded border border-slate-200 px-2 py-1"
      />
      <div className="grid sm:grid-cols-3 gap-2">
        <label>
          Sort order
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1"
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label>
          Audience (csv)
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1"
          />
        </label>
      </div>
      {err && (
        <p aria-live="polite" className="text-rose-700">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setOpen(false)}
          className="px-2.5 py-1 rounded border border-slate-200"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="px-2.5 py-1 rounded bg-slate-900 text-white"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
