import { NextResponse } from "next/server";
import { acceptFamilyInvite } from "@/lib/family/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/family/invites/:id/accept → accept invite as current user.
 *
 * Note: the {id} param is the invite token (UUID-like). It's named `id` to
 * avoid Next.js routing conflicts with the sibling `[id]/route.ts` (Next.js
 * forbids different slug names at the same path segment).
 */
export async function POST(_req: Request, ctx: RouteParams) {
  const { id: token } = await ctx.params;
  const result = await acceptFamilyInvite(token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, needsAuth: result.needsAuth ?? false },
      { status: result.needsAuth ? 401 : 400 },
    );
  }
  return NextResponse.json({ familyId: result.familyId });
}
