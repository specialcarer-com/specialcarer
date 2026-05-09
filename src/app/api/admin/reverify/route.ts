import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ReverifyRow = {
  background_check_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  check_type: string | null;
  vendor: string | null;
  check_status: string | null;
  issued_at: string | null;
  expires_at: string | null;
  next_reverify_at: string | null;
  reverify_cadence_months: number;
  reverify_status: string;
  due_in_days: number | null;
};

/**
 * GET /api/admin/reverify
 * Returns the re-verification queue from the helper view.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const admin = createAdminClient();
  const url = new URL(req.url);
  const filter = url.searchParams.get("status"); // due | overdue | all

  let q = admin
    .from("reverify_queue_v")
    .select(
      "background_check_id, user_id, full_name, email, check_type, vendor, check_status, issued_at, expires_at, next_reverify_at, reverify_cadence_months, reverify_status, due_in_days",
    )
    .order("due_in_days", { ascending: true, nullsFirst: false })
    .limit(500);

  if (filter && filter !== "all") {
    q = q.eq("reverify_status", filter);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: (data ?? []) as ReverifyRow[] });
}

/**
 * POST /api/admin/reverify
 * Body: { background_check_id, action: 'request' | 'mark_cleared' | 'snooze',
 *         days?: number  // for snooze, default 14 }
 *
 * - 'request' flips reverify_status to 'in_progress' and records audit.
 * - 'mark_cleared' moves to 'cleared' and pushes next_reverify_at by
 *   reverify_cadence_months.
 * - 'snooze' bumps next_reverify_at by `days` (default 14).
 */
export async function POST(req: Request) {
  const me = await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const id = typeof p.background_check_id === "string" ? p.background_check_id : "";
  const action = typeof p.action === "string" ? p.action : "";
  const days = typeof p.days === "number" ? Math.max(1, Math.min(365, p.days)) : 14;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  if (!["request", "mark_cleared", "snooze"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bc } = await admin
    .from("background_checks")
    .select("id, reverify_cadence_months, next_reverify_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      reverify_cadence_months: number;
      next_reverify_at: string | null;
    }>();
  if (!bc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (action === "request") {
    update.reverify_status = "in_progress";
  } else if (action === "mark_cleared") {
    update.reverify_status = "cleared";
    const cadence = bc.reverify_cadence_months ?? 12;
    const next = new Date();
    next.setMonth(next.getMonth() + cadence);
    update.next_reverify_at = next.toISOString().slice(0, 10);
  } else if (action === "snooze") {
    const base = bc.next_reverify_at
      ? new Date(bc.next_reverify_at)
      : new Date();
    base.setDate(base.getDate() + days);
    update.next_reverify_at = base.toISOString().slice(0, 10);
    // Re-evaluate status against the new date
    update.reverify_status =
      base.getTime() < Date.now() ? "overdue" : "due";
  }

  const { error: upErr } = await admin
    .from("background_checks")
    .update(update)
    .eq("id", id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await logAdminAction({
    admin: me,
    action: "reverify.action",
    targetType: "background_check",
    targetId: id,
    details: { action, days },
  });

  return NextResponse.json({ ok: true, update });
}
