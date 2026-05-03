"use client";

import { useState, useTransition } from "react";

export default function SaveButton({
  caregiverId,
  initiallySaved,
}: {
  caregiverId: string;
  initiallySaved: boolean;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const method = saved ? "DELETE" : "POST";
      const res = await fetch("/api/saved-caregivers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caregiver_id: caregiverId }),
      });
      if (res.ok) setSaved(!saved);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition disabled:opacity-50 ${
        saved
          ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
      aria-pressed={saved}
    >
      {saved ? "♥ Saved" : "♡ Save for later"}
    </button>
  );
}
