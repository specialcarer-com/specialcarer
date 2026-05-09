"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar, Button } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  FORUM_CATEGORY_LABEL,
  FORUM_REPORT_REASONS,
  FORUM_REPORT_REASON_LABEL,
  type ForumCategory,
  type ForumPost,
  type ForumReportReason,
  type ForumThread,
} from "@/lib/community/types";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB");
}

export default function MobileThreadDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const supabase = createClient();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [nameById, setNameById] = useState<Map<string, string | null>>(
    new Map(),
  );
  const [canPost, setCanPost] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<
    { kind: "thread"; id: string } | { kind: "post"; id: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/m/login?redirect=/m/community/${id}`);
        return;
      }
      const { data: t } = await supabase
        .from("forum_threads")
        .select(
          "id, author_user_id, category, title, body_md, is_pinned, is_locked, is_deleted, reply_count, last_post_at, created_at",
        )
        .eq("id", id)
        .maybeSingle<ForumThread>();
      if (cancelled) return;
      if (!t || t.is_deleted) {
        setErr("Thread not found.");
        return;
      }
      setThread(t);
      const { data: p } = await supabase
        .from("forum_posts")
        .select("id, thread_id, author_user_id, body_md, is_deleted, created_at")
        .eq("thread_id", id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const list = (p ?? []) as ForumPost[];
      setPosts(list);

      const ids = Array.from(
        new Set([t.author_user_id, ...list.map((x) => x.author_user_id)]),
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (!cancelled) {
        setNameById(
          new Map(
            (profiles ?? []).map((pp) => [
              pp.id as string,
              pp.full_name as string | null,
            ]),
          ),
        );
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
  }, [id]);

  async function submitReply() {
    if (!thread) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/community/threads/${thread.id}/posts`,
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
            "Could not post reply.",
        );
        return;
      }
      setBody("");
      // Re-fetch posts.
      const { data: p } = await supabase
        .from("forum_posts")
        .select("id, thread_id, author_user_id, body_md, is_deleted, created_at")
        .eq("thread_id", thread.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });
      setPosts((p ?? []) as ForumPost[]);
    } finally {
      setBusy(false);
    }
  }

  if (err && !thread) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Thread" back="/m/community" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">{err}</p>
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Thread" back="/m/community" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title="Thread" back="/m/community" />
      <div className="px-5 pt-3 space-y-3">
        <p className="text-[11px] text-subheading">
          {FORUM_CATEGORY_LABEL[thread.category as ForumCategory]}
          {thread.is_pinned && " · 📌 pinned"}
          {thread.is_locked && " · 🔒 locked"}
        </p>
        <h1 className="text-[18px] font-bold text-heading">{thread.title}</h1>
        <div className="rounded-card bg-white p-4 shadow-card">
          <p className="text-[11.5px] text-subheading">
            {nameById.get(thread.author_user_id) ?? "Carer"} ·{" "}
            {fmt(thread.created_at)}
          </p>
          <p className="mt-2 text-[13.5px] text-heading whitespace-pre-wrap leading-relaxed">
            {thread.body_md}
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setReportFor({ kind: "thread", id: thread.id })}
              className="text-[11px] text-subheading"
            >
              Report
            </button>
          </div>
        </div>

        <p className="mt-2 text-[11px] uppercase tracking-wide text-subheading font-semibold">
          Replies ({posts.length})
        </p>
        {posts.length === 0 ? (
          <div className="rounded-card bg-white p-4 text-[13px] text-subheading shadow-card">
            No replies yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((p) => (
              <li
                key={p.id}
                className="rounded-card bg-white p-4 shadow-card"
              >
                <p className="text-[11.5px] text-subheading">
                  {nameById.get(p.author_user_id) ?? "Carer"} ·{" "}
                  {fmt(p.created_at)}
                </p>
                <p className="mt-2 text-[13px] text-heading whitespace-pre-wrap leading-relaxed">
                  {p.body_md}
                </p>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setReportFor({ kind: "post", id: p.id })}
                    className="text-[11px] text-subheading"
                  >
                    Report
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reportFor && (
        <ReportSheet
          target={reportFor}
          onClose={() => setReportFor(null)}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        {thread.is_locked ? (
          <p className="text-[12.5px] text-subheading text-center">
            🔒 This thread is locked.
          </p>
        ) : !canPost ? (
          <p className="text-[12.5px] text-subheading text-center">
            Only verified carers can reply.
          </p>
        ) : (
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              rows={2}
              className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
              placeholder="Add to the conversation…"
            />
            {err && (
              <p aria-live="polite" className="text-[11.5px] text-rose-700">
                {err}
              </p>
            )}
            <Button
              block
              onClick={submitReply}
              disabled={busy || body.trim().length < 1}
            >
              {busy ? "Posting…" : "Post reply"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportSheet({
  target,
  onClose,
}: {
  target: { kind: "thread"; id: string } | { kind: "post"; id: string };
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ForumReportReason>("spam");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const body =
        target.kind === "thread"
          ? { threadId: target.id, reason, description }
          : { postId: target.id, reason, description };
      const res = await fetch("/api/community/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { message?: string }).message ?? "Could not report.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40"
      onClick={onClose}
    >
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-card bg-white p-5 space-y-3 sc-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[14px] font-bold text-heading">Report</p>
        {done ? (
          <p className="text-[13px] text-emerald-700">
            Thanks — our trust &amp; safety team will review it.
          </p>
        ) : (
          <>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ForumReportReason)}
              className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
            >
              {FORUM_REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {FORUM_REPORT_REASON_LABEL[r]}
                </option>
              ))}
            </select>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Optional details"
              className="w-full rounded-lg border border-line px-3 py-2 text-[13px]"
            />
            {err && (
              <p aria-live="polite" className="text-[11.5px] text-rose-700">
                {err}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" block onClick={onClose}>
                Cancel
              </Button>
              <Button block onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </>
        )}
        {done && (
          <Button block variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
