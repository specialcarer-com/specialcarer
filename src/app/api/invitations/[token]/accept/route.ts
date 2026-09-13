/**
 * POST /api/invitations/[token]/accept — Phase D / PR D1.
 *
 * Auth REQUIRED. Verifies the logged-in user's email matches the
 * invited email (case-insensitive). Calls the
 * `accept_organization_invitation` RPC via the service-role admin
 * client to bypass `organization_members`'s no-INSERT-RLS surface.
 *
 * Feature-flag gated: 404 unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 * is true.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleAccept } from "@/lib/org/invitations";
import { makeSupabaseInvitationsDb } from "@/lib/org/invitations-db";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!featureEnabled()) return notFound();
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const db = makeSupabaseInvitationsDb(admin);

  const result = await handleAccept(
    {
      rawToken: token,
      actor: { id: user.id, email: user.email ?? null },
    },
    {
      db,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://specialcarer.com",
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
