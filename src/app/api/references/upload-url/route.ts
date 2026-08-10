import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);
const EXT = new Set(["pdf", "doc", "docx", "png", "jpg", "jpeg"]);

type Body = {
  token?: string;
  filename?: string;
  mime?: string;
  size?: number;
};

type ReferenceRow = {
  id: string;
  status: string;
  token_expires_at: string;
};

export function createUploadUrlHandler(
  createAdmin: typeof createAdminClient = createAdminClient
) {
  return async function POST(req: Request) {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const token = String(body.token ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const mime = String(body.mime ?? "");
    const size = Number(body.size);
    if (
      !token ||
      !filename ||
      !Number.isFinite(size) ||
      size < 1 ||
      size > 10 * 1024 * 1024 ||
      !TYPES.has(mime) ||
      !EXT.has(filename.split(".").pop()?.toLowerCase() ?? "")
    ) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    const admin = createAdmin();
    const { data: reference, error: referenceError } = await admin
      .from("carer_references")
      .select("id, status, token_expires_at")
      .eq("token", token)
      .maybeSingle<ReferenceRow>();
    if (referenceError) {
      return NextResponse.json(
        { error: referenceError.message },
        { status: 500 }
      );
    }
    if (!reference) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (
      reference.status !== "invited" ||
      new Date(reference.token_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Invalid or expired reference link" },
        { status: 403 }
      );
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${token}/${Date.now()}-${safeName}`;
    const { data, error } = await admin.storage
      .from("reference-uploads")
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not prepare upload" },
        { status: 500 }
      );
    }

    // A submit request can now only use this exact path, rather than any object
    // sharing the public reference token prefix.
    const { data: persisted, error: persistError } = await admin
      .from("carer_references")
      .update({ upload_path: path })
      .eq("id", reference.id)
      .eq("status", "invited")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (persistError) {
      return NextResponse.json(
        { error: persistError.message },
        { status: 500 }
      );
    }
    if (!persisted) {
      return NextResponse.json(
        { error: "Reference can no longer be submitted" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  };
}

export const POST = createUploadUrlHandler();
