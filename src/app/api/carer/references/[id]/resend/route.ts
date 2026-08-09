import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderReferenceInviteEmail } from "@/lib/email/templates";
import {
  buildReferenceResendUpdate,
  decideReferenceResend,
  type ReferenceResendRow,
} from "@/lib/vetting/reference-resend";
import { deliverReferenceResendEmail } from "@/lib/vetting/reference-resend-delivery";
import type { ReferenceType } from "@/lib/vetting/types";

export const dynamic = "force-dynamic";

type ReferenceRow = ReferenceResendRow & {
  id: string;
  referee_name: string;
  referee_email: string;
  reference_type: ReferenceType | null;
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://www.specialcarer.com"
  );
}

async function carerDisplayName(args: {
  carerId: string;
  fallbackEmail: string | null | undefined;
}): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("caregiver_profiles")
      .select("display_name")
      .eq("user_id", args.carerId)
      .maybeSingle<{ display_name: string | null }>();
    if (data?.display_name) return data.display_name;
  } catch {
    // A display name is a convenience for the email; delivery can continue.
  }
  return args.fallbackEmail?.split("@")[0] ?? "A SpecialCarer applicant";
}

/** POST /api/carer/references/:id/resend */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: reference, error: loadError } = await admin
    .from("carer_references")
    .select(
      "id, carer_id, referee_name, referee_email, reference_type, status, resend_count, last_resend_at",
    )
    .eq("id", id)
    .eq("carer_id", user.id)
    .maybeSingle<ReferenceRow>();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!reference) {
    return NextResponse.json({ error: "Reference not found" }, { status: 404 });
  }

  const now = new Date();
  const decision = decideReferenceResend({
    reference,
    requesterCarerId: user.id,
    now,
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  const token = randomUUID().replace(/-/g, "");
  const update = buildReferenceResendUpdate({
    nextResendCount: decision.nextResendCount,
    token,
    now,
  });
  const carerName = await carerDisplayName({
    carerId: reference.carer_id,
    fallbackEmail: user.email,
  });
  const { subject, html, text } = renderReferenceInviteEmail({
    refereeName: reference.referee_name,
    carerName,
    link: `${siteUrl()}/r/${token}`,
    expiresAtIso: update.token_expires_at,
    referenceType: reference.reference_type ?? "employer",
  });
  const delivery = await deliverReferenceResendEmail(sendEmail, {
    to: reference.referee_email,
    subject,
    html,
    text,
  });
  if (!delivery.ok) {
    return NextResponse.json({ error: delivery.error }, { status: delivery.status });
  }

  const { data: updated, error: updateError } = await admin
    .from("carer_references")
    .update(update)
    .eq("id", reference.id)
    .eq("carer_id", user.id)
    .in("status", ["invited", "expired"])
    .select("id, status, token_expires_at, resend_count, last_resend_at")
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Reference can no longer be resent" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    reference: updated,
    token_expires_at: updated.token_expires_at,
  });
}
