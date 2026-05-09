import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  INSTANT_PAYOUT_MIN_CENTS,
  instantPayoutFeeCents,
} from "@/lib/earnings/fees";

export const dynamic = "force-dynamic";

type Body = {
  amount_cents?: number;
  currency?: string;
};

const FRIENDLY_INSTANT_UNAVAILABLE =
  "Instant payouts not available — your bank doesn't support them yet. Your weekly direct deposit will arrive on Monday.";

/**
 * POST /api/m/earnings/instant-payout
 *
 * Initiates a Stripe instant payout against the carer's connected
 * Express account. Records a payout_intents row up-front so the
 * webhook can flip the final status, and so we have a paper trail
 * even if the Stripe call rejects.
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
  const amount = Number(body.amount_cents);
  const currency = String(body.currency ?? "").toLowerCase();
  if (currency !== "gbp" && currency !== "usd") {
    return NextResponse.json({ error: "invalid_currency" }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount < INSTANT_PAYOUT_MIN_CENTS) {
    return NextResponse.json(
      { error: `Minimum payout is ${INSTANT_PAYOUT_MIN_CENTS} cents` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle<{
      stripe_account_id: string | null;
      payouts_enabled: boolean | null;
    }>();
  if (!account?.stripe_account_id || !account.payouts_enabled) {
    return NextResponse.json(
      { error: "Stripe payouts not enabled on your account yet." },
      { status: 400 },
    );
  }

  // Available balance via the same RPC the dashboard uses — keeps a
  // single source of truth.
  const { data: summaryRows } = await admin.rpc("carer_earnings_summary", {
    p_carer: user.id,
    p_currency: currency,
  });
  const summary =
    Array.isArray(summaryRows) && summaryRows.length > 0
      ? (summaryRows[0] as { available_balance_cents: number })
      : null;
  const available = Number(summary?.available_balance_cents ?? 0);
  if (amount > available) {
    return NextResponse.json(
      {
        error: `You have ${available} cents available. Try a smaller amount.`,
        available_cents: available,
      },
      { status: 400 },
    );
  }

  const fee = instantPayoutFeeCents(amount);
  const net = amount - fee;

  // Insert intent BEFORE the Stripe call so we can correlate via the
  // webhook even if the network drops mid-flight.
  const { data: intent, error: intentErr } = await admin
    .from("payout_intents")
    .insert({
      carer_id: user.id,
      kind: "instant",
      amount_cents: amount,
      fee_cents: fee,
      currency,
      status: "requested",
    })
    .select("id")
    .single();
  if (intentErr || !intent) {
    return NextResponse.json(
      { error: intentErr?.message ?? "intent_failed" },
      { status: 500 },
    );
  }

  try {
    const payout = await stripe.payouts.create(
      {
        amount: net,
        currency,
        method: "instant",
        metadata: {
          payout_intent_id: intent.id,
          carer_id: user.id,
        },
      },
      { stripeAccount: account.stripe_account_id },
    );
    await admin
      .from("payout_intents")
      .update({
        stripe_payout_id: payout.id,
        status: "processing",
      })
      .eq("id", intent.id);
    return NextResponse.json({
      payout_id: intent.id,
      stripe_payout_id: payout.id,
      fee_cents: fee,
      net_cents: net,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe_error";
    const friendly =
      typeof msg === "string" &&
      (msg.toLowerCase().includes("instant") ||
        msg.toLowerCase().includes("not eligible"))
        ? FRIENDLY_INSTANT_UNAVAILABLE
        : msg;
    await admin
      .from("payout_intents")
      .update({
        status: "failed",
        failure_reason: msg.slice(0, 500),
      })
      .eq("id", intent.id);
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
