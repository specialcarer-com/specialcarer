import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  action?: "approve" | "reject";
  reason?: string;
};

export async function POST(req: Request) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !body.id ||
    (body.action !== "approve" && body.action !== "reject")
  ) {
    return NextResponse.json({ error: "invalid_args" }, { status: 400 });
  }
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    reviewed_by: me.id,
    reviewed_at: new Date().toISOString(),
  };
  if (body.action === "approve") {
    update.status = "approved";
    update.rejection_reason = null;
  } else {
    update.status = "rejected";
    update.rejection_reason =
      typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
  }
  const { error } = await admin
    .from("carer_interview_submissions")
    .update(update)
    .eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/admin/vetting/interviews?id=...&signed=1 returns a fresh
 * signed URL for the video so admins can stream/preview it.
 */
export async function GET(req: Request) {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("carer_interview_submissions")
    .select("video_path")
    .eq("id", id)
    .maybeSingle<{ video_path: string }>();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: signed } = await admin.storage
    .from("interview-videos")
    .createSignedUrl(row.video_path, 3600);
  return NextResponse.json({ signed_url: signed?.signedUrl ?? null });
}
