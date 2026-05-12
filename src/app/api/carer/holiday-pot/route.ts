import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { taxYearForDate } from "@/lib/payroll/tax-constants";

export const dynamic = "force-dynamic";

type LedgerEntryRow = {
  id: string;
  entry_type: "accrued" | "debited_paid_leave" | "adjusted" | "expired";
  amount_cents: number;
  created_at: string;
  notes: string | null;
};

type BalanceRow = {
  accrued_cents: number | null;
  debited_cents: number | null;
  adjusted_cents: number | null;
  expired_cents: number | null;
  balance_cents: number | null;
  last_entry_at: string | null;
};

/**
 * GET /api/carer/holiday-pot
 *
 * Phase 4 stage 1: returns the carer's holiday-pot summary from the new
 * ledger (v_holiday_pot_balances) plus the last 20 entries and any pending
 * leave-request amount. The legacy `pot` field is retained for backward
 * compatibility with the existing /dashboard/payslips sidebar widget.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: balance } = await admin
    .from("v_holiday_pot_balances")
    .select(
      "accrued_cents, debited_cents, adjusted_cents, expired_cents, balance_cents, last_entry_at",
    )
    .eq("carer_id", user.id)
    .maybeSingle<BalanceRow>();

  const accrued_cents = balance?.accrued_cents ?? 0;
  // ledger stores debits as negative; the API surfaces the absolute total
  const debited_cents = Math.abs(balance?.debited_cents ?? 0);
  const adjusted_cents = balance?.adjusted_cents ?? 0;
  const expired_cents = Math.abs(balance?.expired_cents ?? 0);
  const balance_cents = balance?.balance_cents ?? 0;
  const last_entry_at = balance?.last_entry_at ?? null;

  const { data: entries } = await admin
    .from("holiday_pot_ledger")
    .select("id, entry_type, amount_cents, created_at, notes")
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: pending } = await admin
    .from("holiday_leave_requests")
    .select("requested_amount_cents")
    .eq("carer_id", user.id)
    .eq("status", "pending");

  const pending_request_cents = (pending ?? []).reduce(
    (sum, r) =>
      sum + ((r as { requested_amount_cents: number | null }).requested_amount_cents ?? 0),
    0,
  );

  // Legacy summary for the existing payslips sidebar — derived from the
  // same numbers so the two views never disagree.
  const taxYear = taxYearForDate(new Date());
  const legacyPot = {
    tax_year: taxYear,
    accrued_cents,
    taken_cents: debited_cents,
    paid_out_cents: expired_cents,
    balance_cents,
  };

  return NextResponse.json({
    balance_cents,
    accrued_cents,
    debited_cents,
    adjusted_cents,
    expired_cents,
    last_entry_at,
    recent_entries: (entries ?? []) as LedgerEntryRow[],
    pending_request_cents,
    pot: legacyPot,
  });
}
