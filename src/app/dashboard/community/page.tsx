import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  FORUM_CATEGORIES,
  FORUM_CATEGORY_LABEL,
  FORUM_PAGE_SIZE,
  type ForumCategory,
  type ForumThread,
} from "@/lib/community/types";
import { isVerifiedCarer } from "@/lib/community/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community — SpecialCarer" };

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function CommunityHubPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const category =
    sp.category && (FORUM_CATEGORIES as readonly string[]).includes(sp.category)
      ? (sp.category as ForumCategory)
      : null;
  const cursor = sp.cursor ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/community");
  const canPost = await isVerifiedCarer(supabase, user.id);

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
  if (cursor) q = q.lt("last_post_at", cursor);
  const { data } = await q;
  const list = (data ?? []) as ForumThread[];
  const next =
    list.length === FORUM_PAGE_SIZE ? list[list.length - 1].last_post_at : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Carer community</h1>
        {canPost ? (
          <Link
            href="/dashboard/community/new"
            className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
          >
            + New thread
          </Link>
        ) : (
          <span className="text-xs text-slate-500">
            Verified carers can post — complete vetting first.
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/dashboard/community"
          className={`text-xs px-3 py-1.5 rounded-full border ${
            !category
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200"
          }`}
        >
          All
        </Link>
        {FORUM_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/dashboard/community?category=${c}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              category === c
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {FORUM_CATEGORY_LABEL[c]}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No threads yet in this category. Be the first to start a conversation.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl bg-white border border-slate-200 p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    {FORUM_CATEGORY_LABEL[t.category]} ·{" "}
                    {fmtRelative(t.last_post_at)}
                    {t.is_pinned && " · 📌 pinned"}
                    {t.is_locked && " · 🔒 locked"}
                  </p>
                  <Link
                    href={`/dashboard/community/${t.id}`}
                    className="block mt-1 font-semibold text-slate-900 hover:underline"
                  >
                    {t.title}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                    {t.body_md}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/support"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Support
        </Link>
        {next && (
          <Link
            href={`/dashboard/community?${category ? `category=${category}&` : ""}cursor=${encodeURIComponent(next)}`}
            className="text-sm font-semibold text-slate-900 hover:underline"
          >
            Older threads →
          </Link>
        )}
      </div>
    </div>
  );
}
