/**
 * POST /api/m/org/invitations/send — Phase D / PR D1.
 *
 * Feature-flag gated: NEXT_PUBLIC_ORG_INVITATIONS_ENABLED must be
 * `true`, otherwise the route responds 404 to hide the surface
 * entirely (same shape as other pre-flag routes in this codebase).
 *
 * Wire only — all logic lives in `@/lib/org/invitations`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import { check as rlCheck } from "@/lib/rate-limit/distributed";
import { rateLimitHeaders } from "@/lib/rate-limit/headers";
import { orgInviteSend } from "@/lib/rate-limit/keys";
import { sendEmail } from "@/lib/email/smtp";
import { handleSend } from "@/lib/org/invitations";
import type { InvitationRole } from "@/lib/org/invitations";
import { makeSupabaseInvitationsDb } from "@/lib/org/invitations-db";

export const dynamic = "force-dynamic";

const HOUR_SEC = 60 * 60;
const ORG_LIMIT = 20; // 20/hour/org — matches plan §D1.

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  if (!featureEnabled()) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: { email?: unknown; role?: unknown; organizationId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve which org the actor belongs to (D1 assumes one-org-per-user
  // per phase A; D2 will layer multi-org selection). If the client
  // passes an explicit organizationId we honour it — the admin check
  // in the handler will reject cross-org attempts.
  const membership = await getMyOrgMembership(admin, user.id);
  const organizationId =
    typeof body.organizationId === "string" && body.organizationId.trim() !== ""
      ? body.organizationId.trim()
      : membership?.organization_id ?? "";

  const db = makeSupabaseInvitationsDb(admin);

  // Header capture for observability — rate-limit result is written
  // even on non-429 responses so the client can back off pre-emptively.
  let rlHeaders: Record<string, string> = {};

  const result = await handleSend(
    {
      actor: { id: user.id, email: user.email ?? null },
      organizationId,
      email: typeof body.email === "string" ? body.email : "",
      role: body.role as InvitationRole,
    },
    {
      db,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://specialcarer.com",
      sendEmail: async (m) => sendEmail(m),
      rateLimit: async (key) => {
        const r = await rlCheck({ key: orgInviteSend(key), limit: ORG_LIMIT, windowSec: HOUR_SEC });
        rlHeaders = rateLimitHeaders(r);
        return {
          ok: r.ok,
          retryAfterSec: r.retryAfterSec,
          remaining: r.remaining,
          limit: r.limit,
          resetAt: r.resetAt,
        };
      },
    },
  );

  return NextResponse.json(result.body, {
    status: result.status,
    headers: rlHeaders,
  });
}
