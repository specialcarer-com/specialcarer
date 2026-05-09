import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bookings/[id]/refund
 *
 * Stub — flips the booking status to 'refunded' and stamps refunded_at.
 * Real money movement (Stripe refund) lives elsewhere and is owned by
 * the existing payments code path; this endpoint exists so the support
 * UI has something to call.
 *
 * Body: { reason?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const reason =
    typeof p.reason === "string" ? p.reason.trim().slice(0, 500) : null;

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (["refunded", "cancelled"].includes(booking.status)) {
    return NextResponse.json(
      { ok: true, alreadyTerminal: true, status: booking.status },
    );
  }

  const { data, error } = await admin
    .from("bookings")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, status, refunded_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin: me,
    action: "booking.refund_stub",
    targetType: "booking",
    targetId: id,
    details: { reason },
  });

  return NextResponse.json({ booking: data });
}
