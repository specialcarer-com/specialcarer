/**
 * Server-side data layer for the Family Timeline (gap 41).
 *
 * Reads go through the user-scoped SSR client so RLS naturally restricts who
 * sees which events (seeker + active family members + carers-on-bookings).
 * Comment/reaction writes also go through the user client so the RLS INSERT
 * policies are the single source of truth for "who may comment/react".
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TIMELINE_PAGE_SIZE_DEFAULT,
  TIMELINE_PAGE_SIZE_MAX,
  COMMENT_MAX_BODY,
  TIMELINE_REACTION_KINDS,
  type TimelineEvent,
  type TimelineComment,
  type TimelineFeedResponse,
  type TimelineReactionKind,
  type TimelineReactionSummary,
} from "./types";

type EventRow = {
  id: string;
  family_id: string;
  seeker_id: string;
  event_type: TimelineEvent["event_type"];
  booking_id: string | null;
  actor_id: string | null;
  payload: TimelineEvent["payload"];
  occurred_at: string;
};

type CommentRow = {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type ReactionRow = {
  event_id: string;
  author_id: string;
  kind: TimelineReactionKind;
};

/** Resolve which family's timeline to show the caller. */
async function resolveFamilyId(
  client: Awaited<ReturnType<typeof createClient>>,
  callerId: string,
  requestedSeekerId?: string | null,
): Promise<string | null> {
  const admin = createAdminClient();

  // If a specific seeker was requested, resolve their family. RLS on the
  // events query is the real gate — we don't have to pre-authorise here.
  if (requestedSeekerId) {
    const { data } = await admin
      .from("families")
      .select("id")
      .eq("primary_user_id", requestedSeekerId)
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  }

  // Default: the caller's own family (as primary) …
  const { data: own } = await admin
    .from("families")
    .select("id")
    .eq("primary_user_id", callerId)
    .maybeSingle<{ id: string }>();
  if (own?.id) return own.id;

  // … else the most recent family they're an active member of.
  const { data: member } = await admin
    .from("family_members")
    .select("family_id, joined_at")
    .eq("user_id", callerId)
    .eq("status", "active")
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ family_id: string }>();
  if (member?.family_id) return member.family_id;

  // … else a family whose booking they are/were the carer on.
  void client; // (reads below use the user client; nothing else needed here)
  return null;
}

async function resolveNames(
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const admin = createAdminClient();
  const [{ data: carers }, { data: profs }] = await Promise.all([
    admin
      .from("caregiver_profiles")
      .select("user_id, display_name")
      .in("user_id", ids),
    admin.from("profiles").select("id, full_name").in("id", ids),
  ]);
  for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
    out.set(p.id, p.full_name ?? null);
  }
  for (const c of (carers ?? []) as {
    user_id: string;
    display_name: string | null;
  }[]) {
    if (c.display_name) out.set(c.user_id, c.display_name);
  }
  return out;
}

/**
 * Fetch a page of timeline events the caller can see, newest first, with
 * comments + reaction summaries hydrated. Cursor is the occurred_at of the
 * last event in the previous page (keyset pagination).
 */
export async function getTimelineFeed(opts: {
  seekerId?: string | null;
  cursor?: string | null;
  limit?: number;
  /** When set, return just this one event (RLS-gated) — used for refresh. */
  eventId?: string | null;
}): Promise<TimelineFeedResponse | { error: "unauthorized" }> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const limit = Math.min(
    Math.max(opts.limit ?? TIMELINE_PAGE_SIZE_DEFAULT, 1),
    TIMELINE_PAGE_SIZE_MAX,
  );

  const familyId = await resolveFamilyId(client, user.id, opts.seekerId);
  if (!familyId) {
    // Caller may still be a carer who can see booking-scoped events even when
    // they're not in any family. Fall through to an unfiltered (RLS-gated)
    // query in that case.
  }

  // Fetch limit+1 to compute the next cursor. RLS filters to the visible set.
  let query = client
    .from("timeline_events")
    .select(
      "id, family_id, seeker_id, event_type, booking_id, actor_id, payload, occurred_at",
    )
    .order("occurred_at", { ascending: false })
    .limit(limit + 1);

  if (opts.eventId) {
    query = query.eq("id", opts.eventId);
  } else {
    if (familyId) query = query.eq("family_id", familyId);
    if (opts.cursor) query = query.lt("occurred_at", opts.cursor);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("[timeline] feed query failed", error);
    return { events: [], next_cursor: null };
  }

  const events = (rows ?? []) as EventRow[];
  const hasMore = events.length > limit;
  const pageRows = hasMore ? events.slice(0, limit) : events;
  const eventIds = pageRows.map((e) => e.id);

  if (!eventIds.length) return { events: [], next_cursor: null };

  const [{ data: comments }, { data: reactions }] = await Promise.all([
    client
      .from("timeline_comments")
      .select("id, event_id, author_id, body, created_at")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true }),
    client
      .from("timeline_reactions")
      .select("event_id, author_id, kind")
      .in("event_id", eventIds),
  ]);

  const commentRows = (comments ?? []) as CommentRow[];
  const reactionRows = (reactions ?? []) as ReactionRow[];

  // Collect every id that needs a display name.
  const nameIds = new Set<string>();
  for (const e of pageRows) if (e.actor_id) nameIds.add(e.actor_id);
  for (const c of commentRows) nameIds.add(c.author_id);
  const names = await resolveNames([...nameIds]);

  const commentsByEvent = new Map<string, TimelineComment[]>();
  for (const c of commentRows) {
    const list = commentsByEvent.get(c.event_id) ?? [];
    list.push({
      id: c.id,
      event_id: c.event_id,
      author_id: c.author_id,
      author_name: names.get(c.author_id) ?? null,
      body: c.body,
      created_at: c.created_at,
      is_mine: c.author_id === user.id,
    });
    commentsByEvent.set(c.event_id, list);
  }

  const reactionsByEvent = new Map<string, ReactionRow[]>();
  for (const r of reactionRows) {
    const list = reactionsByEvent.get(r.event_id) ?? [];
    list.push(r);
    reactionsByEvent.set(r.event_id, list);
  }

  const hydrated: TimelineEvent[] = pageRows.map((e) => {
    const evComments = commentsByEvent.get(e.id) ?? [];
    const evReactions = reactionsByEvent.get(e.id) ?? [];
    const summaries: TimelineReactionSummary[] = TIMELINE_REACTION_KINDS.map(
      (kind) => {
        const ofKind = evReactions.filter((r) => r.kind === kind);
        return {
          kind,
          count: ofKind.length,
          mine: ofKind.some((r) => r.author_id === user.id),
        };
      },
    ).filter((s) => s.count > 0 || s.mine);

    return {
      id: e.id,
      family_id: e.family_id,
      seeker_id: e.seeker_id,
      event_type: e.event_type,
      booking_id: e.booking_id,
      actor_id: e.actor_id,
      payload: {
        ...e.payload,
        actor_name:
          e.payload?.actor_name ??
          (e.actor_id ? names.get(e.actor_id) ?? null : null),
      },
      occurred_at: e.occurred_at,
      comments: evComments,
      comment_count: evComments.length,
      reactions: summaries,
    };
  });

  const nextCursor = hasMore
    ? pageRows[pageRows.length - 1].occurred_at
    : null;

  return { events: hydrated, next_cursor: nextCursor };
}

export type AddCommentResult =
  | { ok: true; commentId: string }
  | { ok: false; error: string };

/** Add a comment to an event. RLS enforces commenter membership. */
export async function addComment(
  eventId: string,
  body: string,
): Promise<AddCommentResult> {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return { ok: false, error: "Please write a comment." };
  if (trimmed.length > COMMENT_MAX_BODY) {
    return {
      ok: false,
      error: `Comments are limited to ${COMMENT_MAX_BODY} characters.`,
    };
  }

  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data, error } = await client
    .from("timeline_comments")
    .insert({ event_id: eventId, author_id: user.id, body: trimmed })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message?.includes("row-level security")
        ? "You don't have permission to comment here."
        : "Couldn't post your comment. Please try again.",
    };
  }

  // Fire-and-forget push fan-out.
  try {
    const admin = createAdminClient();
    const { fanOutTimelineComment } = await import("./fanout");
    void fanOutTimelineComment(admin, data.id);
  } catch (err) {
    console.error("[timeline] comment fan-out dispatch failed", err);
  }

  return { ok: true, commentId: data.id };
}

export async function deleteComment(
  commentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = await createClient();
  const { error } = await client
    .from("timeline_comments")
    .delete()
    .eq("id", commentId);
  if (error) {
    return {
      ok: false,
      error: error.message?.includes("row-level security")
        ? "You can only delete your own comments."
        : "Couldn't delete the comment.",
    };
  }
  return { ok: true };
}

export type ToggleReactionResult =
  | { ok: true; active: boolean }
  | { ok: false; error: string };

/** Toggle a reaction of a given kind on/off for the current user. */
export async function toggleReaction(
  eventId: string,
  kind: TimelineReactionKind,
): Promise<ToggleReactionResult> {
  if (!(TIMELINE_REACTION_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "Invalid reaction." };
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // Is it already there?
  const { data: existing } = await client
    .from("timeline_reactions")
    .select("id")
    .eq("event_id", eventId)
    .eq("author_id", user.id)
    .eq("kind", kind)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    const { error } = await client
      .from("timeline_reactions")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Couldn't update your reaction." };
    return { ok: true, active: false };
  }

  const { error } = await client
    .from("timeline_reactions")
    .insert({ event_id: eventId, author_id: user.id, kind });
  if (error) {
    return {
      ok: false,
      error: error.message?.includes("row-level security")
        ? "You don't have permission to react here."
        : "Couldn't add your reaction.",
    };
  }
  return { ok: true, active: true };
}
