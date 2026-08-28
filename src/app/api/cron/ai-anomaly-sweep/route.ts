import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { sweepRecent } from "@/lib/ai/anomalies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ai-anomaly-sweep
 *
 * Hourly stub. The real schedule lives in vercel.json (NOT modified
 * in this run — see build log).
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;
  const result = await sweepRecent();
  return NextResponse.json({ ok: true, ...result });
}
