import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/leave-requests/[id]/decide
 * Body: { decision: 'approve' | 'reject', admin_notes?: string }
 *
 * Persists the admin decision. Approval does NOT yet write a ledger debit —
 * that disbursement happens at the next payroll run when the engine picks up
 * approved + unpaid leave_requests, writes one 'debited_paid_leave' ledger
 * entry per request and adds a matching payslip line.
 * TODO(phase-4 stage 2): wire this disbursement into run-engine.executeRun —
 * see phase4-spec.md "Item B: Payroll integration".
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: { decision?: string; admin_notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.decision !== "approve" && body.decision !== "reject") {
    return NextResponse.json(
      { error: "decision must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Verify the request exists and is pending.
  const { data: existing } = await admin
    .from("leave_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (!existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: `Request is already ${existing.status}` },
      { status: 409 },
    );
  }

  const newStatus = body.decision === "approve" ? "approved" : "rejected";

  const { data: updated, error } = await admin
    .from("leave_requests")
    .update({
      status: newStatus,
      admin_id: guard.admin.id,
      admin_notes: body.admin_notes ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id, carer_id, requested_hours, requested_amount_cents, status, admin_notes, decided_at",
    )
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 500 },
    );
  }

  await logAdminAction({
    admin: guard.admin,
    action: `leave_request.${newStatus}`,
    targetType: "leave_request",
    targetId: id,
    details: {
      requested_hours: updated.requested_hours,
      requested_amount_cents: updated.requested_amount_cents,
    },
  });

  return NextResponse.json({ request: updated });
}
