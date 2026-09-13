/**
 * PATCH /api/m/org/members/[id]/role — Phase D / PR D2.
 *
 * Updates a member's role. Body: `{ role: 'admin' | 'booker' |
 * 'finance' | 'viewer' }` — owner is deliberately excluded and
 * returns 400 invalid_role (owner-transfer is a later PR). Requires
 * admin+ on the same org. Cannot change the owner's role.
 *
 * Feature-flag gated: 404 unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 * is true. Deploy-safe: schema_not_ready → 202.
 *
 * Audit: appends `role_changed` row on success via
 * `MembersDb.insertAudit()` (best-effort).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleChangeRole } from "@/lib/org/members";
import { makeSupabaseMembersDb } from "@/lib/org/members-db";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(
  req: NextRequest,
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

  let body: { role?: unknown };
  try {
    body = (await req.json()) as { role?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const db = makeSupabaseMembersDb(admin);

  const result = await handleChangeRole(
    {
      actor: { id: user.id, email: user.email ?? null },
      memberId: id,
      role: body.role,
    },
    { db },
  );
  return NextResponse.json(result.body, { status: result.status });
}
