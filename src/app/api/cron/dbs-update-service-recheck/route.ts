import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeNextUsCheckDueAt,
  getDbsProvider,
  type VerifyUpdateServiceInput,
} from "@/lib/dbs/provider";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/dbs-update-service-recheck
 *
 * Daily. Picks carers whose Update Service-backed DBS row is due for
 * its annual recheck (`next_us_check_due_at <= now()`), calls the
 * provider's verifyUpdateService(), and:
 *
 * - 'current'   → push the recheck timestamp + 12 months, gate stays green.
 * - 'changed'   → mark row as failed, raise a dbs_change_event row, AND
 *                 flip the carer's agency_opt_in_status to 'paused' so
 *                 they cannot accept new Channel B bookings.
 * - any error   → leave next_us_check_due_at as-is so we retry tomorrow;
 *                 record the attempt in us_check_result.
 *
 * Existing allocated bookings are NOT retroactively unassigned (Phase 5
 * follow-up).
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const provider = getDbsProvider();

  // Eligible: source=update_service, status=cleared, next_us_check_due_at <= now.
  const { data: due, error } = await admin
    .from("background_checks")
    .select(
      "id, user_id, update_service_subscription_id, workforce_type, next_us_check_due_at",
    )
    .eq("source", "update_service")
    .eq("status", "cleared")
    .lte("next_us_check_due_at", new Date().toISOString())
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let checked = 0;
  let kept = 0;
  let changed = 0;
  let failed = 0;
  const errors: { id: string; message: string }[] = [];

  for (const row of (due ?? []) as Array<{
    id: string;
    user_id: string;
    update_service_subscription_id: string | null;
    workforce_type: string | null;
    next_us_check_due_at: string | null;
  }>) {
    checked += 1;
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, date_of_birth")
        .eq("id", row.user_id)
        .maybeSingle<{ full_name: string | null; date_of_birth: string | null }>();

      // Provider may not have everything we collected at first submit;
      // we keep what we need to re-call verifyUpdateService.
      const input: VerifyUpdateServiceInput = {
        carerLegalName: profile?.full_name ?? "",
        dateOfBirth: profile?.date_of_birth ?? "",
        certificateNumber: "", // not stored separately; rely on subscriptionId
        subscriptionId: row.update_service_subscription_id ?? "",
        workforceType:
          (row.workforce_type as "adult" | "child" | "both" | null) ?? "both",
      };

      const result = await provider.verifyUpdateService(input);
      const nowIso = new Date().toISOString();

      if (result.ok && result.status === "current") {
        const nextDue = computeNextUsCheckDueAt(new Date()).toISOString();
        await admin
          .from("background_checks")
          .update({
            last_us_check_at: nowIso,
            next_us_check_due_at: nextDue,
            us_check_result: { status: "current", raw: result.raw, provider: provider.name },
            us_reminder_sent_at: null,
          })
          .eq("id", row.id);
        kept += 1;
      } else if (result.ok && result.status === "changed") {
        await admin
          .from("background_checks")
          .update({
            status: "failed",
            last_us_check_at: nowIso,
            us_check_result: { status: "changed", raw: result.raw, provider: provider.name },
          })
          .eq("id", row.id);
        await admin.from("dbs_change_events").insert({
          carer_id: row.user_id,
          source: "update_service_recheck",
          prior_status: "current",
          new_status: "changed",
          raw_payload: result.raw as object,
        });
        await admin
          .from("profiles")
          .update({
            agency_opt_in_status: "paused",
            agency_opt_in_paused_reason:
              "DBS Update Service detected a status change — pending admin review",
          })
          .eq("id", row.user_id);
        changed += 1;
      } else {
        await admin
          .from("background_checks")
          .update({
            us_check_result: {
              status: "recheck_failed",
              reason: result.ok ? "unknown" : result.reason,
              raw: result.raw,
              provider: provider.name,
              attempted_at: nowIso,
            },
          })
          .eq("id", row.id);
        failed += 1;
      }
    } catch (e) {
      errors.push({
        id: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    kept,
    changed,
    failed,
    errors,
  });
}
