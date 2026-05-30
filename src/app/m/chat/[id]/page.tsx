"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Avatar,
  IconSend,
  IconPhone,
  IconChevronLeft,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";
import { AttachmentPicker, type SelectedFile } from "../_components/AttachmentPicker";
import {
  AttachmentList,
  type RenderableAttachment,
} from "../_components/AttachmentRender";
import {
  MAX_PER_MESSAGE,
  uploadAttachment,
} from "@/lib/chat/attachments-client";
import { ParticipantsSheet } from "../_components/ParticipantsSheet";
import { InviteFamilySheet } from "../_components/InviteFamilySheet";
import { QuickReplyChips } from "../_components/QuickReplyChips";
import type { ChatRole } from "@/lib/chat/quick-replies";

type DraftAttachment = RenderableAttachment & { local_url?: string };

/** Server message shape (GET .../messages). */
type ApiMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

/** Local render shape, derived from the server message + viewer id. */
type LocalMessage = {
  id: string;
  fromMe: boolean;
  text: string;
  time: string;
  attachments?: RenderableAttachment[];
};

type ThreadDetail = {
  id: string;
  booking_id: string;
  pinned: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  viewer_role: ChatRole | "admin";
  counterpart_name: string | null;
  counterpart_avatar_url: string | null;
};

const PAGE_SIZE = 50;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Map a server message to the bubble render shape. Oldest-first. */
function toLocal(m: ApiMessage, meId: string | null): LocalMessage {
  return {
    id: m.id,
    fromMe: meId !== null && m.sender_id === meId,
    text: m.body,
    time: fmtTime(m.created_at),
  };
}

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const threadId = params.id ?? null;

  const [meId, setMeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  // Oldest loaded message's created_at — the cursor for "load older".
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [uploading, setUploading] = useState<{
    filename: string;
    loaded: number;
    total: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const uploadAbort = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // P1-B9.2/B11: the viewer's role drives both the quick-reply chip set
  // and the "Invite family" affordance (seeker-only). Sourced from the
  // detail endpoint's participant-role lookup, no longer hardcoded.
  const viewerRole = detail?.viewer_role ?? "seeker";
  const viewerIsSeeker = viewerRole === "seeker";
  const viewerChatRole: ChatRole =
    viewerRole === "admin" ? "seeker" : viewerRole;
  const archived = detail?.archived_at != null;

  // Resolve the signed-in user once so `fromMe` can be computed.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setMeId(data.user?.id ?? null);
    });
  }, []);

  // Load thread detail (role, counterpart, pinned state).
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    fetch(`/api/m/chat/threads/${encodeURIComponent(threadId)}`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ thread: ThreadDetail }>;
      })
      .then((json) => {
        if (cancelled) return;
        setDetail(json.thread);
        setPinned(json.thread.pinned);
      })
      .catch(() => {
        if (!cancelled) setDetailError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Initial message page. Re-run once `meId` is known so `fromMe` is
  // correct without a second mapping pass.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/m/chat/threads/${encodeURIComponent(threadId)}/messages?limit=${PAGE_SIZE}`,
      { cache: "no-store" },
    )
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ messages: ApiMessage[] }>;
      })
      .then((json) => {
        if (cancelled) return;
        // Endpoint returns newest-first; render oldest-first.
        const asc = [...(json.messages ?? [])].reverse();
        setMessages(asc.map((m) => toLocal(m, meId)));
        setOldestCursor(asc.length ? asc[0].created_at : null);
        setHasMore((json.messages ?? []).length === PAGE_SIZE);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, meId]);

  const loadOlder = useCallback(async () => {
    if (!threadId || !oldestCursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/m/chat/threads/${encodeURIComponent(
          threadId,
        )}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldestCursor)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { messages: ApiMessage[] };
      const older = [...(json.messages ?? [])].reverse();
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setMessages((prev) => [...older.map((m) => toLocal(m, meId)), ...prev]);
      setOldestCursor(older[0].created_at);
      setHasMore((json.messages ?? []).length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [threadId, oldestCursor, loadingMore, hasMore, meId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  if (detailError) {
    return (
      <div className="min-h-screen bg-bg-screen p-6">
        <p className="text-sm text-subheading">Conversation not found.</p>
        <button
          onClick={() => router.push("/m/chat")}
          className="mt-4 text-sm font-medium text-primary"
        >
          Back to messages
        </button>
      </div>
    );
  }

  const title = detail?.counterpart_name ?? "Conversation";

  async function send(override?: string) {
    const text = (override ?? draft).trim();
    if ((!text && draftAttachments.length === 0) || !threadId) return;

    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        fromMe: true,
        text,
        time: fmtTime(new Date().toISOString()),
        attachments: draftAttachments.length ? [...draftAttachments] : undefined,
      },
    ]);
    if (override === undefined) setDraft("");
    const sentAttachments = draftAttachments;
    setDraftAttachments([]);

    // Attachments in this view are previewed locally; the text body is
    // what the messages endpoint persists. Skip the POST when there's no
    // text (attachment-only sends remain local until message-linked
    // uploads are wired — tracked by attachments-client).
    if (!text) return;
    try {
      const res = await fetch(
        `/api/m/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { message: ApiMessage };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...toLocal(json.message, meId), attachments: m.attachments }
            : m,
        ),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraftAttachments(sentAttachments);
      if (override === undefined) setDraft(text);
      setToast("Message failed to send");
    }
  }

  async function togglePin() {
    if (!threadId || pinBusy) return;
    const next = !pinned;
    setPinned(next);
    setPinBusy(true);
    try {
      const res = await fetch(
        `/api/m/chat/threads/${encodeURIComponent(threadId)}/pin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: next }),
        },
      );
      if (!res.ok) {
        setPinned(!next);
        setToast(next ? "Could not pin" : "Could not unpin");
      }
    } catch {
      setPinned(!next);
      setToast(next ? "Could not pin" : "Could not unpin");
    } finally {
      setPinBusy(false);
    }
  }

  async function handleSelected(file: SelectedFile) {
    const localUrl = URL.createObjectURL(file.blob);
    setUploading({
      filename: file.filename,
      loaded: 0,
      total: file.size_bytes,
    });
    uploadAbort.current = new AbortController();
    try {
      const result = await uploadAttachment({
        message_id: "local-draft",
        file: file.blob,
        filename: file.filename,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        width: file.width,
        height: file.height,
        onProgress: (p) =>
          setUploading({
            filename: file.filename,
            loaded: p.loaded,
            total: p.total,
          }),
        signal: uploadAbort.current.signal,
      }).catch(() => null);

      if (result) {
        setDraftAttachments((prev) => [
          ...prev,
          { ...result.attachment, signed_url: result.signed_url },
        ]);
      } else {
        setDraftAttachments((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            mime_type: file.mime_type,
            filename: file.filename,
            size_bytes: file.size_bytes,
            width: file.width ?? null,
            height: file.height ?? null,
            signed_url: localUrl,
          },
        ]);
      }
    } finally {
      setUploading(null);
      uploadAbort.current = null;
    }
  }

  function cancelUpload() {
    uploadAbort.current?.abort();
  }

  function removeDraftAttachment(id: string) {
    setDraftAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-screen sc-keyboard-aware">
      {/* Custom header with avatar */}
      <div className="sc-safe-top sticky top-0 z-30 bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => router.push("/m/chat")}
            className="-ml-2 p-2 sc-no-select"
            aria-label="Back"
          >
            <IconChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => setParticipantsOpen(true)}
            className="flex items-center gap-2 -ml-1 rounded-full px-1 py-1"
            aria-label="View participants"
          >
            <div className="flex -space-x-2">
              <Avatar
                src={detail?.counterpart_avatar_url ?? undefined}
                size={36}
                name={title}
              />
            </div>
          </button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold text-heading">
              {title}
            </p>
            <p className="text-[11px] text-primary">
              {archived ? "Archived" : "Online"}
            </p>
          </div>
          {viewerIsSeeker ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: "#039EA0" }}
              aria-label="Invite family"
            >
              + Invite family
            </button>
          ) : null}
          <button
            type="button"
            onClick={togglePin}
            disabled={pinBusy}
            aria-label={pinned ? "Unpin this conversation" : "Pin this conversation"}
            aria-pressed={pinned}
            className="grid h-10 w-10 place-items-center rounded-full transition disabled:opacity-50"
            style={
              pinned
                ? { backgroundColor: "#039EA0", color: "#FFFFFF" }
                : {
                    backgroundColor: "transparent",
                    color: "#0F1416",
                    border: "1px solid rgba(3, 158, 160, 0.3)",
                  }
            }
          >
            <ThreadPinIcon filled={pinned} />
          </button>
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-muted text-heading"
            aria-label="Call"
          >
            <IconPhone />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {hasMore ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingMore}
              className="rounded-full bg-muted px-4 py-1.5 text-[12px] font-medium text-heading disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}
        <div className="mx-auto mb-4 w-fit rounded-full bg-muted px-3 py-1 text-[11px] text-subheading">
          {loading ? "Loading…" : "Today"}
        </div>
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                  m.fromMe
                    ? "rounded-br-md bg-primary text-white"
                    : "rounded-bl-md bg-white text-heading shadow-card"
                }`}
              >
                {m.text ? (
                  <p className="text-[14.5px] leading-snug">{m.text}</p>
                ) : null}
                {m.attachments && m.attachments.length > 0 ? (
                  <AttachmentList attachments={m.attachments} fromMe={m.fromMe} />
                ) : null}
                <p
                  className={`mt-1 text-[10px] ${
                    m.fromMe ? "text-white/70" : "text-subheading"
                  }`}
                >
                  {m.time}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line bg-white sc-safe-bottom">
        <QuickReplyChips
          role={viewerChatRole}
          onSelect={(text) => send(text)}
          disabled={!!uploading || archived}
        />
        <div className="px-4 pb-3">
        {uploading ? (
          <div className="mb-2 flex items-center gap-2">
            <div className="flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-[width]"
                style={{
                  width: `${
                    uploading.total
                      ? Math.min(
                          100,
                          Math.round((uploading.loaded / uploading.total) * 100),
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={cancelUpload}
              className="font-display text-[12px] font-medium text-primary"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {draftAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {draftAttachments.map((a) => (
              <div
                key={a.id}
                className="relative overflow-hidden rounded-lg border border-line"
              >
                {a.mime_type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.signed_url ?? ""}
                    alt={a.filename}
                    className="h-16 w-16 object-cover"
                  />
                ) : (
                  <div
                    className="grid h-16 w-16 place-items-center"
                    style={{ backgroundColor: "#F4EFE6" }}
                  >
                    <span
                      className="font-display text-[10px] font-semibold"
                      style={{ color: "#0F1416" }}
                    >
                      PDF
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeDraftAttachment(a.id)}
                  aria-label={`Remove ${a.filename}`}
                  className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl-md bg-black/60 text-[11px] leading-none text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-1">
          <AttachmentPicker
            existingCount={draftAttachments.length}
            onSelected={handleSelected}
            onError={(m) => setToast(m)}
            disabled={
              !!uploading || archived || draftAttachments.length >= MAX_PER_MESSAGE
            }
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={archived ? "This conversation is archived" : "Type a message"}
            disabled={archived}
            className="max-h-32 flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-[15px] text-heading placeholder:text-subheading focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
          <button
            onClick={() => send()}
            disabled={archived || (!draft.trim() && draftAttachments.length === 0)}
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-white shadow-card transition active:scale-95 disabled:bg-muted disabled:text-subheading"
            aria-label="Send"
          >
            <IconSend />
          </button>
        </div>
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="pointer-events-auto rounded-full bg-heading px-4 py-2 font-display text-[13px] text-white shadow-card">
            {toast}
          </div>
        </div>
      ) : null}

      <ParticipantsSheet
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        threadId={threadId}
        viewerIsSeeker={viewerIsSeeker}
        onInvite={() => {
          setParticipantsOpen(false);
          setInviteOpen(true);
        }}
      />
      <InviteFamilySheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        threadId={threadId}
        onSent={(email) => setToast(`Invite sent to ${email}`)}
      />
    </div>
  );
}

/**
 * P1-B9.4: thumbtack-style icon used by the header pin toggle. Stroke
 * inherits from the button so the empty state reads as outline-on-ink
 * and the active state reads as cutout-on-teal without an extra prop.
 */
function ThreadPinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l3 4.24H6l3-4.24z" />
    </svg>
  );
}
