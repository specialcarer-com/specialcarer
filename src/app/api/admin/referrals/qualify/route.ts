import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { qualifyClaim } from "@/lib/referrals/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/referrals/qualify — manually qualify a pending claim
 * (e.g. before the booking-settle webhook is wired, or to correct one
 * that didn't auto-qualify). Idempotent.
 *
 * Body: { claim_id, booking_id? }
 */
export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  let body: { claim_id?: string; booking_id?: string };
  try {
    body = (await req.json()) as { claim_id?: string; booking_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const claimId = (body.claim_id ?? "").trim();
  if (!claimId) {
    return NextResponse.json({ error: "Missing claim_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const r = await qualifyClaim(admin, {
    claimId,
    bookingId: body.booking_id?.trim() || undefined,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.code });
  }

  await logAdminAction({
    admin: guard.admin,
    action: "referral.qualify",
    targetType: "referral_claim",
    targetId: claimId,
    details: { booking_id: body.booking_id ?? null },
  });

  return NextResponse.json({ ok: true, claim_id: r.claim_id });
}
