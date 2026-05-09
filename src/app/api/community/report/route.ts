import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FORUM_REPORT_REASONS,
  type ForumReportReason,
} from "@/lib/community/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/community/report
 * Body: { threadId?, postId?, reason, description? }
 * Exactly one of threadId / postId is required.
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

  const threadId =
    typeof p.threadId === "string" && p.threadId ? p.threadId : null;
  const postId =
    typeof p.postId === "string" && p.postId ? p.postId : null;
  const reason = p.reason;
  const description =
    typeof p.description === "string" ? p.description.trim().slice(0, 1000) : "";

  if (!threadId && !postId) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }
  if (threadId && postId) {
    return NextResponse.json({ error: "ambiguous_target" }, { status: 400 });
  }
  if (
    typeof reason !== "string" ||
    !(FORUM_REPORT_REASONS as readonly string[]).includes(reason)
  ) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("forum_reports")
    .insert({
      reporter_user_id: user.id,
      thread_id: threadId,
      post_id: postId,
      reason: reason as ForumReportReason,
      description,
    })
    .select("id, status, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ report: data });
}
