/**
 * Chat domain types.
 *
 * Threads are 1:N message containers. Participants gate read/write
 * access via RLS — exactly two for booking-derived threads
 * (seeker + carer); family/support are reserved for future use.
 */

export type ParticipantRole = "seeker" | "carer" | "family" | "support";

export type AttachmentKind = "image" | "video" | "audio";

export type Thread = {
  id: string;
  booking_id: string | null;
  created_at: string;
  archived_at: string | null;
  last_message_at: string | null;
};

export type Participant = {
  thread_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at: string;
  last_read_at: string | null;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_kind: AttachmentKind | null;
  created_at: string;
  deleted_at: string | null;
};

export type ThreadListItem = Thread & {
  participants: Participant[];
  last_message: { body: string | null; sender_id: string; created_at: string } | null;
  unread_count: number;
};

export type ListThreadsResult = {
  items: ThreadListItem[];
  next_cursor: string | null;
};

export type ListMessagesResult = {
  items: Message[];
  next_cursor: string | null;
};

export type SendMessageInput = {
  body?: string | null;
  attachment_path?: string | null;
  attachment_kind?: AttachmentKind | null;
};
