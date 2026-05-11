import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEAVE_REQUEST_STATUSES } from "@/lib/safety/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/safety/leave-requests/[id]
 * Body: { status?, adminNotes? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  if (typeof p.status === "string") {
    if (!(LEAVE_REQUEST_STATUSES as readonly string[]).includes(p.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    update.status = p.status;
    if (p.status !== "open") {
      update.resolved_by = me.id;
      update.resolved_at = new Date().toISOString();
    }
  }
  if (typeof p.adminNotes === "string") {
    update.admin_notes = p.adminNotes.slice(0, 2000);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_requests")
    .update(update)
    .eq("id", id)
    .select("id, status, admin_notes, resolved_by, resolved_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "leave_request.update",
    targetType: "leave_request",
    targetId: id,
    details: update,
  });
  return NextResponse.json({ request: data });
}
