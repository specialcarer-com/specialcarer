import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedCarer } from "@/lib/community/auth";
import {
  FORUM_CATEGORY_LABEL,
  type ForumPost,
  type ForumThread,
} from "@/lib/community/types";
import ReplyForm from "./ReplyForm";
import ReportButton from "./ReportButton";

export const dynamic = "force-dynamic";

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/community/${id}`);

  const { data: thread } = await supabase
    .from("forum_threads")
    .select(
      "id, author_user_id, category, title, body_md, is_pinned, is_locked, is_deleted, reply_count, last_post_at, created_at",
    )
    .eq("id", id)
    .maybeSingle<ForumThread>();
  if (!thread || thread.is_deleted) notFound();

  const { data: posts } = await supabase
    .from("forum_posts")
    .select("id, thread_id, author_user_id, body_md, is_deleted, created_at")
    .eq("thread_id", id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });
  const list = (posts ?? []) as ForumPost[];

  // Resolve author display names (one batch).
  const authorIds = Array.from(
    new Set([thread.author_user_id, ...list.map((p) => p.author_user_id)]),
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", authorIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]),
  );

  const canPost = await isVerifiedCarer(supabase, user.id);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/community"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Community
        </Link>
        <span className="text-xs text-slate-500">
          {FORUM_CATEGORY_LABEL[thread.category]}
        </span>
      </div>

      <article className="rounded-2xl bg-white border border-slate-200 p-5">
        <h1 className="text-xl font-bold text-slate-900">{thread.title}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {nameById.get(thread.author_user_id) ?? "Carer"} ·{" "}
          {new Date(thread.created_at).toLocaleString("en-GB")}
        </p>
        <div className="mt-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
          {thread.body_md}
        </div>
        <div className="mt-3 flex justify-end">
          <ReportButton threadId={thread.id} />
        </div>
      </article>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Replies ({list.length})
        </h2>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No replies yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((p) => (
              <li
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs text-slate-500">
                  {nameById.get(p.author_user_id) ?? "Carer"} ·{" "}
                  {new Date(p.created_at).toLocaleString("en-GB")}
                </p>
                <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {p.body_md}
                </p>
                <div className="mt-2 flex justify-end">
                  <ReportButton postId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReplyForm
        threadId={thread.id}
        canPost={canPost}
        isLocked={thread.is_locked}
      />
    </div>
  );
}
