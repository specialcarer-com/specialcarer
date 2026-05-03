import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reviews/[id]/hide
 * Body: { action: "hide" | "unhide", reason: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: reviewId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminUser: AdminUser = { id: user.id, email: user.email ?? null };

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = body.action;
  const reason = (body.reason ?? "").trim();
  if (action !== "hide" && action !== "unhide") {
    return NextResponse.json(
      { error: 'action must be "hide" or "unhide"' },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, rating, body, hidden_at, caregiver_id, reviewer_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review)
    return NextResponse.json({ error: "Review not found" }, { status: 404 });

  const update =
    action === "hide"
      ? {
          hidden_at: new Date().toISOString(),
          hidden_by: user.id,
          hidden_reason: reason,
        }
      : { hidden_at: null, hidden_by: null, hidden_reason: null };

  const { error: updErr } = await admin
    .from("reviews")
    .update(update)
    .eq("id", reviewId);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logAdminAction({
    admin: adminUser,
    action: action === "hide" ? "review.hide" : "review.unhide",
    targetType: "review",
    targetId: reviewId,
    details: {
      caregiver_id: review.caregiver_id,
      reviewer_id: review.reviewer_id,
      rating: review.rating,
      prior_hidden_at: review.hidden_at,
      reason,
    },
  });

  return NextResponse.json({ ok: true, hidden: action === "hide" });
}
