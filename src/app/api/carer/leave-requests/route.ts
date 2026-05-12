import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_HOURLY_RATE_CENTS = 1500; // £15/hour fallback

/** Look up an effective hourly rate for the carer at request time. */
async function getEffectiveHourlyRateCents(
  admin: ReturnType<typeof createAdminClient>,
  carerId: string,
): Promise<number> {
  // 1. Latest org_carer_payouts row — tolerated if the column doesn't exist.
  try {
    const { data: payout } = await admin
      .from("org_carer_payouts")
      .select("hourly_rate_cents")
      .eq("carer_id", carerId)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle<{ hourly_rate_cents: number | null }>();
    if (payout?.hourly_rate_cents && payout.hourly_rate_cents > 0) {
      return payout.hourly_rate_cents;
    }
  } catch {
    /* column not present in this environment — fall through */
  }

  // 2. caregiver_profiles.hourly_rate_cents (the spec calls this
  //    "profiles.hourly_rate_cents" but in this repo the rate lives on
  //    caregiver_profiles).
  try {
    const { data: cp } = await admin
      .from("caregiver_profiles")
      .select("hourly_rate_cents")
      .eq("user_id", carerId)
      .maybeSingle<{ hourly_rate_cents: number | null }>();
    if (cp?.hourly_rate_cents && cp.hourly_rate_cents > 0) {
      return cp.hourly_rate_cents;
    }
  } catch {
    /* ignore */
  }

  return DEFAULT_HOURLY_RATE_CENTS;
}

async function getBalanceCents(
  admin: ReturnType<typeof createAdminClient>,
  carerId: string,
): Promise<number> {
  const { data } = await admin
    .from("v_holiday_pot_balances")
    .select("balance_cents")
    .eq("carer_id", carerId)
    .maybeSingle<{ balance_cents: number | null }>();
  return data?.balance_cents ?? 0;
}

/** GET /api/carer/leave-requests — list the carer's own requests. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("holiday_leave_requests")
    .select(
      "id, requested_hours, requested_amount_cents, status, reason, start_date, end_date, admin_notes, decided_at, paid_at, created_at",
    )
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ requests: rows ?? [] });
}

/** POST /api/carer/leave-requests — create a new pending leave request. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    requested_hours?: number;
    reason?: string;
    start_date?: string;
    end_date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hours = Number(body.requested_hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json(
      { error: "requested_hours must be a positive number" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const hourly = await getEffectiveHourlyRateCents(admin, user.id);
  const amountCents = Math.round(hours * hourly);

  const balance = await getBalanceCents(admin, user.id);
  if (amountCents > balance) {
    return NextResponse.json(
      {
        error:
          "Requested amount exceeds available holiday balance. Adjust the hours and try again.",
        balance_cents: balance,
        requested_amount_cents: amountCents,
      },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await admin
    .from("holiday_leave_requests")
    .insert({
      carer_id: user.id,
      requested_hours: hours,
      requested_amount_cents: amountCents,
      reason: body.reason ?? null,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      status: "pending",
    })
    .select(
      "id, requested_hours, requested_amount_cents, status, reason, start_date, end_date, created_at",
    )
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ request: inserted }, { status: 201 });
}
