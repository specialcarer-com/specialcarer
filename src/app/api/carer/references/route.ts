import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderReferenceInviteEmail } from "@/lib/email/templates";
import { MAX_REFERENCES } from "@/lib/vetting/types";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://specialcarer.com"
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("carer_references")
    .select(
      "id, referee_name, referee_email, relationship, status, token_expires_at, rating, recommend, comment, submitted_at, verified_at, rejected_reason, created_at",
    )
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ references: data ?? [] });
}

type CreateBody = {
  referee_name?: string;
  referee_email?: string;
  relationship?: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.referee_name ?? "").trim();
  const email = String(body.referee_email ?? "").trim().toLowerCase();
  const relationship =
    typeof body.relationship === "string" && body.relationship.trim()
      ? body.relationship.trim().slice(0, 80)
      : null;
  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const { count } = await supabase
    .from("carer_references")
    .select("id", { count: "exact", head: true })
    .eq("carer_id", user.id);
  if ((count ?? 0) >= MAX_REFERENCES) {
    return NextResponse.json(
      { error: `Limit ${MAX_REFERENCES} references` },
      { status: 400 },
    );
  }

  const token = randomUUID().replace(/-/g, "");
  const { data: inserted, error } = await supabase
    .from("carer_references")
    .insert({
      carer_id: user.id,
      referee_name: name,
      referee_email: email,
      relationship,
      token,
    })
    .select(
      "id, referee_name, referee_email, relationship, status, token, token_expires_at",
    )
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  // Best-effort: fetch carer's display name for the email body.
  let carerName = "A SpecialCarer applicant";
  try {
    const admin = createAdminClient();
    const { data: prof } = await admin
      .from("caregiver_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle<{ display_name: string | null }>();
    if (prof?.display_name) carerName = prof.display_name;
    else if (user.email) carerName = user.email.split("@")[0];
  } catch {
    /* ignore */
  }

  const link = `${siteUrl()}/r/${inserted.token}`;
  const { subject, html, text } = renderReferenceInviteEmail({
    refereeName: name,
    carerName,
    link,
    expiresAtIso: inserted.token_expires_at,
  });
  await sendEmail({ to: email, subject, html, text }).catch((e) => {
    console.error("[references] invite email failed", e);
  });

  return NextResponse.json({
    reference: {
      id: inserted.id,
      referee_name: inserted.referee_name,
      referee_email: inserted.referee_email,
      relationship: inserted.relationship,
      status: inserted.status,
      token_expires_at: inserted.token_expires_at,
    },
  });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  // Only allow delete when the row is still in 'invited' state — once
  // submitted/verified the row is part of the audit trail.
  const { error } = await supabase
    .from("carer_references")
    .delete()
    .eq("id", id)
    .eq("carer_id", user.id)
    .eq("status", "invited");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
