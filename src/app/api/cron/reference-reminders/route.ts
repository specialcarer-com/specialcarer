import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import {
  renderReferenceReminderStage1Email,
  renderReferenceReminderStage2Email,
  renderReferenceReminderStage3Email,
} from "@/lib/email/templates";
import {
  processReferenceReminders,
  type ReferenceReminderCandidate,
} from "@/lib/vetting/reference-reminders";
import type { ReferenceType } from "@/lib/vetting/types";
import { authoriseReferenceReminderCron } from "./auth";

export const dynamic = "force-dynamic";
// Vercel serverless per-invocation timeout; keep each daily batch bounded.
export const maxDuration = 60;

const MAX_ROWS_PER_RUN = 100;

type ReminderReference = ReferenceReminderCandidate & {
  referee_name: string;
  referee_email: string;
  reference_type: ReferenceType | null;
  token: string;
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://www.specialcarer.com"
  );
}

/** GET /api/cron/reference-reminders — daily Day 3/7/12 reference nudges. */
export async function GET(req: Request) {
  const authorisation = authoriseReferenceReminderCron(
    req.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
  if (!authorisation.ok) {
    return NextResponse.json(
      { error: authorisation.error },
      { status: authorisation.status },
    );
  }

  const admin = createAdminClient();
  const now = new Date();
  const { data, error } = await admin
    .from("carer_references")
    .select(
      "id, carer_id, referee_name, referee_email, reference_type, token, token_expires_at, created_at, last_resend_at, reminder_stage",
    )
    .eq("status", "invited")
    .gt("token_expires_at", now.toISOString())
    .lt("reminder_stage", 3)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const references = (data ?? []) as ReminderReference[];
  const result = await processReferenceReminders(references, now, {
    getCarerName: async (carerId) => {
      const { data: profile, error: profileError } = await admin
        .from("caregiver_profiles")
        .select("display_name")
        .eq("user_id", carerId)
        .maybeSingle<{ display_name: string | null }>();
      if (profileError) throw profileError;
      return profile?.display_name ?? null;
    },
    dispatch: async ({ reference, stage, carerName }) => {
      const emailArgs = {
        refereeName: reference.referee_name,
        carerName,
        link: `${siteUrl()}/r/${reference.token}`,
        declineLink: `${siteUrl()}/r/${reference.token}?decline=1`,
        expiresAtIso: reference.token_expires_at,
        referenceType: reference.reference_type ?? "employer",
        now,
      };
      const { subject, html, text } =
        stage === 1
          ? renderReferenceReminderStage1Email(emailArgs)
          : stage === 2
            ? renderReferenceReminderStage2Email(emailArgs)
            : renderReferenceReminderStage3Email(emailArgs);
      const delivery = await sendEmail({
        to: reference.referee_email,
        subject,
        html,
        text,
      });
      if (!delivery.ok) throw new Error(delivery.error);
    },
    markSent: async ({ reference, stage, sentAt }) => {
      const { data: stamped, error: stampError } = await admin
        .from("carer_references")
        .update({ reminder_stage: stage, last_reminder_at: sentAt })
        .eq("id", reference.id)
        .eq("status", "invited")
        .eq("reminder_stage", reference.reminder_stage)
        .select("id")
        .maybeSingle();
      if (stampError) throw stampError;
      if (!stamped) throw new Error("Reference reminder was already updated");
    },
  });

  return NextResponse.json(result);
}
