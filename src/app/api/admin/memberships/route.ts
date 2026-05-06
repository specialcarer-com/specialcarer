import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import {
  grantCompMembership,
  listMembershipsAdmin,
} from "@/lib/memberships/server";
import type {
  MembershipPlan,
  MembershipStatus,
} from "@/lib/memberships/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PLANS: MembershipPlan[] = ["lite", "plus", "premium"];

/**
 * GET /api/admin/memberships?status=all|active|comp|...&limit=100
 * Admin-only. Returns a list of subscription rows hydrated with user
 * email + display name.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "all") as
    | MembershipStatus
    | "all";
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(500, Math.trunc(limitRaw)))
    : 100;
  const rows = await listMembershipsAdmin({ limit, status });
  return NextResponse.json({ rows });
}

/**
 * POST /api/admin/memberships
 * Body: { user_id: string, plan: 'lite'|'plus'|'premium', reason?: string,
 *         expires_at?: ISO string | null }
 * Grants a complimentary membership. Admin-only.
 */
export async function POST(req: Request) {
  const adminUser = await requireAdmin();
  let body: {
    user_id?: string;
    plan?: string;
    reason?: string;
    expires_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user_id || typeof body.user_id !== "string") {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 }
    );
  }
  if (!body.plan || !VALID_PLANS.includes(body.plan as MembershipPlan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  const result = await grantCompMembership({
    userId: body.user_id,
    plan: body.plan as MembershipPlan,
    grantedBy: adminUser.id,
    reason: body.reason,
    expiresAt: body.expires_at ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await logAdminAction({
    admin: adminUser,
    action: "membership.grant",
    targetType: "user",
    targetId: body.user_id,
    details: {
      plan: body.plan,
      reason: body.reason ?? null,
      expires_at: body.expires_at ?? null,
      subscription_id: result.subscriptionId,
    },
  });

  return NextResponse.json({
    ok: true,
    subscription_id: result.subscriptionId,
  });
}
