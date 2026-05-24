/**
 * Pure handler for POST /api/m/chat/[thread_id]/send.
 *
 * Split from the route so unit tests can drive the validation without
 * loading `next/server`. Mirrors the register-handler.ts pattern from
 * PR-A1 but returns a plain { ok, ...} shape instead of a NextResponse,
 * which keeps the test harness (node --test under tsx) lean.
 */
import type { SendMessageInput, AttachmentKind } from "./types";

const ATTACHMENT_KINDS: ReadonlyArray<AttachmentKind> = [
  "image",
  "video",
  "audio",
];

export type SendBody = {
  body?: unknown;
  attachment_path?: unknown;
  attachment_kind?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isOptionalString(v: unknown): v is string | undefined | null {
  return v == null || typeof v === "string";
}
function isAttachmentKind(v: unknown): v is AttachmentKind {
  return (
    typeof v === "string" &&
    (ATTACHMENT_KINDS as readonly string[]).includes(v)
  );
}

export type ValidatedSend =
  | { ok: true; input: SendMessageInput }
  | { ok: false; status: 400; error: string };

export function validateSendBody(body: SendBody): ValidatedSend {
  const bodyText = isOptionalString(body.body)
    ? body.body ?? null
    : undefined;
  if (bodyText === undefined) {
    return { ok: false, status: 400, error: "body must be a string" };
  }
  const attachment_path = isOptionalString(body.attachment_path)
    ? body.attachment_path ?? null
    : undefined;
  if (attachment_path === undefined) {
    return {
      ok: false,
      status: 400,
      error: "attachment_path must be a string",
    };
  }

  let attachment_kind: AttachmentKind | null = null;
  if (body.attachment_kind != null) {
    if (!isAttachmentKind(body.attachment_kind)) {
      return {
        ok: false,
        status: 400,
        error: "attachment_kind must be one of image, video, audio",
      };
    }
    attachment_kind = body.attachment_kind;
  }

  const trimmed = bodyText ? bodyText.trim() : "";
  const hasBody = isNonEmptyString(trimmed);
  const hasAttachment = isNonEmptyString(attachment_path);
  if (!hasBody && !hasAttachment) {
    return {
      ok: false,
      status: 400,
      error: "message requires body or attachment_path",
    };
  }
  if (hasAttachment && !attachment_kind) {
    return {
      ok: false,
      status: 400,
      error: "attachment_kind is required when attachment_path is set",
    };
  }

  return {
    ok: true,
    input: {
      body: hasBody ? trimmed : null,
      attachment_path: hasAttachment ? attachment_path : null,
      attachment_kind,
    },
  };
}
