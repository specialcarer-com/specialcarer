/**
 * P1-B11: DELETE /api/m/chat/threads/[threadId]/participants/[userId]
 *
 * Soft-removes a family member from a thread (stamps removed_at). The
 * seeker (or an admin) of the thread is the only caller authorised to
 * remove anyone, and seeker/carer rows themselves are protected at the
 * handler layer (returns 400).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleRemoveParticipant,
  type ParticipantsClient,
  type ParticipantRow,
} from "@/lib/chat/participants-handler";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

function buildClient(admin: AdminClient): ParticipantsClient {
  // Only getActiveRole + softRemoveParticipant are used by DELETE;
  // the rest are unreachable from this route. Throw if accidentally
  // exercised so a regression doesn't silently no-op.
  const notUsed = (name: string) => async () => {
    throw new Error(`participants client method ${name} not used in DELETE`);
  };
  return {
    listParticipants: notUsed("listParticipants") as never,
    createInvite: notUsed("createInvite") as never,
    sendInviteEmail: notUsed("sendInviteEmail") as never,
    getInviterName: notUsed("getInviterName") as never,
    async getActiveRole(args) {
      const { data } = await admin
        .from("chat_participants")
        .select("role")
        .eq("thread_id", args.thread_id)
        .eq("user_id", args.user_id)
        .is("removed_at", null)
        .maybeSingle();
      const row = data as { role: ParticipantRow["role"] } | null;
      return { role: row?.role ?? null };
    },
    async softRemoveParticipant(args) {
      const { error } = await admin
        .from("chat_participants")
        .update({ removed_at: new Date().toISOString() })
        .eq("thread_id", args.thread_id)
        .eq("user_id", args.user_id);
      return error
        ? { ok: false, error: error.message }
        : { ok: true };
    },
  };
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ threadId: string; userId: string }> },
) {
  const { threadId, userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Caller must be seeker or admin on the thread.
  const { data: callerRow } = await admin
    .from("chat_participants")
    .select("role")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  const callerRole = (callerRow as { role: string } | null)?.role ?? null;
  if (callerRole !== "seeker" && callerRole !== "admin") {
    return NextResponse.json(
      { error: "Only the seeker can remove family members" },
      { status: 403 },
    );
  }

  return handleRemoveParticipant({
    thread_id: threadId,
    user_id: userId,
    client: buildClient(admin),
  });
}
