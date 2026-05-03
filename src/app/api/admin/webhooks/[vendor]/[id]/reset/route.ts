import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const TABLE_BY_VENDOR: Record<string, string> = {
  stripe: "stripe_webhook_events",
  uchecks: "uchecks_webhook_events",
  checkr: "checkr_webhook_events",
};

/**
 * POST /api/admin/webhooks/[vendor]/[id]/reset
 *
 * Admin-only. Clears processed_at + error on a webhook event row so that
 * the vendor's next redelivery (triggered from the vendor's dashboard)
 * runs through our handler again. We do not auto-resend — the vendor
 * dashboard is the source of truth for redelivery.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ vendor: string; id: string }> },
) {
  const { vendor, id: eventId } = await params;
  const table = TABLE_BY_VENDOR[vendor];
  if (!table) {
    return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
  }

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

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required to reset a webhook event." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from(table)
    .select("id, type, processed_at, error")
    .eq("id", eventId)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { error: updErr } = await admin
    .from(table)
    .update({ processed_at: null, error: null })
    .eq("id", eventId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await logAdminAction({
    admin: adminUser,
    action: "webhook.reset",
    targetType: `${vendor}_webhook`,
    targetId: eventId,
    details: {
      vendor,
      event_type: row.type,
      prior_processed_at: row.processed_at,
      prior_error: row.error,
      reason,
    },
  });

  return NextResponse.json({ ok: true });
}
