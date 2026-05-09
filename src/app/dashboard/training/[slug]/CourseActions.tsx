"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  slug: string;
  alreadyWatched: boolean;
  alreadyPassed: boolean;
};

export default function CourseActions({
  slug,
  alreadyWatched,
  alreadyPassed,
}: Props) {
  const router = useRouter();
  const [watched, setWatched] = useState(alreadyWatched);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function markWatched() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/training/${slug}/video-complete`, {
        method: "POST",
      });
      if (!res.ok) {
        setErr("Could not mark watched. Try again.");
        return;
      }
      setWatched(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (alreadyPassed) {
    return (
      <div className="flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm font-semibold">
          ✓ Passed
        </span>
        <a
          href={`/api/training/${slug}/certificate`}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
        >
          Download certificate
        </a>
        <Link
          href={`/dashboard/training/${slug}/quiz`}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900"
        >
          Retake quiz
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {!watched && (
        <button
          onClick={markWatched}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "Mark video watched"}
        </button>
      )}
      <Link
        href={`/dashboard/training/${slug}/quiz`}
        aria-disabled={!watched}
        className={`px-4 py-2 rounded-xl text-sm font-semibold ${
          watched
            ? "bg-teal-600 text-white"
            : "bg-slate-100 text-slate-400 pointer-events-none"
        }`}
      >
        Take quiz
      </Link>
      {err && <p className="text-sm text-rose-700">{err}</p>}
    </div>
  );
}
