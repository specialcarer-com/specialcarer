/**
 * GET /api/invitations/[token] — Phase D / PR D1.
 *
 * PUBLIC route (no auth required). Uses the service-role admin client
 * to bypass RLS — the sanctioned pattern for token-based
 * validation, matching /r/[token] refereeing links and DSAR erasure
 * confirmation.
 *
 * Feature-flag gated: 404 unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 * is true.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handlePreview } from "@/lib/org/invitations";
import { makeSupabaseInvitationsDb } from "@/lib/org/invitations-db";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!featureEnabled()) return notFound();
  const { token } = await params;

  const admin = createAdminClient();
  const db = makeSupabaseInvitationsDb(admin);

  const result = await handlePreview(
    { rawToken: token },
    {
      db,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://specialcarer.com",
      // Not used on the preview path — provide no-op sender + always-allow limiter.
      sendEmail: async (m) => sendEmail(m),
      rateLimit: async () => ({
        ok: true,
        retryAfterSec: 0,
        remaining: 1,
        limit: 1,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      }),
    },
  );

  return NextResponse.json(result.body, { status: result.status });
}
