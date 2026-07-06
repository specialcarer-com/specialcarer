import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[id]/block
 * Body: { action: "block" | "unblock", reason: string }
 *
 * Admin-only (AAL2). Block uses Supabase ban_duration; unblock sets "none".
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetId } = await params;
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const actor = guard.admin;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = body.action;
  const reason = (body.reason ?? "").trim();

  if (action !== "block" && action !== "unblock") {
    return NextResponse.json(
      { error: "action must be 'block' or 'unblock'" },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required." },
      { status: 400 },
    );
  }
  if (action === "block" && targetId === actor.id) {
    return NextResponse.json(
      { error: "You cannot block your own account." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const { data: existing } = await adminClient.auth.admin.getUserById(targetId);
  if (!existing?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const banDuration = action === "block" ? "876000h" : "none";
  const { error } = await adminClient.auth.admin.updateUserById(targetId, {
    ban_duration: banDuration,
  } as unknown as { ban_duration: string });
  if (error) {
    return NextResponse.json(
      { error: `${action} failed: ${error.message}` },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin: actor,
    action: action === "block" ? "user.block" : "user.unblock",
    targetType: "user",
    targetId,
    details: {
      target_email: existing.user.email ?? null,
      ban_duration: banDuration,
      reason,
    },
  });

  return NextResponse.json({ ok: true, action });
}
