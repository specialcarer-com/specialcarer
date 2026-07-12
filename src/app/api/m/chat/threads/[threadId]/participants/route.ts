/**
 * P1-B11: family-group participants endpoints.
 *
 * POST   /api/m/chat/threads/[threadId]/participants
 *   Body: { email, role: 'family' }
 *   Auth: seeker on this thread (or admin).
 *
 * GET    /api/m/chat/threads/[threadId]/participants
 *   Auth: any active participant.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderFamilyInviteEmail } from "@/lib/email/templates";
import {
  handleInviteFamily,
  handleListParticipants,
  type ParticipantsClient,
  type ParticipantRow,
} from "@/lib/chat/participants-handler";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://specialcarers.com"
  );
}

function buildClient(admin: AdminClient): ParticipantsClient {
  return {
    async listParticipants(threadId) {
      // Two-step (participants → profiles) because Supabase implicit
      // joins through auth.users.profiles aren't safely exposed and
      // the admin client only reads `public.*` tables anyway.
      const parts = await admin
        .from("chat_participants")
        .select("user_id, role, added_at")
        .eq("thread_id", threadId)
        .is("removed_at", null);
      if (parts.error) {
        return { data: null, error: parts.error };
      }
      const rows = (parts.data ?? []) as {
        user_id: string;
        role: ParticipantRow["role"];
        added_at: string;
      }[];
      if (rows.length === 0) {
        return { data: [], error: null };
      }
      const profs = await admin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in(
          "id",
          rows.map((r) => r.user_id),
        );
      const byId = new Map<
        string,
        { full_name: string | null; avatar_url: string | null }
      >();
      for (const p of (profs.data ?? []) as {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]) {
        byId.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
      }
      const out: ParticipantRow[] = rows.map((r) => {
        const prof = byId.get(r.user_id);
        return {
          user_id: r.user_id,
          role: r.role,
          added_at: r.added_at,
          display_name: prof?.full_name ?? null,
          avatar_url: prof?.avatar_url ?? null,
        };
      });
      return { data: out, error: null };
    },
    async createInvite(args) {
      const { data, error } = await admin
        .from("chat_family_invites")
        .insert({
          thread_id: args.thread_id,
          invited_email: args.invited_email,
          invited_by: args.invited_by,
          token: args.token,
        })
        .select(
          "id, thread_id, invited_email, invited_by, token, expires_at, accepted_at",
        )
        .single();
      return { data, error };
    },
    async sendInviteEmail(args) {
      const { subject, html, text } = renderFamilyInviteEmail({
        inviterName: args.inviter_name,
        acceptUrl: args.accept_url,
        expiresAt: args.expires_at,
      });
      const res = await sendEmail({
        to: args.invited_email,
        subject,
        html,
        text,
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: res.error };
    },
    async getInviterName(userId) {
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      const row = data as { full_name: string | null } | null;
      return row?.full_name ?? null;
    },
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

/**
 * Active role of `userId` on `threadId`, or null if not an active
 * participant. Shared by POST and DELETE for the seeker-only check.
 */
async function getActiveRoleFor(
  admin: AdminClient,
  threadId: string,
  userId: string,
): Promise<"seeker" | "carer" | "family" | "admin" | null> {
  const { data } = await admin
    .from("chat_participants")
    .select("role")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  const row = data as { role: "seeker" | "carer" | "family" | "admin" } | null;
  return row?.role ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const role = await getActiveRoleFor(admin, threadId, user.id);
  if (role !== "seeker" && role !== "admin") {
    return NextResponse.json(
      { error: "Only the seeker can invite family members" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  return handleInviteFamily({
    thread_id: threadId,
    body,
    inviter_id: user.id,
    site_url: getSiteUrl(),
    client: buildClient(admin),
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const role = await getActiveRoleFor(admin, threadId, user.id);
  if (role === null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return handleListParticipants({
    thread_id: threadId,
    client: buildClient(admin),
  });
}
