/**
 * POST /api/candour/[id]/close — close a notified case with NI sign-off
 * (Phase C — PR C3b).
 *
 * Admin-only. Calls `closeCase` from `@/lib/candour/case`. The lib
 * enforces state='notified_regulator' and that the signoff-user's
 * profile role is in the configured NI-role list (default ['admin']).
 *
 * Request body (JSON):
 *   { closure_reason: string, ni_signoff_by: uuid }   // closure_reason min 30 chars
 *
 * The handler ALSO pre-validates the ni_signoff_by profile's role
 * before calling the lib, so the 403 vs 400 error mapping is stable
 * (the lib returns `ni_role_required` which we translate to 400).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseAdminClient } from "@/lib/candour/case";
import { handleClose, type BodyShape } from "./handler";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: BodyShape = {};
  try {
    body = (await req.json()) as BodyShape;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  return handleClose(id, body, {
    getActor: async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return { id: user.id, role: (profile?.role as string | null) ?? null };
    },
    db: createAdminClient() as unknown as CaseAdminClient,
  });
}
