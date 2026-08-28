import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/compliance-sweep
 *
 * Daily — flips status='verified' to 'expired' when expires_at < today.
 * Returns count + a list of affected caregiver_ids so a follow-up
 * notification job (placeholder — log to console) can fan out.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("compliance_documents")
    .update({ status: "expired" })
    .eq("status", "verified")
    .lt("expires_at", today)
    .select("id, caregiver_id, doc_type, expires_at");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const affected = data ?? [];

  // Notification placeholder — the real channel (email / push / in-app)
  // is wired up by feature 3.10's notification subsystem. For now, we
  // simply log, which the parent / ops team can grep in Vercel.
  for (const row of affected) {
    console.log("compliance.expired", row);
  }

  return NextResponse.json({
    ok: true,
    expired_count: affected.length,
    affected: affected.map((r) => ({
      caregiver_id: r.caregiver_id,
      doc_type: r.doc_type,
    })),
  });
}
