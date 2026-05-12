import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordClaim } from "@/lib/referrals/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/referrals/claim — authenticated user claims a referral code.
 * Body: { code }. Validates self-referral, double-claim, expired codes.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = (body.code ?? "").toString().trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await recordClaim(admin, { code, referredUserId: user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }
  return NextResponse.json({
    status: result.status,
    amount_cents: result.amount_cents,
  });
}
