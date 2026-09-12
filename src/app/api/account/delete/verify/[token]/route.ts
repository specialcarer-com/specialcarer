/**
 * POST /api/account/delete/verify/[token]
 *
 * Called by the danger-zone page after the user opens the mailed link.
 * Auth is still enforced — the token proves email possession, but the
 * caller must also be signed in as the subject (defence-in-depth).
 *
 * Pure logic lives in src/lib/gdpr/deletion-handlers.ts#handleVerify.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashVerificationToken } from "@/lib/dsar/token";
import { handleVerify } from "@/lib/gdpr/deletion-handlers";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED === "true";
}

function jsonError(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  if (!featureEnabled()) return jsonError("feature_disabled", 404);
  const { token } = await ctx.params;
  if (!token || typeof token !== "string") return jsonError("invalid_token", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("unauthenticated", 401);

  const admin = createAdminClient();
  const result = await handleVerify(
    {
      user_id: user.id,
      token_hash: hashVerificationToken(token),
      now: new Date(),
    },
    { admin },
  );

  if (!result.ok) {
    const status =
      result.code === "schema_not_ready"
        ? 503
        : result.code === "token_not_found"
          ? 404
          : result.code === "already_cancelled"
            ? 409
            : result.code === "token_expired"
              ? 410
              : 500;
    return NextResponse.json({ ok: false, code: result.code, job: result.job }, { status });
  }
  return NextResponse.json({
    ok: true,
    job: result.job,
    eligibility: result.eligibility,
    idempotent: result.idempotent ?? false,
  });
}
