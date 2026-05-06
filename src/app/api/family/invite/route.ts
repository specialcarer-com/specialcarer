import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inviteFamilyMember } from "@/lib/family/server";

export const dynamic = "force-dynamic";

/** POST /api/family/invite { email, displayName? } */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const p = (payload ?? {}) as Record<string, unknown>;
  const email = typeof p.email === "string" ? p.email : "";
  const displayName =
    typeof p.displayName === "string" ? p.displayName : null;

  const result = await inviteFamilyMember({ email, displayName });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    inviteId: result.inviteId,
    emailSent: result.emailSent,
  });
}
