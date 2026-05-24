/**
 * Client-side fetchers for the mobile chat UI.
 *
 * Mirrors the shape returned by the legacy _lib/mock.getChat so the
 * /m/chat/[id] component renders unchanged (carer header, message
 * bubbles, time labels). Real participant + message rows come from
 * /api/m/chat/*.
 */
import type { Message, ThreadListItem } from "./types";

export type ChatCarer = {
  id: string;
  name: string;
  photo: string | null;
};

export type ChatMessageView = {
  id: string;
  fromMe: boolean;
  text: string;
  time: string;
  attachment_path: string | null;
};

export type ChatPreview = {
  id: string;
  carer: ChatCarer | null;
  lastMessage: string;
  when: string;
  unread: number;
};

export type ChatBundle = {
  preview: ChatPreview;
  carer: ChatCarer | null;
  thread: ChatMessageView[];
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function messageToView(m: Message, me: string): ChatMessageView {
  return {
    id: m.id,
    fromMe: m.sender_id === me,
    text: m.body ?? "",
    time: fmtTime(m.created_at),
    attachment_path: m.attachment_path,
  };
}

export type ApiThreadPeer = {
  user_id: string;
  role: string;
  display_name: string | null;
  photo_url: string | null;
};

export type ApiThreadListItem = ThreadListItem & {
  peer: ApiThreadPeer | null;
};

/**
 * Fetch a thread + its first page of messages for the chat detail view.
 * Shape matches the legacy `_lib/mock.getChat(id)` return so the page
 * component change stays a one-liner.
 */
export async function getChat(
  thread_id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ChatBundle | null> {
  const res = await fetch(`/api/m/chat/${thread_id}/messages?limit=50`, {
    signal: opts.signal,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    me: string;
    peer: ApiThreadPeer | null;
    last_message_at: string | null;
    unread_count: number;
    items: Message[];
  };

  const carer: ChatCarer | null = data.peer
    ? {
        id: data.peer.user_id,
        name: data.peer.display_name ?? "Carer",
        photo: data.peer.photo_url,
      }
    : null;

  // listMessages returns newest-first; the UI walks oldest → newest.
  const ordered = [...data.items].reverse();
  const thread = ordered.map((m) => messageToView(m, data.me));
  const lastBody =
    [...data.items].find((m) => m.body && m.body.length > 0)?.body ?? "";

  return {
    preview: {
      id: thread_id,
      carer,
      lastMessage: lastBody,
      when: fmtWhen(data.last_message_at),
      unread: data.unread_count,
    },
    carer,
    thread,
  };
}

export { fmtWhen };
