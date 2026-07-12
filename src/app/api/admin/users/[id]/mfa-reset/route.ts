import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { clearRecoveryCodes } from "@/lib/security/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[id]/mfa-reset
 * Body: { reason: string }
 *
 * Support-driven MFA recovery: removes all TOTP factors for a user and wipes
 * their recovery codes. Caller must be a platform admin at AAL2.
 *
 * Lost-device recovery is intentionally not self-service — identity must be
 * verified out-of-band before staff invoke this endpoint.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetUserId } = await params;

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const actor = guard.admin;

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim();
  if (!reason || reason.length < 8) {
    return NextResponse.json(
      { error: "A reason of at least 8 characters is required." },
      { status: 400 },
    );
  }

  if (targetUserId === actor.id) {
    return NextResponse.json(
      { error: "Use the security settings page to manage your own MFA." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: factors, error: listErr } =
    await admin.auth.admin.mfa.listFactors({ userId: targetUserId });
  if (listErr) {
    return NextResponse.json(
      { error: "Could not list MFA factors for this user." },
      { status: 500 },
    );
  }

  const totpFactors = factors?.factors ?? [];
  for (const factor of totpFactors) {
    if (factor.factor_type !== "totp") continue;
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: targetUserId,
    });
    if (delErr) {
      return NextResponse.json(
        { error: "Failed to remove an MFA factor." },
        { status: 500 },
      );
    }
  }

  await clearRecoveryCodes(targetUserId);

  await logAdminAction({
    admin: actor,
    action: "mfa.reset",
    targetType: "user",
    targetId: targetUserId,
    details: { reason },
  });

  return NextResponse.json({ ok: true, factorsRemoved: totpFactors.length });
}
