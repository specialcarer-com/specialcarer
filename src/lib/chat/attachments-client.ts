/**
 * P1-B9.1: client-side helpers for chat attachment upload.
 *
 * The pipeline is: validate locally → POST upload-url → PUT to signed
 * URL → POST confirm. The mobile chat UI calls `uploadAttachment` and
 * gets back a fresh signed read URL for immediate display.
 *
 * Validation is exported so the picker sheet can refuse selections
 * before issuing a network call.
 */

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PER_MESSAGE = 5;
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export type AttachmentRecord = {
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

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: "mime" | "size" | "count" };

export function validateSelection(
  file: { mime_type: string; size_bytes: number },
  existingCount: number,
): ValidateResult {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.mime_type)) {
    return { ok: false, reason: "mime" };
  }
  if (file.size_bytes <= 0 || file.size_bytes > MAX_BYTES) {
    return { ok: false, reason: "size" };
  }
  if (existingCount >= MAX_PER_MESSAGE) {
    return { ok: false, reason: "count" };
  }
  return { ok: true };
}

/** Pretty-print a byte size for the PDF tile label. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export type UploadProgress = { loaded: number; total: number };

export type UploadAttachmentOpts = {
  message_id: string;
  file: Blob;
  filename: string;
  mime_type: AllowedMime;
  size_bytes: number;
  width?: number;
  height?: number;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
};

export type UploadAttachmentResult = {
  attachment: AttachmentRecord;
  signed_url: string | null;
};

/**
 * Three-step upload. Returns the persisted row + signed read URL.
 * Caller is responsible for catching/handling errors (toast/etc).
 */
export async function uploadAttachment(
  opts: UploadAttachmentOpts,
): Promise<UploadAttachmentResult> {
  const f = opts.fetchImpl ?? fetch;

  // 1) ask for a signed upload URL
  const uploadUrlRes = await f(
    `/api/m/chat/messages/${opts.message_id}/attachments/upload-url`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: opts.filename,
        mime_type: opts.mime_type,
        size_bytes: opts.size_bytes,
      }),
      signal: opts.signal,
    },
  );
  if (!uploadUrlRes.ok) {
    throw new Error(`upload-url failed: ${uploadUrlRes.status}`);
  }
  const { upload_url, storage_path } = (await uploadUrlRes.json()) as {
    upload_url: string;
    storage_path: string;
  };

  // 2) PUT the file to the signed URL. Use XHR so we get progress.
  await putBlobWithProgress({
    url: upload_url,
    blob: opts.file,
    mime: opts.mime_type,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });

  // 3) confirm the metadata row
  const confirmRes = await f(
    `/api/m/chat/messages/${opts.message_id}/attachments/confirm`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storage_path,
        filename: opts.filename,
        mime_type: opts.mime_type,
        size_bytes: opts.size_bytes,
        width: opts.width,
        height: opts.height,
      }),
      signal: opts.signal,
    },
  );
  if (!confirmRes.ok) {
    throw new Error(`confirm failed: ${confirmRes.status}`);
  }
  return (await confirmRes.json()) as UploadAttachmentResult;
}

function putBlobWithProgress(opts: {
  url: string;
  blob: Blob;
  mime: string;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", opts.url);
    xhr.setRequestHeader("content-type", opts.mime);
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          opts.onProgress?.({ loaded: e.loaded, total: e.total });
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload PUT failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload PUT network error"));
    xhr.onabort = () => reject(new Error("upload aborted"));
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(opts.blob);
  });
}

/**
 * Per-row preview prefix for the chat list page. Returns the emoji
 * tag if the message has any attachments, plus a separator, otherwise
 * null. The list page renders `${prefix ?? ""}${body}`.
 */
export function attachmentPreviewPrefix(
  attachments:
    | { mime_type: string }[]
    | { has_image?: boolean; has_pdf?: boolean }
    | null
    | undefined,
): string | null {
  if (!attachments) return null;
  let hasImage = false;
  let hasPdf = false;
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a.mime_type?.startsWith("image/")) hasImage = true;
      else if (a.mime_type === "application/pdf") hasPdf = true;
    }
  } else {
    hasImage = !!attachments.has_image;
    hasPdf = !!attachments.has_pdf;
  }
  if (hasImage) return "\u{1F5BC}️ Image · "; // 🖼️ Image ·
  if (hasPdf) return "\u{1F4CE} PDF · "; // 📎 PDF ·
  return null;
}
