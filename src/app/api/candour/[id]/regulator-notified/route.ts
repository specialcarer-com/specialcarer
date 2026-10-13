/**
 * POST /api/candour/[id]/regulator-notified — mark that the RM has
 * submitted the CQC notification for a case (Phase C — PR C3b).
 *
 * Admin-only. Calls `markRegulatorNotified` — moves the case into
 * `notified_regulator` and records the CQC reference number.
 *
 * Request body (JSON):
 *   { regulator_reference: string, notes?: string }
 *
 * Responses:
 *   200 { ok:true }                              — happy
 *   202 { ok:true, skippedReason }               — schema not applied
 *   400 { ok:false, error:'missing_reference' }  — empty reference
 *   400 { ok:false, error }                      — other validation
 *   401 { ok:false, error:'unauthenticated' }
 *   403 { ok:false, error:'forbidden' }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseAdminClient } from "@/lib/candour/case";
import { handleRegulatorNotified, type BodyShape } from "./handler";

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
  return handleRegulatorNotified(id, body, {
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
