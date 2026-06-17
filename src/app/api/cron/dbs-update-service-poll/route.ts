import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDbsVendor } from "@/lib/dbs/vendor";
import { sendEmail } from "@/lib/email/smtp";
import {
  pollUpdateService,
  type DueRow,
  type PollClient,
  type PollNotifier,
} from "./poll-handler";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

/** Adapt the Supabase admin client to the handler's narrow PollClient surface. */
function makePollClient(admin: Admin): PollClient {
  return {
    async fetchDueRows(cutoffIso) {
      const { data } = await admin
        .from("dbs_applications")
        .select(
          "id, carer_id, certificate_number, update_service_last_checked_at",
        )
        .eq("update_service_enrolled", true)
        .eq("status", "approved")
        .or(
          `update_service_last_checked_at.is.null,update_service_last_checked_at.lt.${cutoffIso}`,
        )
        .limit(500);
      return (data ?? []) as DueRow[];
    },
    async markChecked(applicationId, nowIso) {
      await admin
        .from("dbs_applications")
        .update({ update_service_last_checked_at: nowIso })
        .eq("id", applicationId);
    },
    async markChangePending(applicationId, carerId, nowIso) {
      await admin
        .from("dbs_applications")
        .update({
          status: "in_progress",
          update_service_last_checked_at: nowIso,
        })
        .eq("id", applicationId);
      await admin
        .from("caregiver_profiles")
        .update({ dbs_overall_status: "in_progress" })
        .eq("user_id", carerId);
    },
    async markInvalidated(applicationId, carerId, nowIso) {
      await admin
        .from("dbs_applications")
        .update({
          status: "expired",
          update_service_last_checked_at: nowIso,
        })
        .eq("id", applicationId);
      // Suspend the carer from search immediately.
      await admin
        .from("caregiver_profiles")
        .update({
          dbs_overall_status: "expired",
          dbs_search_eligible: false,
        })
        .eq("user_id", carerId);
    },
  };
}

const ADMIN_DBS_INBOX =
  process.env.DBS_ADMIN_EMAIL ?? "ops@specialcarer.com";

function makeNotifier(admin: Admin): PollNotifier {
  async function carerEmail(carerId: string): Promise<string | null> {
    const { data } = await admin
      .from("profiles")
      .select("email")
      .eq("id", carerId)
      .maybeSingle<{ email: string | null }>();
    return data?.email ?? null;
  }

  return {
    async adminChangePending(carerId) {
      await sendEmail({
        to: ADMIN_DBS_INBOX,
        subject: "DBS Update Service: change pending",
        html: `<p>The DBS Update Service reported a <strong>pending change</strong> for carer <code>${carerId}</code>. Their DBS has been moved to in-progress pending review.</p>`,
        text: `DBS Update Service reported a pending change for carer ${carerId}. Their DBS has been moved to in-progress pending review.`,
      });
    },
    async adminInvalidated(carerId) {
      await sendEmail({
        to: ADMIN_DBS_INBOX,
        subject: "DBS Update Service: certificate invalidated",
        html: `<p>The DBS Update Service reported an <strong>invalidated</strong> certificate for carer <code>${carerId}</code>. They have been suspended from search.</p>`,
        text: `DBS Update Service reported an invalidated certificate for carer ${carerId}. They have been suspended from search.`,
      });
    },
    async carerInvalidated(carerId) {
      const to = await carerEmail(carerId);
      if (!to) return;
      await sendEmail({
        to,
        subject: "Action needed: your DBS Update Service status changed",
        html: `<p>Your DBS certificate is no longer showing as current on the DBS Update Service, so we've paused your visibility in search. Please contact support to resolve this.</p>`,
        text: "Your DBS certificate is no longer showing as current on the DBS Update Service, so we've paused your visibility in search. Please contact support to resolve this.",
      });
    },
  };
}

/**
 * GET /api/cron/dbs-update-service-poll
 *
 * Daily (06:xx UTC). Polls the DBS Update Service for every carer with an
 * Update-Service-enrolled, approved DBS application that hasn't been checked in
 * the last 23h. Operates on the dbs_applications model (PR-DBS-1/2), distinct
 * from the legacy background_checks recheck cron (see src/lib/dbs/provider.ts).
 *
 *   - clear           → bump update_service_last_checked_at.
 *   - change_pending  → set dbs_overall_status='in_progress', notify admin.
 *   - invalidated     → expire the application, suspend the carer from search,
 *                       notify admin + carer.
 *
 * Authenticated via CRON_SECRET (Authorization: Bearer <secret>) when set.
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
  const summary = await pollUpdateService({
    admin: makePollClient(admin),
    vendor: getDbsVendor(),
    notify: makeNotifier(admin),
  });
  return NextResponse.json({ ok: true, ...summary });
}
