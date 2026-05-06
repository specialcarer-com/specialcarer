import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeFamilyMember } from "@/lib/family/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** DELETE /api/family/members/:id → primary removes a member. */
export async function DELETE(_req: Request, ctx: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await removeFamilyMember(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
