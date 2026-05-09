import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SURGE_MAX_MULTIPLIER } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

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
  const update: Record<string, unknown> = {};
  if (typeof p.multiplier === "number") {
    if (p.multiplier < 1 || p.multiplier > SURGE_MAX_MULTIPLIER) {
      return NextResponse.json(
        { error: "invalid_multiplier" },
        { status: 400 },
      );
    }
    update.multiplier = p.multiplier;
  }
  if (typeof p.active === "boolean") update.active = p.active;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("surge_rules")
    .update(update)
    .eq("id", id)
    .select("id, multiplier, active")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "surge_rule.update",
    targetType: "surge_rule",
    targetId: id,
    details: update,
  });
  return NextResponse.json({ rule: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("surge_rules").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAdminAction({
    admin: me,
    action: "surge_rule.delete",
    targetType: "surge_rule",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
