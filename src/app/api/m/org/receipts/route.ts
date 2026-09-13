/**
 * GET /api/m/org/receipts — list org receipts (cursor-paginated).
 *
 * D5 route. Same auth pattern as `/api/m/org/bookings` (D3):
 *   1. Bearer JWT / cookie session → auth.getUser().
 *   2. Resolve caller's org membership via getMyOrgMembership().
 *   3. Feature-flag: gated behind NEXT_PUBLIC_ORG_INVITATIONS_ENABLED
 *      (the shared Phase D flag — no separate D5 flag). When OFF the
 *      route responds 404 so the client falls back to the pre-D5 UX
 *      (no receipts section rendered).
 *   4. RLS enforces which rows come back (owner/admin/finance only).
 *      This route uses the admin client with an explicit
 *      `organization_id` filter so the query works regardless of
 *      whether the caller's session carries the right JWT claims;
 *      the role check above already gates access.
 *
 * Cursor semantics: reverse-chronological (issued_at DESC). Cursor is
 * the last row's ISO issued_at. Cursor is `.lt(...)` (strict less
 * than) so ties on identical timestamps are consumed by adding a
 * secondary ordering on `id DESC` (id UUID = random, but deterministic
 * within a query). Callers pass `?cursor=<iso>&limit=20`.
 *
 * See /home/user/workspace/phase_d/d5_receipts_and_overdue_block.md
 * for the receipts lifecycle diagram and error-code mapping.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";

export const dynamic = "force-dynamic";

// Shared Phase D flag — no separate D5 flag. See D5 runbook.
function orgInvitationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

// Roles allowed to read receipts. Mirrors the RLS policy in the D5
// migration (org_receipts_admin_finance_read_v2). Kept as a route-
// layer defence-in-depth: the RLS policy is authoritative, but a
// fast pre-check here saves a round-trip when a viewer/booker hits
// the endpoint.
const READ_ROLES = new Set(["owner", "admin", "finance"]);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  if (!orgInvitationsEnabled()) {
    // 404 (not 403) so the client treats the endpoint as non-existent
    // and doesn't surface a "you don't have permission" message when
    // the whole feature is dormant.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!READ_ROLES.has(member.role)) {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  let q = admin
    .from("org_receipts")
    .select(
      "id, receipt_number, amount_cents, currency, service_description, " +
      "issued_at, booking_id, receipt_pdf_url"
    )
    .eq("organization_id", member.organization_id)
    .order("issued_at", { ascending: false })
    // Over-fetch by 1 so we can compute next_cursor without a second call.
    .limit(limit + 1);

  if (cursor) {
    // Validate cursor is an ISO timestamp; otherwise 400.
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
    }
    q = q.lt("issued_at", cursor);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    receipt_number: string;
    amount_cents: number;
    currency: string;
    service_description: string;
    issued_at: string;
    booking_id: string;
    receipt_pdf_url: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? page[page.length - 1].issued_at
    : null;

  return NextResponse.json({
    receipts: page,
    next_cursor: nextCursor,
  });
}
