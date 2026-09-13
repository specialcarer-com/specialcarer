/**
 * GET /api/cron/expire-org-invitations — Phase D / PR D1.
 *
 * Daily 03:00 UTC (registered in vercel.json). Observability-only:
 * counts pending invites whose `expires_at < now()` and reports the
 * count. No state mutation is needed because expiry is derived at
 * query time (all reader queries filter `expires_at > now()`), so a
 * "past-expiry pending" row is inert.
 *
 * Auth: requireCronAuth (Bearer CRON_SECRET). Feature-flag gated: 404
 * unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED is true.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleExpireCron } from "@/lib/org/invitations";
import { makeSupabaseInvitationsDb } from "@/lib/org/invitations-db";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  if (!featureEnabled()) {
    // Return 200 (not 404) for the cron path so a disabled feature
    // doesn't page ops. Same shape as account-deletion-worker.
    return NextResponse.json({ ok: true, skipped: "feature_disabled", expiredCount: 0 });
  }

  const admin = createAdminClient();
  const db = makeSupabaseInvitationsDb(admin);

  const result = await handleExpireCron({ db });
  return NextResponse.json(result.body, { status: result.status });
}
