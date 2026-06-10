import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, handleExpire, type ExpireClient } from "./expire-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-match-offers
 *
 * Vercel cron sweep (gap 17 follow-up). Flips booking_match_offers rows whose
 * window has passed (status pending/accepted, expires_at < now) to 'expired'
 * via the SECURITY DEFINER RPC expire_stale_match_offers().
 *
 * Idempotent — safe to run every couple of minutes.
 */
export async function GET(req: Request) {
  if (!authorize(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const client: ExpireClient = {
    async expireStale() {
      const { data, error } = await admin.rpc("expire_stale_match_offers");
      if (error) {
        return { expiredCount: 0, error: error.message };
      }
      // RPC returns table(expired_count int) → one row.
      const row = Array.isArray(data) ? data[0] : data;
      const expiredCount = Number(row?.expired_count ?? 0);
      return { expiredCount, error: null };
    },
  };

  const res = await handleExpire(client);
  if (res.body.ok) {
    console.log(
      `[cron.expire-match-offers] expired ${res.body.expired_count} stale offer(s)`,
    );
  } else {
    console.error("[cron.expire-match-offers] failed:", res.body.error);
  }
  return NextResponse.json(res.body, { status: res.status });
}
