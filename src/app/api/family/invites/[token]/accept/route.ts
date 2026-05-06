import { NextResponse } from "next/server";
import { acceptFamilyInvite } from "@/lib/family/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ token: string }> };

/** POST /api/family/invites/:token/accept → accept invite as current user. */
export async function POST(_req: Request, ctx: RouteParams) {
  const { token } = await ctx.params;
  const result = await acceptFamilyInvite(token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, needsAuth: result.needsAuth ?? false },
      { status: result.needsAuth ? 401 : 400 },
    );
  }
  return NextResponse.json({ familyId: result.familyId });
}
