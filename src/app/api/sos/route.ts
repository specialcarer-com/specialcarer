/**
 * POST /api/sos — raise an SOS alert as the current user.
 *
 * Body (all optional except by context):
 *   {
 *     bookingId?: string,
 *     lat?: number, lng?: number, accuracyM?: number,
 *     note?: string (≤ 1000 chars)
 *   }
 *
 * RLS guarantees user_id = auth.uid(). On success kicks off best-effort
 * email notifications to admins (and the booking counterpart, if any).
 */

import { NextResponse } from "next/server";
import { raiseSos } from "@/lib/sos/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const p = (payload ?? {}) as Record<string, unknown>;

  const result = await raiseSos({
    bookingId: typeof p.bookingId === "string" ? p.bookingId : null,
    lat: typeof p.lat === "number" ? p.lat : null,
    lng: typeof p.lng === "number" ? p.lng : null,
    accuracyM: typeof p.accuracyM === "number" ? p.accuracyM : null,
    note: typeof p.note === "string" ? p.note : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({
    alert: result.alert,
    emergency_contacts_count: result.emergency_contacts_count,
  });
}
