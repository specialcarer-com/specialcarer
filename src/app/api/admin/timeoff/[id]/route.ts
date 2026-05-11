import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/timeoff/[id]
 * Approve or decline a time-off request.
 * Body: { status: 'approved' | 'declined', review_note?: string }
 *
 * On approve: also auto-creates a caregiver_blockout for the same date range.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _adminGuard_adminUser = await requireAdminApi();

  if (!_adminGuard_adminUser.ok) return _adminGuard_adminUser.response;

  const adminUser = _adminGuard_adminUser.admin;
  const admin = createAdminClient();

  const { id } = await params;

  let body: { status: "approved" | "declined"; review_note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status, review_note } = body;
  if (!["approved", "declined"].includes(status)) {
    return NextResponse.json(
      { error: "status must be 'approved' or 'declined'" },
      { status: 400 }
    );
  }

  // Fetch existing request
  const { data: existing, error: fetchError } = await admin
    .from("caregiver_timeoff_requests")
    .select("id, user_id, starts_on, ends_on, status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending requests can be reviewed" },
      { status: 400 }
    );
  }

  // Update request status
  const { error: updateError } = await admin
    .from("caregiver_timeoff_requests")
    .update({
      status,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_note: review_note ?? null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // On approve: auto-insert caregiver_blockout for the same range
  if (status === "approved") {
    const { error: blockoutError } = await admin
      .from("caregiver_blockouts")
      .insert({
        user_id: existing.user_id,
        starts_on: existing.starts_on,
        ends_on: existing.ends_on,
        reason: `Time off (approved)${review_note ? `: ${review_note}` : ""}`,
      });

    if (blockoutError) {
      // Non-fatal — log but don't fail the approve action
      console.error("Failed to auto-create blockout for approved timeoff:", blockoutError);
    }
  }

  await logAdminAction({
    admin: adminUser,
    action: `timeoff_${status}`,
    targetType: "caregiver_timeoff_request",
    targetId: id,
    details: { review_note },
  });

  return NextResponse.json({ ok: true });
}
