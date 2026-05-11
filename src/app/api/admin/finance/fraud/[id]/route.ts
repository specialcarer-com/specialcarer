import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FRAUD_SIGNAL_STATUSES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/finance/fraud/[id]
 * Body: { status: 'new'|'reviewing'|'cleared'|'confirmed' }
 * Stamps reviewed_by + reviewed_at when transitioning out of `new`.
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
  const status = p.status;
  if (
    typeof status !== "string" ||
    !(FRAUD_SIGNAL_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { status };
  if (status !== "new") {
    update.reviewed_by = me.id;
    update.reviewed_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fraud_signals")
    .update(update)
    .eq("id", id)
    .select("id, status, reviewed_by, reviewed_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "fraud_signal.update",
    targetType: "fraud_signal",
    targetId: id,
    details: { status },
  });
  return NextResponse.json({ signal: data });
}
