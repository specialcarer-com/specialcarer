/**
 * Shared types for the Family Timeline (gap 41).
 *
 * The timeline is one feed per family (families.primary_user_id == seeker).
 * Events come from care-journal notes and booking lifecycle transitions.
 */

export const TIMELINE_EVENT_TYPES = [
  "note.created",
  "booking.confirmed",
  "booking.started",
  "booking.completed",
  "booking.cancelled",
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const TIMELINE_REACTION_KINDS = [
  "heart",
  "pray",
  "thanks",
  "concern",
] as const;
export type TimelineReactionKind = (typeof TIMELINE_REACTION_KINDS)[number];

export const COMMENT_MAX_BODY = 2000;
export const TIMELINE_PAGE_SIZE_DEFAULT = 20;
export const TIMELINE_PAGE_SIZE_MAX = 50;

/** Denormalised, renderable fields stored on timeline_events.payload. */
export type TimelineEventPayload = {
  /** Display name of the actor (carer/seeker) who caused the event. */
  actor_name?: string | null;
  /** Note kind (note/meal/medication/...) for note.created. */
  kind?: string | null;
  /** Mood tag for note.created, if any. */
  mood?: string | null;
  /** First ~280 chars of a note body. */
  excerpt?: string | null;
  /** AI "key points" summary, if one existed at ingestion time. */
  summary?: string | null;
  /** Number of photos attached to a note. */
  photo_count?: number;
  /** Booking window, for booking.* events. */
  starts_at?: string | null;
  ends_at?: string | null;
};

export type TimelineComment = {
  id: string;
  event_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  /** True when the current viewer authored it (can delete). */
  is_mine: boolean;
};

export type TimelineReactionSummary = {
  kind: TimelineReactionKind;
  count: number;
  /** True when the current viewer has reacted with this kind. */
  mine: boolean;
};

export type TimelineEvent = {
  id: string;
  family_id: string;
  seeker_id: string;
  event_type: TimelineEventType;
  booking_id: string | null;
  actor_id: string | null;
  payload: TimelineEventPayload;
  occurred_at: string;
  comments: TimelineComment[];
  comment_count: number;
  reactions: TimelineReactionSummary[];
};

export type TimelineFeedResponse = {
  events: TimelineEvent[];
  next_cursor: string | null;
};
