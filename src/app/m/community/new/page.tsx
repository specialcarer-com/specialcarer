"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar, Button, Input, TextArea } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  FORUM_CATEGORIES,
  FORUM_CATEGORY_LABEL,
  type ForumCategory,
} from "@/lib/community/types";

export default function MobileNewThread() {
  const router = useRouter();
  const supabase = createClient();
  const [canPost, setCanPost] = useState<boolean | null>(null);
  const [category, setCategory] = useState<ForumCategory>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/m/login?redirect=/m/community/new");
        return;
      }
      const { count } = await supabase
        .from("carer_certifications")
        .select("id", { count: "exact", head: true })
        .eq("carer_id", user.id)
        .eq("status", "verified");
      if (!cancelled) setCanPost((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      router.replace(
        `/m/community/${(json as { thread: { id: string } }).thread.id}`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (canPost === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="New thread" back="/m/community" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }
  if (!canPost) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="New thread" back="/m/community" />
        <div className="px-5 pt-4 space-y-3">
          <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
            Only verified carers can post in the community. Complete vetting to
            unlock posting.
          </div>
        </div>
      </div>
    );
  }

  const titleOk = title.trim().length >= 5 && title.trim().length <= 200;
  const bodyOk = body.trim().length >= 10 && body.trim().length <= 5000;

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title="New thread" back="/m/community" />
      <div className="px-5 pt-3 space-y-3">
        <label className="block">
          <span className="block text-[13px] font-semibold text-heading mb-1">
            Category
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ForumCategory)}
            className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
          >
            {FORUM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FORUM_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="A short, specific summary"
          hint={`${title.trim().length} / 200`}
        />
        <TextArea
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={6}
          placeholder="What would you like to share or ask?"
          hint={`${body.trim().length} / 5000`}
        />

        {err && (
          <p aria-live="polite" className="text-[12px] text-rose-700">
            {err}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button
          block
          disabled={!titleOk || !bodyOk || busy}
          onClick={submit}
        >
          {busy ? "Posting…" : "Post thread"}
        </Button>
      </div>
    </div>
  );
}
