import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Period = "day" | "week" | "month";

type Row = {
  shift_completed_at: string | null;
  subtotal_cents: number;
};

function bucketKey(iso: string, period: Period): string {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  if (period === "day") return `${yyyy}-${mm}-${dd}`;
  if (period === "month") return `${yyyy}-${mm}`;
  // ISO week — Monday-based.
  const tmp = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * GET /api/m/earnings/history?period=day|week|month&limit=12
 *
 * Returns the 12 most recent buckets of subtotal earnings (carer
 * take-home pre-fee) for the chart on /m/earnings. Computed on demand
 * from bookings — at low volume this is fine; we'll move to a
 * materialised view once it stops being instant.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const periodRaw = (url.searchParams.get("period") ?? "week").toLowerCase();
  const period: Period =
    periodRaw === "day" || periodRaw === "month" ? (periodRaw as Period) : "week";
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? "12")),
    52,
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select("shift_completed_at, subtotal_cents")
    .eq("caregiver_id", user.id)
    .in("status", ["completed", "paid_out"])
    .not("shift_completed_at", "is", null)
    .order("shift_completed_at", { ascending: false })
    .limit(500); // enough rows to populate 12 buckets at typical density
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (!r.shift_completed_at) continue;
    const k = bucketKey(r.shift_completed_at, period);
    buckets.set(k, (buckets.get(k) ?? 0) + (r.subtotal_cents ?? 0));
  }
  const entries = Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .slice(0, limit)
    .reverse();

  return NextResponse.json({
    period,
    buckets: entries.map(([key, cents]) => ({ key, cents })),
  });
}
