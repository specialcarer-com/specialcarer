import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CERT_TYPES, MAX_CERTIFICATIONS } from "@/lib/vetting/types";

export const dynamic = "force-dynamic";

const CERT_TYPE_KEYS = new Set<string>(CERT_TYPES.map((c) => c.key));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("carer_certifications")
    .select(
      "id, cert_type, issuer, issued_at, expires_at, file_path, status, rejection_reason, created_at",
    )
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ certifications: data ?? [] });
}

type CreateBody = {
  cert_type?: string;
  issuer?: string;
  issued_at?: string;
  expires_at?: string;
  file_path?: string;
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
  const cert_type = String(body.cert_type ?? "").trim();
  if (!CERT_TYPE_KEYS.has(cert_type)) {
    return NextResponse.json({ error: "invalid_cert_type" }, { status: 400 });
  }
  const issuer =
    typeof body.issuer === "string" && body.issuer.trim()
      ? body.issuer.trim().slice(0, 120)
      : null;
  const issued_at =
    typeof body.issued_at === "string" && ISO_DATE.test(body.issued_at)
      ? body.issued_at
      : null;
  const expires_at =
    typeof body.expires_at === "string" && ISO_DATE.test(body.expires_at)
      ? body.expires_at
      : null;
  const file_path =
    typeof body.file_path === "string" && body.file_path.trim()
      ? body.file_path.trim()
      : null;

  if (file_path && !file_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const { count } = await supabase
    .from("carer_certifications")
    .select("id", { count: "exact", head: true })
    .eq("carer_id", user.id);
  if ((count ?? 0) >= MAX_CERTIFICATIONS) {
    return NextResponse.json(
      { error: `Limit ${MAX_CERTIFICATIONS} certifications` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("carer_certifications")
    .insert({
      carer_id: user.id,
      cert_type,
      issuer,
      issued_at,
      expires_at,
      file_path,
    })
    .select(
      "id, cert_type, issuer, issued_at, expires_at, file_path, status, created_at",
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ certification: data });
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
  const { error } = await supabase
    .from("carer_certifications")
    .delete()
    .eq("id", id)
    .eq("carer_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
