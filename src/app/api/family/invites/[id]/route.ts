import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeFamilyInvite } from "@/lib/family/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** DELETE /api/family/invites/:id → primary revokes a pending invite. */
export async function DELETE(_req: Request, ctx: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await revokeFamilyInvite(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
