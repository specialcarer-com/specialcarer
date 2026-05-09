import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isVerifiedCarer } from "@/lib/community/auth";
import { checkSlowMode } from "@/lib/community/slow-mode";

export const dynamic = "force-dynamic";

/**
 * POST /api/community/threads/[id]/posts
 * Body: { body_md }
 * Verified carer + 30s slow-mode + thread must be unlocked & non-deleted.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const bodyMd = typeof p.body_md === "string" ? p.body_md.trim() : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (bodyMd.length < 1 || bodyMd.length > 5000) {
    return NextResponse.json(
      { error: "body_length", message: "Reply must be 1–5000 characters." },
      { status: 400 },
    );
  }

  const ok = await isVerifiedCarer(supabase, user.id);
  if (!ok) {
    return NextResponse.json(
      {
        error: "not_verified",
        message: "Only verified carers can reply in the community.",
      },
      { status: 403 },
    );
  }

  const { data: thread } = await supabase
    .from("forum_threads")
    .select("id, is_locked, is_deleted")
    .eq("id", id)
    .maybeSingle<{ id: string; is_locked: boolean; is_deleted: boolean }>();
  if (!thread || thread.is_deleted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (thread.is_locked) {
    return NextResponse.json(
      { error: "locked", message: "This thread is locked." },
      { status: 409 },
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

  const { data, error } = await supabase
    .from("forum_posts")
    .insert({
      thread_id: id,
      author_user_id: user.id,
      body_md: bodyMd,
    })
    .select("id, body_md, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ post: data });
}
