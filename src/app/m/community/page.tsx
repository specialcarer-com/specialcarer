"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar, Button } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  FORUM_CATEGORIES,
  FORUM_CATEGORY_LABEL,
  FORUM_PAGE_SIZE,
  type ForumCategory,
  type ForumThread,
} from "@/lib/community/types";

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function MobileCommunityPage() {
  const supabase = createClient();
  const [threads, setThreads] = useState<ForumThread[] | null>(null);
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setThreads([]);
        setErr("Sign in to view the community.");
        return;
      }
      // Verified-carer check (counts approved certs).
      const { count } = await supabase
        .from("carer_certifications")
        .select("id", { count: "exact", head: true })
        .eq("carer_id", user.id)
        .eq("status", "verified");
      if (!cancelled) setCanPost((count ?? 0) > 0);

      let q = supabase
        .from("forum_threads")
        .select(
          "id, author_user_id, category, title, body_md, is_pinned, is_locked, is_deleted, reply_count, last_post_at, created_at",
        )
        .eq("is_deleted", false)
        .order("is_pinned", { ascending: false })
        .order("last_post_at", { ascending: false })
        .limit(FORUM_PAGE_SIZE);
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setThreads([]);
        return;
      }
      setThreads((data ?? []) as ForumThread[]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Community" back="/m/support" />
      <div className="px-5 pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-subheading">
            Tips, stories, peer support.
          </p>
          {canPost && (
            <Link href="/m/community/new">
              <Button size="sm">+ New</Button>
            </Link>
          )}
        </div>
        <div className="-mx-5 px-5 overflow-x-auto">
          <div className="flex gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`shrink-0 text-[12px] px-3 py-1.5 rounded-pill border ${
                !category
                  ? "bg-heading text-white border-heading"
                  : "bg-white text-heading border-line"
              }`}
            >
              All
            </button>
            {FORUM_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`shrink-0 text-[12px] px-3 py-1.5 rounded-pill border ${
                  category === c
                    ? "bg-heading text-white border-heading"
                    : "bg-white text-heading border-line"
                }`}
              >
                {FORUM_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-[12px] text-rose-700">{err}</p>}

        {threads === null ? (
          <p className="text-[13px] text-subheading text-center py-6">
            Loading…
          </p>
        ) : threads.length === 0 ? (
          <div className="rounded-card bg-white p-5 text-center text-[13px] text-subheading shadow-card">
            No threads yet. Be the first to start one.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/m/community/${t.id}`}
                  className="block rounded-card bg-white p-4 shadow-card active:bg-muted/40"
                >
                  <p className="text-[11px] text-subheading">
                    {FORUM_CATEGORY_LABEL[t.category]} ·{" "}
                    {fmtRelative(t.last_post_at)}
                    {t.is_pinned && " · 📌"}
                    {t.is_locked && " · 🔒"}
                  </p>
                  <p className="mt-1 text-[14.5px] font-bold text-heading">
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subheading line-clamp-2">
                    {t.body_md}
                  </p>
                  <p className="mt-1 text-[11px] text-subheading">
                    {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
