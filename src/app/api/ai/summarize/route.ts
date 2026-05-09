import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  summarizeBooking,
  summarizePeriod,
} from "@/lib/ai/summaries";
import type { CareSummaryScope } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ai/summarize
 * Body shape A: { booking_id }
 * Body shape B: { recipient_id, scope: 'weekly'|'monthly', period_start, period_end }
 *
 * Auth: caller must be the booking's seeker (shape A) or own/share the
 * recipient (shape B), OR be an admin.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const admin = createAdminClient();

  // Admin shortcut.
  let isAdmin = false;
  {
    const { data: prof } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string }>();
    isAdmin = prof?.role === "admin";
  }

  // Shape A — booking
  if (typeof p.booking_id === "string" && p.booking_id) {
    const bookingId = p.booking_id;
    if (!isAdmin) {
      const { data: bk } = await admin
        .from("bookings")
        .select("seeker_id")
        .eq("id", bookingId)
        .maybeSingle<{ seeker_id: string }>();
      if (!bk) {
        return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
      }
      if (bk.seeker_id !== user.id) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
    const summary = await summarizeBooking(bookingId);
    return NextResponse.json({ summary });
  }

  // Shape B — period
  if (
    typeof p.recipient_id === "string" &&
    typeof p.scope === "string" &&
    typeof p.period_start === "string" &&
    typeof p.period_end === "string"
  ) {
    const recipientId = p.recipient_id;
    const scope = p.scope as CareSummaryScope;
    if (scope !== "weekly" && scope !== "monthly") {
      return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
    }
    if (!isAdmin) {
      const { data: rec } = await admin
        .from("household_recipients")
        .select("owner_id, family_id")
        .eq("id", recipientId)
        .maybeSingle<{ owner_id: string; family_id: string | null }>();
      if (!rec) {
        return NextResponse.json({ error: "recipient_not_found" }, { status: 404 });
      }
      let allowed = rec.owner_id === user.id;
      if (!allowed && rec.family_id) {
        const { count } = await admin
          .from("family_members")
          .select("id", { count: "exact", head: true })
          .eq("family_id", rec.family_id)
          .eq("user_id", user.id)
          .eq("status", "active");
        allowed = (count ?? 0) > 0;
      }
      if (!allowed) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
    const summary = await summarizePeriod({
      recipientId,
      scope,
      periodStart: p.period_start,
      periodEnd: p.period_end,
    });
    return NextResponse.json({ summary });
  }

  return NextResponse.json({ error: "invalid_body" }, { status: 400 });
}
