import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleRegister,
  type PushTokenClient,
  type RegisterBody,
} from "@/lib/push/register-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/push/register
 * Body: { platform: 'ios'|'android'|'web', token: string, device_id?: string, app_version?: string }
 * Upserts on (user_id, token). Bumps last_seen_at, clears revoked_at.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return handleRegister({
    user_id: user.id,
    client: supabase as unknown as PushTokenClient,
    body,
  });
}
