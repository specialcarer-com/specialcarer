import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { revokeCompMembership } from "@/lib/memberships/server";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/memberships/[id]
 * Revokes a comp membership by subscription id. Admin-only.
 * Stripe-paid subscriptions cannot be revoked here — cancel them in
 * Stripe instead (the webhook will sync the row).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const adminUser = await requireAdmin();
  const { id } = await ctx.params;

  const result = await revokeCompMembership(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await logAdminAction({
    admin: adminUser,
    action: "membership.revoke",
    targetType: "subscription",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
