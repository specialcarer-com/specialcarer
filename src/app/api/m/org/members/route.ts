/**
 * GET /api/m/org/members — Phase D / PR D2.
 *
 * Returns the caller's org's member list with a narrow projection
 * (no phone, no job_title_other, no PII beyond what the team page
 * needs). Any signed-in member of the org can call this — the
 * handler enforces cross-org isolation via `findMyRole()`.
 *
 * Feature-flag gated: 404 unless NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 * is true. Deploy-safe: schema_not_ready fallback returns 202.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import { handleListMembers } from "@/lib/org/members";
import { makeSupabaseMembersDb } from "@/lib/org/members-db";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest) {
  if (!featureEnabled()) return notFound();

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

  // Resolve which org the actor is a member of. The client may pass
  // ?organizationId= for future multi-org UI; otherwise we use the
  // sole org from getMyOrgMembership().
  const url = new URL(req.url);
  const qsOrg = url.searchParams.get("organizationId");
  let organizationId = qsOrg?.trim() ?? "";
  if (organizationId === "") {
    const membership = await getMyOrgMembership(admin, user.id);
    organizationId = membership?.organization_id ?? "";
  }

  const db = makeSupabaseMembersDb(admin);
  const result = await handleListMembers(
    {
      actor: { id: user.id, email: user.email ?? null },
      organizationId,
    },
    { db },
  );
  return NextResponse.json(result.body, { status: result.status });
}
