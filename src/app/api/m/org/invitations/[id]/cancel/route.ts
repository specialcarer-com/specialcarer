/**
 * POST /api/m/org/invitations/[id]/cancel — Phase D / PR D1.
 *
 * Feature-flag gated: 404 unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 * is true. Actor must be an org admin (owner/admin role on the same
 * org) — enforced in the handler.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleCancel } from "@/lib/org/invitations";
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
  { params }: { params: Promise<{ id: string }> },
) {
  if (!featureEnabled()) return notFound();
  const { id } = await params;

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

  const result = await handleCancel(
    {
      actor: { id: user.id, email: user.email ?? null },
      invitationId: id,
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
