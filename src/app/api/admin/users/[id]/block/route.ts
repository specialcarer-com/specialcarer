import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

async function gateAdmin(): Promise<
  { ok: true; admin: AdminUser } | { ok: false; res: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, admin: { id: user.id, email: user.email ?? null } };
}

/**
 * POST /api/admin/users/[id]/block
 * Body: { action: "block" | "unblock", reason: string }
 *
 * Block uses Supabase's native ban_duration set to "876000h" (~100 years)
 * which makes the user unable to obtain new sessions and revokes existing
 * ones. Unblock sets ban_duration to "none".
 *
 * Self-block is rejected.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetId } = await params;
  const gate = await gateAdmin();
  if (!gate.ok) return gate.res;
  const { admin: actor } = gate;

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

  // banDuration: "876000h" ≈ 100 years (effectively forever); "none" lifts.
  // Casting via unknown because the Supabase admin SDK types omit ban_duration
  // even though the runtime API accepts it.
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
