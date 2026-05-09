import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ACTIONS = [
  "soft_delete_thread",
  "soft_delete_post",
  "lock_thread",
  "none",
] as const;
type Action = (typeof ACTIONS)[number];

/**
 * PATCH /api/admin/community/reports/[id]
 * Body: { status: 'open'|'dismissed'|'actioned', action: Action }
 *
 * The action enacts a moderation step on the linked thread/post in
 * the same call as transitioning the report status.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const status = p.status;
  const action = (p.action ?? "none") as Action;

  if (!["open", "dismissed", "actioned"].includes(String(status))) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the report to know what target to act on.
  const { data: report } = await admin
    .from("forum_reports")
    .select("id, thread_id, post_id")
    .eq("id", id)
    .maybeSingle<{ id: string; thread_id: string | null; post_id: string | null }>();
  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Apply moderation action first.
  if (action === "soft_delete_thread" && report.thread_id) {
    await admin
      .from("forum_threads")
      .update({ is_deleted: true })
      .eq("id", report.thread_id);
  } else if (action === "soft_delete_post" && report.post_id) {
    await admin
      .from("forum_posts")
      .update({ is_deleted: true })
      .eq("id", report.post_id);
  } else if (action === "lock_thread" && report.thread_id) {
    await admin
      .from("forum_threads")
      .update({ is_locked: true })
      .eq("id", report.thread_id);
  }

  // Update the report itself.
  const update: Record<string, unknown> = { status };
  if (status !== "open") {
    update.resolved_by = me.id;
    update.resolved_at = new Date().toISOString();
  }
  const { data, error } = await admin
    .from("forum_reports")
    .update(update)
    .eq("id", id)
    .select("id, status, resolved_by, resolved_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin: me,
    action: "forum_report.update",
    targetType: "forum_report",
    targetId: id,
    details: { status, action },
  });

  return NextResponse.json({ report: data, action });
}
