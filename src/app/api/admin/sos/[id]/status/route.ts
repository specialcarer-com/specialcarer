/**
 * POST /api/admin/sos/[id]/status
 * Body: { status: "acknowledged" | "resolved" }
 *
 * Admin-only. Updates an SOS alert's status, stamps acknowledged_by /
 * acknowledged_at / resolved_at as appropriate, and writes an audit log
 * row.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const adminUser = guard.admin;

  // --- Body ---
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const next = (payload as { status?: string })?.status;
  if (next !== "acknowledged" && next !== "resolved") {
    return NextResponse.json(
      { error: "status must be 'acknowledged' or 'resolved'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from("sos_alerts")
    .select("id, acknowledged_by, acknowledged_at")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return NextResponse.json(
      { error: loadErr?.message ?? "SOS alert not found" },
      { status: loadErr ? 400 : 404 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: next };

  if (next === "acknowledged") {
    if (existing.acknowledged_at == null) {
      update.acknowledged_by = adminUser.id;
      update.acknowledged_at = now;
    }
  } else {
    update.resolved_at = now;
    if (existing.acknowledged_at == null) {
      update.acknowledged_by = adminUser.id;
      update.acknowledged_at = now;
    }
  }

  const { data, error } = await admin
    .from("sos_alerts")
    .update(update)
    .eq("id", id)
    .select(
      "id, user_id, booking_id, status, acknowledged_at, resolved_at",
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Couldn't update SOS" },
      { status: 400 },
    );
  }

  await logAdminAction({
    admin: adminUser,
    action: `sos.${next}`,
    targetType: "sos_alert",
    targetId: id,
    details: { booking_id: data.booking_id, user_id: data.user_id },
  });

  return NextResponse.json({ alert: data });
}
