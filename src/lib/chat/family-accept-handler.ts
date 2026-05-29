/**
 * P1-B11: pure handler for the family-invite accept flow.
 *
 * `POST /api/family/accept` consumes a token from the invite email:
 *   - 410 if the token is unknown, expired, or already accepted
 *   - 401 if the caller is not signed in (frontend then redirects to
 *     magic-link sign-in with the token preserved)
 *   - 200 on success: upserts a family `chat_participants` row,
 *     stamps the invite as accepted, and posts a system message into
 *     the thread announcing the new member.
 */
import { NextResponse } from "next/server";

export type AcceptInviteRow = {
  id: string;
  thread_id: string;
  invited_email: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
};

export type AcceptClient = {
  findInviteByToken(
    token: string,
  ): Promise<{
    data: AcceptInviteRow | null;
    error: { message: string } | null;
  }>;
  upsertFamilyParticipant(args: {
    thread_id: string;
    user_id: string;
    added_by: string;
  }): Promise<{ ok: boolean; error?: string }>;
  markInviteAccepted(args: {
    invite_id: string;
    user_id: string;
  }): Promise<{ ok: boolean; error?: string }>;
  insertSystemMessage(args: {
    thread_id: string;
    body: string;
    sender_id: string;
  }): Promise<{ ok: boolean; error?: string }>;
  getDisplayName(user_id: string): Promise<string | null>;
  /** seeker_id is used as the sender_id for system messages (NOT NULL FK). */
  getThreadSeekerId(thread_id: string): Promise<string | null>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleAcceptInvite(input: {
  body: unknown;
  user_id: string | null;
  client: AcceptClient;
  now?: Date;
}): Promise<
  NextResponse<
    | {
        ok: true;
        thread_id: string;
      }
    | { error: string; needs_signin?: boolean }
  >
> {
  const { body, user_id, client, now = new Date() } = input;
  if (!isPlainObject(body) || typeof body.token !== "string") {
    return NextResponse.json(
      { error: "Body must contain a string `token`" },
      { status: 400 },
    );
  }
  const token = body.token.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400 },
    );
  }

  const { data: invite, error } = await client.findInviteByToken(token);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "chat_invite_lookup_failed" },
      { status: 500 },
    );
  }
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 410 });
  }
  if (invite.accepted_at) {
    return NextResponse.json(
      { error: "Invite already accepted" },
      { status: 410 },
    );
  }
  if (new Date(invite.expires_at).getTime() < now.getTime()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  if (!user_id) {
    return NextResponse.json(
      { error: "Sign in to accept this invite", needs_signin: true },
      { status: 401 },
    );
  }

  const upsert = await client.upsertFamilyParticipant({
    thread_id: invite.thread_id,
    user_id,
    added_by: invite.invited_by,
  });
  if (!upsert.ok) {
    return NextResponse.json(
      { error: upsert.error ?? "chat_participant_insert_failed" },
      { status: 500 },
    );
  }

  const mark = await client.markInviteAccepted({
    invite_id: invite.id,
    user_id,
  });
  if (!mark.ok) {
    return NextResponse.json(
      { error: mark.error ?? "chat_invite_mark_failed" },
      { status: 500 },
    );
  }

  // Best-effort system message. Failure to post the announcement should
  // NOT roll the participant insert back — the join already happened
  // and the user can be told. We log and continue.
  const displayName =
    (await client.getDisplayName(user_id)) ?? "A family member";
  const seekerId = await client.getThreadSeekerId(invite.thread_id);
  if (seekerId) {
    const sysOut = await client.insertSystemMessage({
      thread_id: invite.thread_id,
      sender_id: seekerId,
      body: `${displayName} (family) was added by the seeker and can see all messages.`,
    });
    if (!sysOut.ok) {
      console.error(
        "[family.accept] system message insert failed:",
        sysOut.error,
      );
    }
  }

  return NextResponse.json({ ok: true, thread_id: invite.thread_id });
}
