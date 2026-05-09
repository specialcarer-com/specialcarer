import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Body = { code?: string };

/**
 * POST /api/m/referrals/redeem  { code }
 *
 * Marks the calling carer as referred by the holder of `code`. Idempotent —
 * if the carer has already been referred we return their existing row
 * and do nothing.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code || code.length < 4 || code.length > 16) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("referrals")
    .select("id, referrer_id, qualifying_bookings, payout_status")
    .eq("referee_id", user.id)
    .maybeSingle<{
      id: string;
      referrer_id: string;
      qualifying_bookings: number;
      payout_status: string;
    }>();
  if (existing) {
    return NextResponse.json({
      ok: true,
      already_redeemed: true,
      referral: existing,
    });
  }

  const { data: referrer } = await admin
    .from("caregiver_profiles")
    .select("user_id")
    .eq("referral_code", code)
    .maybeSingle<{ user_id: string }>();
  if (!referrer) {
    return NextResponse.json({ error: "code_not_found" }, { status: 404 });
  }
  if (referrer.user_id === user.id) {
    return NextResponse.json({ error: "cannot_self_refer" }, { status: 400 });
  }

  const { data: row, error } = await admin
    .from("referrals")
    .insert({
      referrer_id: referrer.user_id,
      referee_id: user.id,
      code_used: code,
    })
    .select("id, referrer_id, qualifying_bookings, payout_status")
    .single();
  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await admin
    .from("caregiver_profiles")
    .update({ referred_by: referrer.user_id })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true, referral: row });
}
