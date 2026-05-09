import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  rating?: number;
  recommend?: boolean;
  comment?: string;
};

/**
 * POST /api/references/submit
 *
 * Public endpoint (no auth) — the referee follows the email link to
 * /r/[token]/page.tsx and submits the form. Token verifies the row.
 * Status flips invited → submitted; admin then flips to verified
 * later from the trust-safety dashboard.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const rating =
    Number.isInteger(body.rating) &&
    (body.rating as number) >= 1 &&
    (body.rating as number) <= 5
      ? (body.rating as number)
      : null;
  const recommend =
    typeof body.recommend === "boolean" ? body.recommend : null;
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 2000)
      : null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("carer_references")
    .select("id, status, token_expires_at")
    .eq("token", token)
    .maybeSingle<{
      id: string;
      status: string;
      token_expires_at: string;
    }>();

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.status !== "invited") {
    return NextResponse.json({ error: "already_submitted" }, { status: 400 });
  }
  if (new Date(row.token_expires_at).getTime() < Date.now()) {
    await admin
      .from("carer_references")
      .update({ status: "expired" })
      .eq("id", row.id);
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;

  const { error } = await admin
    .from("carer_references")
    .update({
      status: "submitted",
      rating,
      recommend,
      comment,
      ip_address: ip,
      user_agent: ua,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
