import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FORUM_PAGE_SIZE } from "@/lib/community/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/threads/[id]?cursor=ISO_DATE
 * Returns the thread + a page of (non-deleted) replies, oldest first.
 * Cursor is created_at of the previous page's last row.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: thread, error: tErr } = await supabase
    .from("forum_threads")
    .select(
      "id, author_user_id, category, title, body_md, is_pinned, is_locked, is_deleted, reply_count, last_post_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }
  if (!thread || thread.is_deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");

  let q = supabase
    .from("forum_posts")
    .select("id, thread_id, author_user_id, body_md, created_at")
    .eq("thread_id", id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .limit(FORUM_PAGE_SIZE);
  if (cursor) q = q.gt("created_at", cursor);

  const { data: posts, error: pErr } = await q;
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const list = posts ?? [];
  const next =
    list.length === FORUM_PAGE_SIZE ? list[list.length - 1].created_at : null;

  return NextResponse.json({ thread, posts: list, nextCursor: next });
}
