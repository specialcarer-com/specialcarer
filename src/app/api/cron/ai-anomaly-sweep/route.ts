import { NextResponse } from "next/server";
import { sweepRecent } from "@/lib/ai/anomalies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ai-anomaly-sweep
 *
 * Hourly stub. The real schedule lives in vercel.json (NOT modified
 * in this run — see build log).
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await sweepRecent();
  return NextResponse.json({ ok: true, ...result });
}
