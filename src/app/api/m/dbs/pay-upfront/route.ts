/**
 * POST /api/m/dbs/pay-upfront
 *
 * The calling carer opts to pay the £60 DBS cost upfront, skipping earnings
 * recovery. Creates a £60 Stripe PaymentIntent and marks the carer's
 * applications 'paid_upfront'. Returns the PaymentIntent client secret for
 * the carer UI to confirm. Gated by NEXT_PUBLIC_DBS_ENABLED.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDbsEnabled } from "@/lib/dbs/flag";
import { chooseUpfrontPayment } from "@/lib/dbs/service";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDbsEnabled()) {
    return NextResponse.json({ error: "DBS feature is disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const result = await chooseUpfrontPayment(user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start payment" },
      { status: 400 },
    );
  }
}
