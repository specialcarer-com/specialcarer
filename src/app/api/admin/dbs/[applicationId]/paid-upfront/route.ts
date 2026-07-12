/**
 * POST /api/admin/dbs/[applicationId]/paid-upfront
 *
 * Admin marks a carer's DBS cost as paid upfront (e.g. the carer paid by
 * another channel), skipping earnings recovery for ALL of that carer's
 * applications. Admin-only. Gated by NEXT_PUBLIC_DBS_ENABLED.
 */

import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDbsEnabled } from "@/lib/dbs/flag";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  if (!isDbsEnabled()) {
    return NextResponse.json(
      { error: "DBS feature is disabled" },
      { status: 403 },
    );
  }

  const { applicationId } = await params;
  const admin = createAdminClient();

  const { data: app } = await admin
    .from("dbs_applications")
    .select("carer_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  await admin
    .from("dbs_applications")
    .update({ recovery_status: "paid_upfront" })
    .eq("carer_id", app.carer_id)
    .in("recovery_status", ["pending", "recovering"]);

  await logAdminAction({
    admin: guard.admin,
    action: "dbs.mark_paid_upfront",
    targetType: "dbs_application",
    targetId: applicationId,
    details: { carer_id: app.carer_id },
  });

  return NextResponse.json({ ok: true });
}
