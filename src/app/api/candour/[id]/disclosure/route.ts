/**
 * POST /api/candour/[id]/disclosure — advance the Reg 20 disclosure
 * clock (Phase C — PR C3b).
 *
 * Admin-only. Calls `recordDisclosure` from `@/lib/candour/case`, which
 * moves the case through open → disclosure_in_progress → disclosure_complete.
 *
 * Request body (JSON):
 *   { notes: string }   // required, min 20 chars
 *
 * Responses:
 *   200 { ok:true, new_state }              — happy
 *   202 { ok:true, skippedReason }          — schema not applied yet
 *   400 { ok:false, error }                 — validation / invalid transition
 *   401 { ok:false, error:'unauthenticated' }
 *   403 { ok:false, error:'forbidden' }
 *
 * Guarded on `role='admin'`. When the RM role lands (see PR #222 header
 * comment), extend the role list at the marked TODO below.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseAdminClient } from "@/lib/candour/case";
import { handleDisclosure, type BodyShape } from "./handler";

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
  return handleDisclosure(id, body, {
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
