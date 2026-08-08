import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import {
  renderReferenceReminderStage1Email,
  renderReferenceReminderStage2Email,
  renderReferenceReminderStage3Email,
} from "@/lib/email/templates";
import {
  firstName,
  nextReferenceReminderStage,
  type ReferenceReminderRow,
} from "@/lib/vetting/reference-reminders";
import type { ReferenceType } from "@/lib/vetting/types";

export const dynamic = "force-dynamic";

const MAX_ROWS_PER_RUN = 500;

type ReminderReference = ReferenceReminderRow & {
  id: string;
  carer_id: string;
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
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();
  const { data, error } = await admin
    .from("carer_references")
    .select(
      "id, carer_id, referee_name, referee_email, reference_type, token, token_expires_at, created_at, reminder_stage",
    )
    .eq("status", "invited")
    .gt("token_expires_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const references = (data ?? []) as ReminderReference[];
  const carerNames = new Map<string, string>();
  const errors: { reference_id: string; error: string }[] = [];
  let sent = 0;

  for (const reference of references) {
    const stage = nextReferenceReminderStage(reference, now);
    if (!stage) continue;

    try {
      let carerName = carerNames.get(reference.carer_id);
      if (!carerName) {
        const { data: profile, error: profileError } = await admin
          .from("caregiver_profiles")
          .select("display_name")
          .eq("user_id", reference.carer_id)
          .maybeSingle<{ display_name: string | null }>();
        if (profileError) throw profileError;
        carerName = firstName(profile?.display_name ?? "the carer");
        carerNames.set(reference.carer_id, carerName);
      }

      const emailArgs = {
        refereeName: reference.referee_name,
        carerName,
        link: `${siteUrl()}/r/${reference.token}`,
        declineLink: `${siteUrl()}/r/${reference.token}?decline=1`,
        expiresAtIso: reference.token_expires_at,
        referenceType: reference.reference_type ?? "employer",
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

      const { error: stampError } = await admin
        .from("carer_references")
        .update({ reminder_stage: stage, last_reminder_at: now.toISOString() })
        .eq("id", reference.id)
        .eq("status", "invited")
        .eq("reminder_stage", reference.reminder_stage);
      if (stampError) throw stampError;
      sent += 1;
    } catch (err) {
      errors.push({
        reference_id: reference.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    scanned: references.length,
    sent,
    errors,
  });
}
