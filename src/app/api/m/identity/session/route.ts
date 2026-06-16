import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isIdentityVerificationEnabled } from "@/lib/identity/flag";
import { buildIdentityClient } from "@/lib/identity/adapter";
import { handleStartSession } from "@/lib/identity/identity-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST() {
  const userId = await authUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleStartSession({
    user_id: userId,
    flagEnabled: isIdentityVerificationEnabled(),
    client: buildIdentityClient(),
  });
}
