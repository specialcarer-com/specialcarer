/**
 * P1-B9.4: pure handler for PATCH /api/m/chat/threads/[id]/pin.
 *
 * Toggles the `pinned` flag on a chat_threads row. Only thread
 * participants may call (route-level guard via isThreadParticipant) —
 * RLS on the table is the second line of defence.
 */
import { NextResponse } from "next/server";

export type PinnedThreadRow = {
  id: string;
  booking_id: string;
  pinned: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  archived_by: string | null;
  created_at: string;
};

export type PinClient = {
  updatePinned(
    threadId: string,
    pinned: boolean,
  ): Promise<{
    data: PinnedThreadRow | null;
    error: { message: string } | null;
  }>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handlePinThread(input: {
  thread_id: string;
  body: unknown;
  client: PinClient;
}): Promise<NextResponse<{ thread: PinnedThreadRow } | { error: string }>> {
  const { thread_id, body, client } = input;
  if (!isPlainObject(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  if (typeof body.pinned !== "boolean") {
    return NextResponse.json(
      { error: "Field `pinned` must be a boolean" },
      { status: 400 },
    );
  }

  const { data, error } = await client.updatePinned(thread_id, body.pinned);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "chat_pin_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ thread: data });
}
