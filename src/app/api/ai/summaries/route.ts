import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestSummary } from "@/lib/ai/summaries";
import type { CareSummaryScope } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ai/summaries?booking_id=…
 *   OR ?recipient_id=…&scope=weekly|monthly
 *
 * Auth: caller must be the booking's seeker (shape A), or
 * own / share the recipient (shape B), or be admin.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("booking_id");
  const recipientId = url.searchParams.get("recipient_id");
  const scope = url.searchParams.get("scope") as CareSummaryScope | null;

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

  if (bookingId) {
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
    const summary = await getLatestSummary({ bookingId });
    return NextResponse.json({ summary });
  }

  if (recipientId) {
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
    const summary = await getLatestSummary({
      recipientId,
      scope: scope ?? undefined,
    });
    return NextResponse.json({ summary });
  }

  return NextResponse.json({ error: "missing_query" }, { status: 400 });
}
