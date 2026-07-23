/**
 * P1-B11: pure handlers for family-group participant management.
 *
 * Three operations live behind `/api/m/chat/threads/[id]/participants`:
 *   - POST   → seeker invites a family member by email
 *   - GET    → any active participant lists current members
 *   - DELETE → seeker removes a family member (soft delete)
 *
 * Authorization (seeker / participant / admin) is enforced at the route
 * boundary; the handlers below just validate input and call the
 * injected client so node:test can drive them without a live DB.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export type ParticipantRole = "seeker" | "carer" | "family" | "admin";

export type ParticipantRow = {
  user_id: string;
  role: ParticipantRole;
  added_at: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type FamilyInviteRow = {
  id: string;
  thread_id: string;
  invited_email: string;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
};

export type ParticipantsClient = {
  listParticipants(
    threadId: string,
  ): Promise<{
    data: ParticipantRow[] | null;
    error: { message: string } | null;
  }>;
  createInvite(args: {
    thread_id: string;
    invited_email: string;
    invited_by: string;
    token: string;
  }): Promise<{
    data: FamilyInviteRow | null;
    error: { message: string } | null;
  }>;
  /**
   * Sends the invite email. Errors are surfaced so the route can decide
   * whether to fail the request — tests can stub a no-op and capture
   * the call args via `captured`.
   */
  sendInviteEmail(args: {
    invited_email: string;
    inviter_name: string;
    accept_url: string;
    expires_at: string;
  }): Promise<{ ok: boolean; error?: string }>;
  getInviterName(userId: string): Promise<string | null>;
  /**
   * Returns the role of `userId` on the given thread, or null if the
   * user is not an active participant. Active = removed_at is null.
   */
  getActiveRole(args: {
    thread_id: string;
    user_id: string;
  }): Promise<{ role: ParticipantRole | null }>;
  softRemoveParticipant(args: {
    thread_id: string;
    user_id: string;
  }): Promise<{ ok: boolean; error?: string }>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function buildAcceptUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/family/accept?token=${encodeURIComponent(token)}`;
}

/* ----------------------------------------------------------------- */
/* POST — invite a family member                                      */
/* ----------------------------------------------------------------- */
export async function handleInviteFamily(input: {
  thread_id: string;
  body: unknown;
  inviter_id: string;
  site_url: string;
  client: ParticipantsClient;
  tokenFactory?: () => string;
}): Promise<
  NextResponse<
    | {
        invite_id: string;
        invited_email: string;
        expires_at: string;
      }
    | { error: string }
  >
> {
  const { thread_id, body, inviter_id, site_url, client, tokenFactory } = input;
  if (!isPlainObject(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const emailRaw = body.email;
  const role = body.role;
  if (typeof emailRaw !== "string" || !EMAIL_RE.test(emailRaw.trim())) {
    return NextResponse.json(
      { error: "Field `email` must be a valid email address" },
      { status: 400 },
    );
  }
  if (role !== "family") {
    return NextResponse.json(
      { error: "Only role=family is supported for invites" },
      { status: 400 },
    );
  }
  const email = emailRaw.trim().toLowerCase();
  const token = (tokenFactory ?? generateInviteToken)();

  const created = await client.createInvite({
    thread_id,
    invited_email: email,
    invited_by: inviter_id,
    token,
  });
  if (created.error || !created.data) {
    return NextResponse.json(
      { error: created.error?.message ?? "chat_invite_failed" },
      { status: 500 },
    );
  }

  const inviterName =
    (await client.getInviterName(inviter_id)) ?? "A SpecialCarer member";
  const acceptUrl = buildAcceptUrl(site_url, token);
  const send = await client.sendInviteEmail({
    invited_email: email,
    inviter_name: inviterName,
    accept_url: acceptUrl,
    expires_at: created.data.expires_at,
  });
  if (!send.ok) {
    // Email failed but the invite row exists — surface a 502 so the
    // seeker can retry. The invite row is still usable if they have
    // the link via another channel, but we shouldn't claim success.
    return NextResponse.json(
      { error: send.error ?? "chat_invite_email_failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({
    invite_id: created.data.id,
    invited_email: email,
    expires_at: created.data.expires_at,
  });
}

/* ----------------------------------------------------------------- */
/* GET — list current participants                                    */
/* ----------------------------------------------------------------- */
export async function handleListParticipants(input: {
  thread_id: string;
  client: ParticipantsClient;
}): Promise<
  NextResponse<{ participants: ParticipantRow[] } | { error: string }>
> {
  const { thread_id, client } = input;
  const { data, error } = await client.listParticipants(thread_id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "chat_participants_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ participants: data ?? [] });
}

/* ----------------------------------------------------------------- */
/* DELETE — remove a family member (soft delete)                      */
/* ----------------------------------------------------------------- */
export async function handleRemoveParticipant(input: {
  thread_id: string;
  user_id: string;
  client: ParticipantsClient;
}): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const { thread_id, user_id, client } = input;
  const { role } = await client.getActiveRole({ thread_id, user_id });
  if (role === null) {
    return NextResponse.json(
      { error: "User is not an active participant of this thread" },
      { status: 404 },
    );
  }
  if (role === "seeker" || role === "carer") {
    return NextResponse.json(
      { error: "Cannot remove the seeker or carer from a thread" },
      { status: 400 },
    );
  }
  const out = await client.softRemoveParticipant({ thread_id, user_id });
  if (!out.ok) {
    return NextResponse.json(
      { error: out.error ?? "chat_participant_remove_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
