import { NextResponse } from "next/server";
import { getMyMembership } from "@/lib/memberships/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/memberships/me
 * Returns the calling user's active membership, or { membership: null } if
 * none. Always returns 200 (never leaks whether user exists).
 */
export async function GET() {
  const membership = await getMyMembership();
  return NextResponse.json({ membership });
}
