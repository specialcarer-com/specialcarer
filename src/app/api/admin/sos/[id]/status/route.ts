/**
 * POST /api/admin/sos/[id]/status
 * Body: { status: "acknowledged" | "resolved" }
 *
 * Admin-only. Updates an SOS alert's status, stamps acknowledged_by /
 * acknowledged_at / resolved_at as appropriate, and writes an audit log
 * row.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- Auth: must be admin ---
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminUser: AdminUser = { id: user.id, email: user.email ?? null };

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

  // --- Apply update ---
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: next };
  if (next === "acknowledged") {
    update.acknowledged_by = user.id;
    update.acknowledged_at = now;
  } else {
    // resolved — also stamp acknowledged_* if not already set
    update.resolved_at = now;
    update.acknowledged_by = user.id;
    update.acknowledged_at = now; // safe to re-stamp; first ack still preserved by audit log
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
