import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["seeker", "caregiver", "admin"] as const;

/**
 * POST /api/admin/users/[id]/role
 * Body: { role: "seeker" | "caregiver" | "admin", reason: string }
 *
 * Admin-only. Changes a user's role. Self-demotion is rejected to prevent
 * an admin from accidentally locking themselves out.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetId } = await params;

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const adminUser = guard.admin;

  const body = (await req.json().catch(() => ({}))) as {
    role?: string;
    reason?: string;
  };
  const role = body.role;
  const reason = (body.reason ?? "").trim();

  if (!role || !ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json(
      { error: `role must be one of ${ALLOWED_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required for role changes." },
      { status: 400 },
    );
  }

  if (targetId === adminUser.id && role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", targetId)
    .maybeSingle();
  if (!existing)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const priorRole = existing.role;
  if (priorRole === role) {
    return NextResponse.json({ ok: true, status: "noop", role });
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", targetId);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logAdminAction({
    admin: adminUser,
    action: "user.change_role",
    targetType: "profile",
    targetId,
    details: {
      prior_role: priorRole,
      new_role: role,
      target_name: existing.full_name,
      reason,
    },
  });

  return NextResponse.json({ ok: true, role });
}
