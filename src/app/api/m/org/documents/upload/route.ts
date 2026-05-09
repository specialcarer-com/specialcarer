import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_KINDS, type DocKind } from "@/lib/org/types";
import { getMyOrgMembership } from "@/lib/org/server";

export const dynamic = "force-dynamic";

type Body = {
  kind?: string;
  storage_path?: string;
  filename?: string;
  mime_type?: string;
};

/**
 * POST /api/m/org/documents/upload
 *
 * The mobile client uploads the file to the `organization-documents`
 * bucket directly via the Supabase JS SDK (RLS allows org members to
 * write under `${organization_id}/...`), then posts the resulting
 * path here so we can record the row + admin can review.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = String(body.kind ?? "").trim();
  if (!(DOC_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const path = String(body.storage_path ?? "").trim();
  if (!path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) {
    return NextResponse.json({ error: "no_org" }, { status: 400 });
  }
  // The path must live under the org's folder — defence in depth so
  // a malicious client can't claim someone else's upload.
  if (!path.startsWith(`${member.organization_id}/`)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("organization_documents")
    .insert({
      organization_id: member.organization_id,
      kind: kind as DocKind,
      storage_path: path,
      filename:
        typeof body.filename === "string"
          ? body.filename.slice(0, 240)
          : null,
      mime_type:
        typeof body.mime_type === "string"
          ? body.mime_type.slice(0, 80)
          : null,
      uploaded_by: user.id,
    })
    .select("id, kind, storage_path, filename, uploaded_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ document: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) {
    return NextResponse.json({ error: "no_org" }, { status: 400 });
  }
  const { error } = await admin
    .from("organization_documents")
    .delete()
    .eq("id", id)
    .eq("organization_id", member.organization_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
