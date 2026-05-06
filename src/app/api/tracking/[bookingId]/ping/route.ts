import { NextResponse } from "next/server";
import { recordCarerPing } from "@/lib/tracking/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ bookingId: string }> };

/** POST /api/tracking/:bookingId/ping  body: { lat, lng, accuracyM?, heading?, speedMps? } */
export async function POST(req: Request, ctx: RouteParams) {
  const { bookingId } = await ctx.params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const lat = typeof p.lat === "number" ? p.lat : NaN;
  const lng = typeof p.lng === "number" ? p.lng : NaN;
  const accuracyM = typeof p.accuracyM === "number" ? p.accuracyM : null;
  const heading = typeof p.heading === "number" ? p.heading : null;
  const speedMps = typeof p.speedMps === "number" ? p.speedMps : null;

  const result = await recordCarerPing({
    bookingId,
    lat,
    lng,
    accuracyM,
    heading,
    speedMps,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
