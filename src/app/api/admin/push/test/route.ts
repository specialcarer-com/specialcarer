import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { sendPush, type ApnsPayload } from "@/lib/push/apns";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/push/test
 * Body: {
 *   deviceToken: string,           // 64-char hex token from the iOS device
 *   title?: string,
 *   body?: string,
 *   data?: Record<string, unknown> // optional custom payload keys
 * }
 *
 * Admin-only. Sends a single test push so we can verify our APNs setup
 * end-to-end during TestFlight builds. NOT used in production app flows —
 * for those, see lib/push/notify.ts (booking confirmed, message received).
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: {
    deviceToken?: string;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deviceToken = (body.deviceToken ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(deviceToken)) {
    return NextResponse.json(
      { error: "deviceToken must be 64 hex chars" },
      { status: 400 },
    );
  }

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: body.title?.trim() || "Special Carer",
        body: body.body?.trim() || "Test push from the backend.",
      },
      sound: "default",
    },
    ...(body.data ?? {}),
  };

  try {
    const result = await sendPush({ deviceToken, payload });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          reason: result.reason,
          adminId: admin.id,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      apnsId: result.apnsId,
      adminId: admin.id,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
