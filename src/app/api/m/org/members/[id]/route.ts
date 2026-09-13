/**
 * DELETE /api/m/org/members/[id] — Phase D / PR D2.
 *
 * Removes a member from their org. Requires admin+ role on the same
 * org (owner also OK). Cannot remove the org owner. Cannot self-
 * remove if that would leave the org with no admins.
 *
 * Feature-flag gated: 404 unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 * is true. Deploy-safe: schema_not_ready → 202.
 *
 * Audit: appends `removed` row on success via
 * `MembersDb.insertAudit()` (best-effort).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRemoveMember } from "@/lib/org/members";
import { makeSupabaseMembersDb } from "@/lib/org/members-db";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(
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
  const db = makeSupabaseMembersDb(admin);

  const result = await handleRemoveMember(
    {
      actor: { id: user.id, email: user.email ?? null },
      memberId: id,
    },
    { db },
  );
  return NextResponse.json(result.body, { status: result.status });
}
