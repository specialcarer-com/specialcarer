/**
 * POST /api/candour/[id]/attachment — upload an attachment for a
 * notifiable-event case (Phase C — PR C3b).
 *
 * Admin-only. Accepts multipart form-data with a single `file` field.
 * Validates size (≤ 10 MB) and MIME type (pdf | jpeg | png | docx | txt).
 * Uploads to Supabase Storage bucket `notifiable-events` under the path
 * `{event_id}/{ISO_timestamp}_{sanitized_filename}`. On success calls
 * `addAttachment` to append an audit-trail row with the storage path.
 *
 * The bucket + RLS policies are defined in
 * `supabase/migrations/20260912180000_notifiable_events_storage.sql`.
 * If the bucket / migration is not yet applied, the storage-upload
 * error surfaces as an ordinary 400 — the addAttachment call would not
 * be reached — matching the deploy-safety story for the schema.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addAttachment } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export type StorageUploader = {
  upload(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts: { contentType: string; upsert?: boolean },
  ): Promise<{ error: { message: string } | null }>;
};

export type AttachmentHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  /** Storage-shaped fake for tests. Bucket-scoped. */
  storage: StorageUploader;
  now?: () => Date;
  caseDeps?: Partial<CaseDeps>;
};

/**
 * Sanitize a filename: strip path separators, control chars, and any
 * character that isn't alphanumeric / dot / dash / underscore. Truncate
 * to 100 chars. Empty result becomes `file`.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const clean = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const trimmed = clean.slice(0, 100);
  return trimmed || "file";
}

export type AttachmentInput = {
  filename: string;
  contentType: string;
  size: number;
  bytes: ArrayBuffer;
};

export async function handleAttachment(
  event_id: string,
  input: AttachmentInput | null,
  deps: AttachmentHandlerDeps,
): Promise<NextResponse> {
  const actor = await deps.getActor();
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  // TODO(rm-ni-split): allow role='rm' once introduced.
  if (actor.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }
  if (!input) {
    return NextResponse.json(
      { ok: false, error: "missing_file" },
      { status: 400 },
    );
  }
  if (input.size <= 0 || input.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "file_too_large" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.includes(input.contentType)) {
    return NextResponse.json(
      { ok: false, error: "unsupported_mime" },
      { status: 400 },
    );
  }
  const now = (deps.now ?? (() => new Date()))();
  const iso = now.toISOString().replace(/[:.]/g, "-");
  const safeName = sanitizeFilename(input.filename);
  const path = `${event_id}/${iso}_${safeName}`;
  const uploadRes = await deps.storage.upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (uploadRes.error) {
    return NextResponse.json(
      { ok: false, error: "upload_failed", detail: uploadRes.error.message },
      { status: 400 },
    );
  }

  const result = await addAttachment(event_id, actor.id, path, safeName, {
    db: deps.db,
    ...(deps.caseDeps ?? {}),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }
  if ("skippedReason" in result) {
    return NextResponse.json(
      { ok: true, skippedReason: result.skippedReason, path },
      { status: 202 },
    );
  }
  return NextResponse.json({ ok: true, path }, { status: 201 });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let input: AttachmentInput | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      input = {
        filename: f.name || "file",
        contentType: f.type || "application/octet-stream",
        size: f.size,
        bytes: await f.arrayBuffer(),
      };
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_form" },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  return handleAttachment(id, input, {
    getActor: async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return { id: user.id, role: (profile?.role as string | null) ?? null };
    },
    db: admin as unknown as CaseAdminClient,
    storage: admin.storage.from("notifiable-events") as unknown as StorageUploader,
  });
}
