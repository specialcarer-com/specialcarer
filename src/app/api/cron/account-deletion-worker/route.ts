/**
 * GET /api/cron/account-deletion-worker
 *
 * Hourly Vercel cron entrypoint. Delegates to
 * src/lib/gdpr/deletion-worker.ts#runDeletionWorker for the pure
 * batch logic — this file just wires up the real Supabase admin
 * client, PR #210's erasure handler, the completion-email template,
 * and the auth.users lookup.
 *
 * Auth: requireCronAuth (Bearer CRON_SECRET).
 * Feature-flag gated: NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED must
 * be true, otherwise the route responds 404 (same shape as the user-
 * facing routes so a pre-flag deployment is fully quiet).
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderAccountDeletionCompleteEmail } from "@/lib/gdpr/emails";
import {
  handleDsarErase,
  summariseNulled,
  summariseRetained,
  type ErasureAdminClient,
} from "@/lib/dsar/erase";
import {
  runDeletionWorker,
  type ErasureAudit,
} from "@/lib/gdpr/deletion-worker";

export const dynamic = "force-dynamic";

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED === "true";
}

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  if (!featureEnabled()) {
    return NextResponse.json({ ok: true, skipped: "feature_disabled", processed: 0 });
  }

  const admin = createAdminClient();

  const result = await runDeletionWorker({
    admin,
    runErase: async (adminArg, input) => {
      // PR #210's handler is the source of truth for the erasure
      // manifest. We do not reimplement it here — see docs on
      // ERASURE_MANIFEST in src/lib/dsar/erase.ts.
      const out = await handleDsarErase(
        adminArg as unknown as ErasureAdminClient,
        input,
      );
      // Cast the audit rows into the worker's local shape; the two
      // are structurally compatible.
      return {
        ok: out.ok,
        audit: out.audit as unknown as ErasureAudit[],
        deferred: out.deferred,
        audit_persist_error: out.audit_persist_error,
        deferred_persist_error: out.deferred_persist_error,
        // request_persist_error is expected for our bridge row —
        // the handler tries to flip state to 'erased' which succeeds,
        // so this should be null in the happy path.
        request_persist_error: out.request_persist_error,
        digest: out.digest,
        version: out.version,
      };
    },
    sendCompletionEmail: async (args) => {
      const email = renderAccountDeletionCompleteEmail({
        subject_email: args.to,
        job_id: args.job_id,
        // Reuse PR #210's summarisers to keep the DSAR + self-service
        // wording identical.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nulled: summariseNulled(args.audit as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        retained: summariseRetained(args.audit as any),
        max_retained_until: args.max_retained_until,
        digest: args.digest,
      });
      await sendEmail({
        to: args.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    },
    lookupUserEmail: async (user_id) => {
      const { data, error } = await admin.auth.admin.getUserById(user_id);
      if (error) return null;
      return data.user?.email ?? null;
    },
  });

  return NextResponse.json(result);
}
