/**
 * P1-B9.1: pure handlers for chat attachment endpoints.
 *
 * Auth + participation are guarded at the route boundary. These
 * handlers cover validation (mime / size / count), storage path
 * computation, and DB wiring through an injectable client so the
 * route tests can drive happy-path / error-path branches without
 * standing up a real Supabase instance.
 *
 * TODO(virus-scan): Supabase Storage doesn't expose a pre-upload
 * hook, so AV scanning is deferred. When ClamAV-as-a-service or
 * similar is wired up, hook it into `handleConfirmAttachment` before
 * the metadata row is inserted.
 */
import { NextResponse } from "next/server";

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PER_MESSAGE = 5;
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME)[number];

export function isAllowedMime(m: unknown): m is AllowedMime {
  return typeof m === "string" && (ALLOWED_MIME as readonly string[]).includes(m);
}

export function extFromMime(m: AllowedMime): string {
  switch (m) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// upload-url
// ---------------------------------------------------------------------------

export type AttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  filename: string;
  created_at: string;
};

export type UploadUrlClient = {
  /** Returns the thread + sender for the message, or null if not found. */
  getMessageMeta(
    messageId: string,
  ): Promise<{ thread_id: string; sender_id: string } | null>;
  /** Counts existing attachment rows for the message. */
  countAttachments(messageId: string): Promise<number>;
  /** Creates a signed upload URL good for ~10 minutes. */
  createSignedUploadUrl(
    bucket: string,
    path: string,
  ): Promise<{
    data: { signedUrl: string; token?: string } | null;
    error: { message: string } | null;
  }>;
  /** Generates a path-safe UUID for the storage object name. */
  randomUUID(): string;
  /** Current time, injectable for deterministic tests. */
  now(): Date;
};

export async function handleUploadUrl(input: {
  message_id: string;
  user_id: string;
  body: unknown;
  client: UploadUrlClient;
}): Promise<NextResponse> {
  const { message_id, user_id, body, client } = input;

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "Body must be JSON object" }, { status: 400 });
  }
  const filename = body.filename;
  const mime = body.mime_type;
  const size = body.size_bytes;
  if (typeof filename !== "string" || filename.trim().length === 0) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  if (!isAllowedMime(mime)) {
    return NextResponse.json({ error: "Unsupported media type" }, { status: 415 });
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "size_bytes must be positive" }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const meta = await client.getMessageMeta(message_id);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (meta.sender_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const count = await client.countAttachments(message_id);
  if (count >= MAX_PER_MESSAGE) {
    return NextResponse.json(
      { error: "Too many attachments (max 5)" },
      { status: 429 },
    );
  }

  const ext = extFromMime(mime);
  const path = `${meta.thread_id}/${message_id}/${client.randomUUID()}.${ext}`;
  const signed = await client.createSignedUploadUrl("chat-attachments", path);
  if (signed.error || !signed.data) {
    return NextResponse.json(
      { error: signed.error?.message ?? "signed_url_failed" },
      { status: 500 },
    );
  }

  const expires_at = new Date(client.now().getTime() + 10 * 60 * 1000).toISOString();
  return NextResponse.json({
    upload_url: signed.data.signedUrl,
    token: signed.data.token ?? null,
    storage_path: path,
    expires_at,
  });
}

// ---------------------------------------------------------------------------
// confirm
// ---------------------------------------------------------------------------

export type ConfirmClient = {
  getMessageMeta(
    messageId: string,
  ): Promise<{ thread_id: string; sender_id: string } | null>;
  /** True if a file exists at the given path inside the bucket. */
  fileExists(bucket: string, path: string): Promise<boolean>;
  insertAttachment(row: {
    message_id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    filename: string;
  }): Promise<{ data: AttachmentRow | null; error: { message: string } | null }>;
  createSignedReadUrl(
    bucket: string,
    path: string,
    ttlSeconds: number,
  ): Promise<{
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  }>;
};

export async function handleConfirm(input: {
  message_id: string;
  user_id: string;
  body: unknown;
  client: ConfirmClient;
}): Promise<NextResponse> {
  const { message_id, user_id, body, client } = input;

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "Body must be JSON object" }, { status: 400 });
  }
  const { storage_path, filename, mime_type, size_bytes, width, height } = body;
  if (typeof storage_path !== "string" || storage_path.length === 0) {
    return NextResponse.json({ error: "storage_path required" }, { status: 400 });
  }
  if (typeof filename !== "string" || filename.trim().length === 0) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  if (!isAllowedMime(mime_type)) {
    return NextResponse.json({ error: "Unsupported media type" }, { status: 415 });
  }
  if (
    typeof size_bytes !== "number" ||
    !Number.isFinite(size_bytes) ||
    size_bytes <= 0 ||
    size_bytes > MAX_BYTES
  ) {
    return NextResponse.json({ error: "size_bytes invalid" }, { status: 400 });
  }
  const widthVal =
    typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  const heightVal =
    typeof height === "number" && Number.isFinite(height) && height > 0
      ? height
      : null;

  const meta = await client.getMessageMeta(message_id);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (meta.sender_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Defence-in-depth: the storage path must live under this thread.
  if (!storage_path.startsWith(`${meta.thread_id}/${message_id}/`)) {
    return NextResponse.json({ error: "storage_path mismatch" }, { status: 400 });
  }

  const exists = await client.fileExists("chat-attachments", storage_path);
  if (!exists) {
    return NextResponse.json({ error: "File not uploaded" }, { status: 404 });
  }

  const inserted = await client.insertAttachment({
    message_id,
    storage_path,
    mime_type,
    size_bytes,
    width: widthVal,
    height: heightVal,
    filename,
  });
  if (inserted.error || !inserted.data) {
    return NextResponse.json(
      { error: inserted.error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  const signed = await client.createSignedReadUrl(
    "chat-attachments",
    storage_path,
    60 * 60,
  );
  return NextResponse.json({
    attachment: inserted.data,
    signed_url: signed.data?.signedUrl ?? null,
  });
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export type ListClient = {
  listForMessage(
    messageId: string,
  ): Promise<{ data: AttachmentRow[]; error: { message: string } | null }>;
  createSignedReadUrl(
    bucket: string,
    path: string,
    ttlSeconds: number,
  ): Promise<{
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  }>;
};

export async function handleList(input: {
  message_id: string;
  client: ListClient;
}): Promise<NextResponse> {
  const { message_id, client } = input;
  const { data, error } = await client.listForMessage(message_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const out: Array<AttachmentRow & { signed_url: string | null }> = [];
  for (const row of data) {
    const s = await client.createSignedReadUrl(
      "chat-attachments",
      row.storage_path,
      60 * 60,
    );
    out.push({ ...row, signed_url: s.data?.signedUrl ?? null });
  }
  return NextResponse.json({ attachments: out });
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

export type DeleteClient = {
  getAttachment(
    id: string,
  ): Promise<
    | {
        id: string;
        message_id: string;
        storage_path: string;
        sender_id: string;
      }
    | null
  >;
  removeStorage(
    bucket: string,
    path: string,
  ): Promise<{ error: { message: string } | null }>;
  deleteAttachment(id: string): Promise<{ error: { message: string } | null }>;
};

export async function handleDelete(input: {
  attachment_id: string;
  user_id: string;
  is_admin: boolean;
  client: DeleteClient;
}): Promise<NextResponse> {
  const { attachment_id, user_id, is_admin, client } = input;
  const row = await client.getAttachment(attachment_id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!is_admin && row.sender_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = await client.removeStorage(
    "chat-attachments",
    row.storage_path,
  );
  if (storage.error) {
    return NextResponse.json({ error: storage.error.message }, { status: 500 });
  }
  const del = await client.deleteAttachment(attachment_id);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
