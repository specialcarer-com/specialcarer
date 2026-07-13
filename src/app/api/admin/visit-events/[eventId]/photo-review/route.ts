/**
 * POST /api/admin/visit-events/[eventId]/photo-review
 *
 * Manual ops review of a clock-in photo (Sprint 4.5 v2). Until the automated
 * match engine ships, admins set the advisory verification status by eye.
 * Writes photo_verification_status + photo_verification_checked_at +
 * verified_by_admin_id via the service-role client (carers cannot touch these
 * fields — no authenticated UPDATE policy exists on visit_events).
 *
 * Body: { status: "passed" | "failed" }
 *
 * Responses:
 *  - 200 { event }                    — updated row
 *  - 400 { error }                    — invalid status
 *  - 401 { ok:false, error }          — unauthenticated
 *  - 403 { error:"Forbidden" }        — not an admin
 *  - 404 { error:"event not found" }  — no such visit event
 *  - 428 { error }                    — admin MFA setup/challenge required
 *  - 500 { error:"review_failed" }    — unexpected server/DB error
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const REVIEWABLE = new Set(["passed", "failed"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = body.status;
  if (!status || !REVIEWABLE.has(status)) {
    return NextResponse.json(
      { error: "status must be passed or failed" },
      { status: 400 },
    );
  }

  const db = createAdminClient();
  const { data: event, error } = await db
    .from("visit_events")
    .update({
      photo_verification_status: status,
      photo_verification_checked_at: new Date().toISOString(),
      verified_by_admin_id: admin.id,
    })
    .eq("id", eventId)
    .select("id, visit_id, photo_verification_status, verified_by_admin_id")
    .maybeSingle<{
      id: string;
      visit_id: string;
      photo_verification_status: string;
      verified_by_admin_id: string | null;
    }>();
  if (error) {
    console.error("[photo-review] update failed", error.message);
    return NextResponse.json({ error: "review_failed" }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: "event not found" }, { status: 404 });
  }

  await logAdminAction({
    admin,
    action: "visit_photo_review",
    targetType: "visit_event",
    targetId: eventId,
    details: { status, booking_id: event.visit_id },
  });

  return NextResponse.json({ event });
}
