/**
 * P1-B9.4: pure handler for POST /api/admin/chat/threads/[id]/unarchive.
 *
 * Admin-only action that clears `archived_at`, `archived_reason`, and
 * `archived_by` on a chat_threads row. The route boundary guards admin
 * auth; this handler just shapes the update + response.
 */
import { NextResponse } from "next/server";
import type { PinnedThreadRow } from "./pin-handler";

export type UnarchiveClient = {
  unarchiveThread(threadId: string): Promise<{
    data: PinnedThreadRow | null;
    error: { message: string } | null;
  }>;
};

export async function handleUnarchiveThread(input: {
  thread_id: string;
  client: UnarchiveClient;
}): Promise<NextResponse<{ thread: PinnedThreadRow } | { error: string }>> {
  const { thread_id, client } = input;
  const { data, error } = await client.unarchiveThread(thread_id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "chat_unarchive_failed" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }
  return NextResponse.json({ thread: data });
}
