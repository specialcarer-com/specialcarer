/**
 * POST /api/account/delete/cancel
 *
 * User cancels their own pending deletion. Only pre-work states are
 * cancellable — once the cron worker is `in_progress` the erasure is
 * partway through. Admins can force-cancel from the back office (out
 * of scope for C5).
 *
 * Pure logic in src/lib/gdpr/deletion-handlers.ts#handleCancel.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleCancel } from "@/lib/gdpr/deletion-handlers";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED === "true";
}

function jsonError(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(req: NextRequest) {
  if (!featureEnabled()) return jsonError("feature_disabled", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("unauthenticated", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalid_json", 400);
  }
  const job_id = typeof body.job_id === "string" ? body.job_id.trim() : "";
  if (!job_id) return jsonError("job_id_required", 400);

  const admin = createAdminClient();
  const result = await handleCancel(
    { user_id: user.id, job_id, now: new Date() },
    { admin },
  );

  if (!result.ok) {
    const status =
      result.code === "schema_not_ready"
        ? 503
        : result.code === "job_not_found"
          ? 404
          : result.code === "forbidden"
            ? 403
            : result.code === "not_cancellable"
              ? 409
              : 500;
    return NextResponse.json(
      { ok: false, code: result.code, state: result.state },
      { status },
    );
  }
  return NextResponse.json({ ok: true, job: result.job });
}
