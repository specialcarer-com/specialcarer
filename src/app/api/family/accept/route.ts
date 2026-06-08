/**
 * P1-B11: family invite accept endpoints.
 *
 * GET  /api/family/accept?token=... → public; validates the token and
 *      returns a small summary so the landing page can render.
 *
 * POST /api/family/accept → consumes a token. Requires authentication;
 *      if the caller is signed out we return 401 with needs_signin=true
 *      so the page can route them through magic-link sign-in carrying
 *      the token in the redirect URL.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleAcceptInvite,
  type AcceptClient,
  type AcceptInviteRow,
} from "@/lib/chat/family-accept-handler";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

function buildClient(admin: AdminClient): AcceptClient {
  return {
    async findInviteByToken(token) {
      const { data, error } = await admin
        .from("chat_family_invites")
        .select(
          "id, thread_id, invited_email, invited_by, expires_at, accepted_at",
        )
        .eq("token", token)
        .maybeSingle();
      return { data: (data ?? null) as AcceptInviteRow | null, error };
    },
    async upsertFamilyParticipant(args) {
      // If a row exists (removed or active), unsoftdelete + flip role
      // to family. Otherwise insert. We do this with an upsert pattern.
      const existing = await admin
        .from("chat_participants")
        .select("thread_id, user_id, role, removed_at")
        .eq("thread_id", args.thread_id)
        .eq("user_id", args.user_id)
        .maybeSingle();
      if (existing.error) {
        return { ok: false, error: existing.error.message };
      }
      if (existing.data) {
        const row = existing.data as { role: string; removed_at: string | null };
        // Don't downgrade a seeker/carer to family.
        if (row.role === "seeker" || row.role === "carer") {
          // Just clear removed_at if needed; preserve their role.
          if (row.removed_at) {
            const { error } = await admin
              .from("chat_participants")
              .update({ removed_at: null })
              .eq("thread_id", args.thread_id)
              .eq("user_id", args.user_id);
            return error
              ? { ok: false, error: error.message }
              : { ok: true };
          }
          return { ok: true };
        }
        const { error } = await admin
          .from("chat_participants")
          .update({
            role: "family",
            removed_at: null,
            added_by: args.added_by,
            added_at: new Date().toISOString(),
          })
          .eq("thread_id", args.thread_id)
          .eq("user_id", args.user_id);
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const { error } = await admin.from("chat_participants").insert({
        thread_id: args.thread_id,
        user_id: args.user_id,
        role: "family",
        added_by: args.added_by,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async markInviteAccepted(args) {
      const { error } = await admin
        .from("chat_family_invites")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_user_id: args.user_id,
        })
        .eq("id", args.invite_id);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async insertSystemMessage(args) {
      const { error } = await admin.from("chat_messages").insert({
        thread_id: args.thread_id,
        sender_id: args.sender_id,
        body: args.body,
        kind: "system",
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async getDisplayName(user_id) {
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", user_id)
        .maybeSingle();
      const row = data as { full_name: string | null } | null;
      return row?.full_name ?? null;
    },
    async getThreadSeekerId(thread_id) {
      const { data } = await admin
        .from("chat_threads")
        .select("booking_id")
        .eq("id", thread_id)
        .maybeSingle();
      const row = data as { booking_id: string } | null;
      if (!row) return null;
      const { data: booking } = await admin
        .from("bookings")
        .select("seeker_id")
        .eq("id", row.booking_id)
        .maybeSingle();
      const b = booking as { seeker_id: string } | null;
      return b?.seeker_id ?? null;
    },
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  return handleAcceptInvite({
    body,
    user_id: user?.id ?? null,
    client: buildClient(admin),
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_family_invites")
    .select("id, thread_id, invited_by, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "chat_invite_lookup_failed" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Invite not found" }, { status: 410 });
  }
  const inv = data as {
    id: string;
    thread_id: string;
    invited_by: string;
    expires_at: string;
    accepted_at: string | null;
  };
  if (inv.accepted_at) {
    return NextResponse.json(
      { error: "Invite already accepted" },
      { status: 410 },
    );
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  // Friendly summary: inviter's name + booking blurb. Best-effort —
  // page degrades gracefully if any of these reads fail.
  const { data: inviter } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", inv.invited_by)
    .maybeSingle();
  const inviterName =
    (inviter as { full_name: string | null } | null)?.full_name ??
    "A SpecialCarers member";

  const { data: threadRow } = await admin
    .from("chat_threads")
    .select("booking_id")
    .eq("id", inv.thread_id)
    .maybeSingle();
  const bookingId = (threadRow as { booking_id: string } | null)?.booking_id;
  let bookingSummary: string | null = null;
  if (bookingId) {
    const { data: bookingRow } = await admin
      .from("bookings")
      .select("start_at, service_type")
      .eq("id", bookingId)
      .maybeSingle();
    const b = bookingRow as {
      start_at: string | null;
      service_type: string | null;
    } | null;
    if (b) {
      const when = b.start_at
        ? new Date(b.start_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null;
      bookingSummary = [b.service_type, when].filter(Boolean).join(" · ");
    }
  }

  return NextResponse.json({
    invite_id: inv.id,
    inviter_name: inviterName,
    expires_at: inv.expires_at,
    booking_summary: bookingSummary,
  });
}
