import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePredictionsForSeeker } from "@/lib/ai/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ai-schedule-predict
 *
 * Daily — for each seeker who completed at least one booking in the
 * last 90 days, recompute schedule predictions.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: seekers } = await admin
    .from("bookings")
    .select("seeker_id")
    .eq("status", "completed")
    .gte("starts_at", since.toISOString())
    .limit(5000);

  const ids = Array.from(
    new Set(
      ((seekers ?? []) as { seeker_id: string }[])
        .map((r) => r.seeker_id)
        .filter((s) => typeof s === "string"),
    ),
  );

  let totalUpserts = 0;
  let totalExpired = 0;
  for (const id of ids) {
    try {
      const r = await computePredictionsForSeeker(id);
      totalUpserts += r.upserts;
      totalExpired += r.expired;
    } catch (e) {
      console.error("compute predictions failed for", id, e);
    }
  }
  return NextResponse.json({
    ok: true,
    seekers: ids.length,
    upserts: totalUpserts,
    expired: totalExpired,
  });
}
