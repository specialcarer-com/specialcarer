import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedCarer } from "@/lib/community/auth";
import { checkSlowMode } from "@/lib/community/slow-mode";
import {
  FORUM_CATEGORIES,
  FORUM_PAGE_SIZE,
  type ForumCategory,
} from "@/lib/community/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/threads?category=...&cursor=ISO_DATE
 * Lists non-deleted threads, pinned first, then by last_post_at desc.
 * Cursor is the last_post_at timestamp of the previous page's last row.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const cursor = url.searchParams.get("cursor");

  let q = supabase
    .from("forum_threads")
    .select(
      "id, author_user_id, category, title, body_md, is_pinned, is_locked, reply_count, last_post_at, created_at",
    )
    .eq("is_deleted", false)
    .order("is_pinned", { ascending: false })
    .order("last_post_at", { ascending: false })
    .limit(FORUM_PAGE_SIZE);

  if (
    category &&
    (FORUM_CATEGORIES as readonly string[]).includes(category)
  ) {
    q = q.eq("category", category);
  }
  if (cursor) {
    q = q.lt("last_post_at", cursor);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = data ?? [];
  const next =
    list.length === FORUM_PAGE_SIZE ? list[list.length - 1].last_post_at : null;

  return NextResponse.json({ threads: list, nextCursor: next });
}

/**
 * POST /api/community/threads
 * Body: { category, title, body_md }
 * Verified carers only; 30-second slow-mode.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const ok = await isVerifiedCarer(supabase, user.id);
  if (!ok) {
    return NextResponse.json(
      {
        error: "not_verified",
        message:
          "Only verified carers can post in the community. Complete vetting to unlock posting.",
      },
      { status: 403 },
    );
  }

  const wait = await checkSlowMode(supabase, user.id);
  if (wait != null) {
    return NextResponse.json(
      {
        error: "slow_mode",
        message: `Please wait ${wait} more seconds before posting again.`,
        retryInSeconds: wait,
      },
      { status: 429 },
    );
  }

  const category = p.category;
  const title = typeof p.title === "string" ? p.title.trim() : "";
  const bodyMd = typeof p.body_md === "string" ? p.body_md.trim() : "";

  if (
    typeof category !== "string" ||
    !(FORUM_CATEGORIES as readonly string[]).includes(category)
  ) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  if (title.length < 5 || title.length > 200) {
    return NextResponse.json(
      { error: "title_length", message: "Title must be 5–200 characters." },
      { status: 400 },
    );
  }
  if (bodyMd.length < 10 || bodyMd.length > 5000) {
    return NextResponse.json(
      { error: "body_length", message: "Body must be 10–5000 characters." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("forum_threads")
    .insert({
      author_user_id: user.id,
      category: category as ForumCategory,
      title,
      body_md: bodyMd,
    })
    .select("id, category, title, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ thread: data });
}
