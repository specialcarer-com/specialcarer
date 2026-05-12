import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type LeaveRow = {
  id: string;
  carer_id: string;
  requested_hours: number;
  requested_amount_cents: number;
  status: string;
  reason: string | null;
  start_date: string | null;
  end_date: string | null;
  admin_notes: string | null;
  decided_at: string | null;
  paid_at: string | null;
  created_at: string;
};

/** GET /api/admin/leave-requests?status=pending — list leave requests. */
export async function GET(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  const admin = createAdminClient();

  let q = admin
    .from("leave_requests")
    .select(
      "id, carer_id, requested_hours, requested_amount_cents, status, reason, start_date, end_date, admin_notes, decided_at, paid_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status !== "all") {
    q = q.eq("status", status);
  }

  const { data: rows } = await q;
  const requests = (rows ?? []) as LeaveRow[];

  // Enrich with carer name + current balance.
  const carerIds = Array.from(new Set(requests.map((r) => r.carer_id)));
  const [{ data: profiles }, { data: balances }] = await Promise.all([
    carerIds.length
      ? admin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", carerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    carerIds.length
      ? admin
          .from("v_holiday_pot_balances")
          .select("carer_id, balance_cents")
          .in("carer_id", carerIds)
      : Promise.resolve({ data: [] as { carer_id: string; balance_cents: number | null }[] }),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [
      (p as { id: string }).id,
      {
        full_name: (p as { full_name: string | null }).full_name,
        email: (p as { email: string | null }).email,
      },
    ]),
  );
  const balanceById = new Map(
    (balances ?? []).map((b) => [
      (b as { carer_id: string }).carer_id,
      (b as { balance_cents: number | null }).balance_cents ?? 0,
    ]),
  );

  const enriched = requests.map((r) => ({
    ...r,
    carer_name: nameById.get(r.carer_id)?.full_name ?? null,
    carer_email: nameById.get(r.carer_id)?.email ?? null,
    carer_balance_cents: balanceById.get(r.carer_id) ?? 0,
  }));

  return NextResponse.json({ requests: enriched });
}
