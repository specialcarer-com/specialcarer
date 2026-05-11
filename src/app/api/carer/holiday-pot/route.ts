import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { taxYearForDate } from "@/lib/payroll/tax-constants";

export const dynamic = "force-dynamic";

/** GET /api/carer/holiday-pot — current tax year balance for the carer */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const taxYear = taxYearForDate(new Date());
  const { data } = await supabase
    .from("carer_holiday_pots")
    .select("tax_year, accrued_cents, taken_cents, paid_out_cents")
    .eq("carer_id", user.id)
    .eq("tax_year", taxYear)
    .maybeSingle();

  const pot = data ?? {
    tax_year: taxYear,
    accrued_cents: 0,
    taken_cents: 0,
    paid_out_cents: 0,
  };
  const balance_cents =
    (pot.accrued_cents ?? 0) -
    (pot.taken_cents ?? 0) -
    (pot.paid_out_cents ?? 0);
  return NextResponse.json({ pot: { ...pot, balance_cents } });
}
