"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FORUM_CATEGORIES,
  FORUM_CATEGORY_LABEL,
  type ForumCategory,
} from "@/lib/community/types";

export default function NewThreadForm() {
  const router = useRouter();
  const [category, setCategory] = useState<ForumCategory>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titleOk = title.trim().length >= 5 && title.trim().length <= 200;
  const bodyOk = body.trim().length >= 10 && body.trim().length <= 5000;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/community/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: title.trim(),
          body_md: body.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          (json as { message?: string; error?: string })?.message ??
            (json as { error?: string })?.error ??
            "Could not create thread.",
        );
        return;
      }
      router.push(`/dashboard/community/${(json as { thread: { id: string } }).thread.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm font-semibold text-slate-900 mb-1">
          Category
        </span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ForumCategory)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {FORUM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FORUM_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-slate-900 mb-1">
          Title
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="A short, specific summary"
        />
        <span className="text-xs text-slate-500">{title.trim().length} / 200</span>
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-slate-900 mb-1">
          Body
        </span>
        <textarea
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="What would you like to share or ask?"
        />
        <span className="text-xs text-slate-500">{body.trim().length} / 5000</span>
      </label>

      {err && (
        <p aria-live="polite" className="text-sm text-rose-700">
          {err}
        </p>
      )}

      <button
        onClick={submit}
        disabled={!titleOk || !bodyOk || busy}
        className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Posting…" : "Post thread"}
      </button>
    </div>
  );
}
