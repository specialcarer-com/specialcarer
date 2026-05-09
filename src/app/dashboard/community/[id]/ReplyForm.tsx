"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  threadId: string;
  canPost: boolean;
  isLocked: boolean;
};

export default function ReplyForm({ threadId, canPost, isLocked }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        🔒 This thread is locked. New replies are disabled.
      </div>
    );
  }
  if (!canPost) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Only verified carers can reply. Complete vetting to unlock posting.
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/community/threads/${threadId}/posts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body_md: body.trim() }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          (json as { message?: string; error?: string })?.message ??
            (json as { error?: string })?.error ??
            "Could not post. Try again.",
        );
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <label
        className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
        htmlFor="reply-body"
      >
        Reply
      </label>
      <textarea
        id="reply-body"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder="Add to the conversation…"
      />
      {err && (
        <p
          aria-live="polite"
          className="text-xs text-rose-700"
        >
          {err}
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {body.trim().length} / 5000
        </p>
        <button
          onClick={submit}
          disabled={busy || body.trim().length < 1}
          className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post reply"}
        </button>
      </div>
    </div>
  );
}
