import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleUnregister,
  type PushTokenClient,
} from "@/lib/push/register-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/push/unregister
 * Body: { token: string }
 * Sets revoked_at = now() for the caller's matching token row.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return handleUnregister({
    user_id: user.id,
    client: supabase as unknown as PushTokenClient,
    body,
  });
}
