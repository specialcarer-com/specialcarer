/**
 * P1-B10: pure handlers for the admin moderation queue endpoints.
 *
 * Two endpoints, two handlers:
 *   - handleListFlags  → GET  /api/admin/chat/flags
 *   - handleUpdateFlag → PATCH /api/admin/chat/flags/[flagId]
 *
 * Both are auth-gated at the route boundary via requireAdminApi(). The
 * handlers themselves drive an injectable QueueClient so we can unit-
 * test status/transition logic without a Supabase round-trip.
 */
import { NextResponse } from "next/server";

export const FLAG_STATUSES = [
  "open",
  "resolved_no_action",
  "resolved_warn",
  "resolved_ban",
  "resolved_safeguarding",
] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export const FLAG_REASONS = [
  "off_platform_contact",
  "off_platform_payment",
  "harassment",
  "spam",
  "safeguarding",
  "other",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const FLAG_ACTIONS = [
  "warn_sender",
  "ban_sender",
  "mute_sender_24h",
  "mark_safeguarding",
] as const;
export type FlagAction = (typeof FLAG_ACTIONS)[number];

export type FlagRow = {
  id: string;
  message_id: string;
  thread_id: string;
  flagged_by: string | null;
  reason: FlagReason;
  auto_detected: boolean;
  detected_pattern: string | null;
  status: FlagStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  admin_notes: string | null;
  created_at: string;
};

/** Joined queue row — flag + a sliver of message + thread context. */
export type QueueItem = FlagRow & {
  message?: {
    id: string;
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
};

export type QueueClient = {
  /**
   * Paginated list. `pageSize` is already validated by the handler. Returns
   * the joined items (flag + message). Sender / reporter profile lookup is
   * left to the route layer because it's a separate table.
   */
  listFlags(input: {
    status: FlagStatus | "all";
    page: number;
    pageSize: number;
  }): Promise<{
    data: QueueItem[];
    error: { message: string } | null;
  }>;
  /**
   * Fetch a single flag (to discover the sender / thread context the
   * PATCH action needs).
   */
  getFlag(id: string): Promise<{
    data: (FlagRow & { sender_id: string }) | null;
    error: { message: string } | null;
  }>;
  /** Apply one of the FLAG_ACTIONS atomically. */
  applyAction(input: {
    flag_id: string;
    sender_id: string;
    thread_id: string;
    action: FlagAction;
    admin_id: string;
  }): Promise<{ error: { message: string } | null }>;
  /** Update the flag row itself (status, admin_notes, resolved_by/at). */
  updateFlag(input: {
    flag_id: string;
    status: FlagStatus;
    admin_notes: string | null;
    admin_id: string;
  }): Promise<{
    data: FlagRow | null;
    error: { message: string } | null;
  }>;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseListParams(url: URL): {
  status: FlagStatus | "all";
  page: number;
  pageSize: number;
} {
  const rawStatus = url.searchParams.get("status");
  let status: FlagStatus | "all" = "open";
  if (rawStatus === "all") {
    status = "all";
  } else if (
    rawStatus &&
    (FLAG_STATUSES as readonly string[]).includes(rawStatus)
  ) {
    status = rawStatus as FlagStatus;
  }
  const rawPage = Number(url.searchParams.get("page"));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const rawPageSize = Number(url.searchParams.get("pageSize"));
  let pageSize = DEFAULT_PAGE_SIZE;
  if (Number.isFinite(rawPageSize) && rawPageSize >= 1) {
    pageSize = Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE);
  }
  return { status, page, pageSize };
}

export async function handleListFlags(input: {
  url: URL;
  client: QueueClient;
}): Promise<
  NextResponse<
    | { items: QueueItem[]; page: number; pageSize: number }
    | { error: string }
  >
> {
  const params = parseListParams(input.url);
  const { data, error } = await input.client.listFlags(params);
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    items: data,
    page: params.page,
    pageSize: params.pageSize,
  });
}

export type UpdateFlagBody = {
  status?: FlagStatus;
  admin_notes?: string | null;
  action?: FlagAction;
};

/**
 * Validate + dispatch a moderation action. The handler:
 *   1. Validates the body shape (status / action allow-lists, notes type).
 *   2. Loads the flag to discover the sender and thread context.
 *   3. Applies the chosen enforcement action (if any) via the client.
 *   4. Updates the flag row with the new status + admin_notes.
 *
 * Step ordering matters: we apply the participant-level action FIRST
 * (so the row is locked-in even if the flag update later fails) and
 * the flag-row update LAST (so the queue removes the item once
 * everything else has landed).
 */
export async function handleUpdateFlag(input: {
  flag_id: string;
  admin_id: string;
  body: unknown;
  client: QueueClient;
}): Promise<NextResponse<{ flag: FlagRow } | { error: string }>> {
  const { flag_id, admin_id, body, client } = input;
  if (!isPlainObject(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const status = body.status;
  if (
    typeof status !== "string" ||
    !(FLAG_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json(
      { error: "Field `status` is required and must be a valid value" },
      { status: 400 },
    );
  }
  let notes: string | null = null;
  if (body.admin_notes !== undefined && body.admin_notes !== null) {
    if (typeof body.admin_notes !== "string") {
      return NextResponse.json(
        { error: "Field `admin_notes` must be a string or null" },
        { status: 400 },
      );
    }
    notes = body.admin_notes;
  }
  let action: FlagAction | null = null;
  if (body.action !== undefined && body.action !== null) {
    if (
      typeof body.action !== "string" ||
      !(FLAG_ACTIONS as readonly string[]).includes(body.action)
    ) {
      return NextResponse.json(
        { error: "Field `action` must be a valid action value" },
        { status: 400 },
      );
    }
    action = body.action as FlagAction;
  }

  // Resolve the flag so we know which participant to apply the action to.
  const flag = await client.getFlag(flag_id);
  if (flag.error || !flag.data) {
    return NextResponse.json(
      { error: flag.error?.message ?? "Not found" },
      { status: 404 },
    );
  }

  if (action) {
    const applied = await client.applyAction({
      flag_id,
      sender_id: flag.data.sender_id,
      thread_id: flag.data.thread_id,
      action,
      admin_id,
    });
    if (applied.error) {
      return NextResponse.json(
        { error: applied.error.message },
        { status: 500 },
      );
    }
  }

  const updated = await client.updateFlag({
    flag_id,
    status: status as FlagStatus,
    admin_notes: notes,
    admin_id,
  });
  if (updated.error || !updated.data) {
    return NextResponse.json(
      { error: updated.error?.message ?? "chat_flag_update_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ flag: updated.data });
}
