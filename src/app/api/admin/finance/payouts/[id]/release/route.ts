import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/payouts/[id]/release
 *
 * Stub — flips a payout from `pending` → `processing`. Real money
 * movement (Stripe transfer) is owned by the existing payout
 * subsystem; this endpoint exists so an admin can step a payout
 * forward from the queue.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: cur } = await admin
    .from("payouts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (!cur) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (cur.status !== "pending") {
    return NextResponse.json(
      { ok: true, alreadyMoved: true, status: cur.status },
    );
  }

  const { data, error } = await admin
    .from("payouts")
    .update({ status: "processing" })
    .eq("id", id)
    .select("id, status")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "payout.release_stub",
    targetType: "payout",
    targetId: id,
    details: { from: "pending", to: "processing" },
  });
  return NextResponse.json({ payout: data });
}
