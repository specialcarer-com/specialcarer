"use client";

/**
 * P0-A4-bis-2: client chat screen, used by both the seeker
 * (/m/bookings/[id]/chat) and carer (/m/jobs/[id]/chat) routes. The
 * component is shape-symmetric for both sides — the page wrapper just
 * tells us the other party's name + avatar.
 */

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Avatar, IconChevronLeft } from "./ui";
import { useChat } from "@/lib/chat/useChat";
import type { ChatMessage } from "@/lib/chat/client";
import { EmptyChatState } from "./EmptyChatState";
import { ReportMessageSheet } from "./ReportMessageSheet";
import { getQuickReplies, type ChatRole } from "@/lib/chat/quick-replies";

const TIME_GROUP_GAP_MS = 10 * 60 * 1000;
const NEAR_BOTTOM_PX = 80;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isSameDay(d, now)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return `Yesterday ${time}`;
  const wd = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  return `${wd} ${time}`;
}

/**
 * Return true if `current` should carry a time-group divider above it
 * given the previous message. First message of the list always gets a
 * divider; subsequent ones only when >10 min later or a new calendar day.
 */
export function shouldShowTimeGroup(
  current: ChatMessage,
  previous: ChatMessage | undefined,
): boolean {
  if (!previous) return true;
  const c = new Date(current.created_at).getTime();
  const p = new Date(previous.created_at).getTime();
  if (Number.isNaN(c) || Number.isNaN(p)) return false;
  if (c - p > TIME_GROUP_GAP_MS) return true;
  return !isSameDay(new Date(current.created_at), new Date(previous.created_at));
}

export function ChatRoom({
  bookingId,
  currentUserId,
  otherPartyName,
  otherPartyAvatarUrl,
  backHref,
  role,
}: {
  bookingId: string;
  currentUserId: string;
  otherPartyName: string;
  otherPartyAvatarUrl?: string | null;
  backHref?: string;
  /**
   * P1-B9.2: which side of the conversation the current user is on.
   * Drives the quick-reply chip set above the composer. Optional for
   * back-compat with older call sites; absent = no chips rendered.
   */
  role?: ChatRole;
}) {
  const router = useRouter();
  const chat = useChat(bookingId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // P1-B10: which (non-own) message is currently being reported, if any.
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(
    null,
  );

  const showComposer =
    chat.status === "ready" && chat.archivedAt === null;

  // Track whether the user is at/near the bottom *before* the next
  // render so we can decide whether to auto-scroll on new messages
  // without yanking the viewport while they read history.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasNearBottomRef.current = distance <= NEAR_BOTTOM_PX;
  }, []);

  // Auto-scroll to the bottom on initial-load and whenever a new
  // message arrives if the user is already pinned there.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat.messages.length, chat.status]);

  // markRead on first ready, and on each new arrival if user is at-bottom.
  const lastReadCountRef = useRef(0);
  useEffect(() => {
    if (chat.status !== "ready") return;
    if (chat.messages.length === lastReadCountRef.current) return;
    if (wasNearBottomRef.current) {
      lastReadCountRef.current = chat.messages.length;
      void chat.markRead();
    }
  }, [chat.status, chat.messages.length, chat.markRead, chat]);

  const onSend = useCallback(async () => {
    const text = composer.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    const original = composer;
    setComposer("");
    // Always be ready to auto-scroll our own send.
    wasNearBottomRef.current = true;
    try {
      await chat.send(text);
    } catch {
      // Revert and surface a transient toast.
      setComposer(original);
      setToast("Couldn’t send. Try again.");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSending(false);
    }
  }, [composer, sending, chat]);

  /**
   * Send a quick-reply chip immediately, bypassing the textarea. Mirrors
   * onSend's try/catch + toast pattern but uses the chip's verbatim text
   * (no trim/edit/preview — brief: chips send instantly). Composer state
   * is left untouched so any in-progress draft survives a chip tap.
   */
  const onSendChip = useCallback(
    async (text: string) => {
      if (text.length === 0 || sending) return;
      setSending(true);
      wasNearBottomRef.current = true;
      try {
        await chat.send(text);
      } catch {
        setToast("Couldn’t send. Try again.");
        setTimeout(() => setToast(null), 3000);
      } finally {
        setSending(false);
      }
    },
    [sending, chat],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts newline (matches iOS-style chat
      // ergonomics on devices with a soft keyboard).
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void onSend();
      }
    },
    [onSend],
  );

  const onBack = useCallback(() => {
    if (backHref) router.push(backHref);
    else router.back();
  }, [backHref, router]);

  return (
    <main
      className="flex flex-col bg-bg-screen"
      style={{ minHeight: "100dvh" }}
    >
      {/* Header */}
      <header className="sc-safe-top sticky top-0 z-30 bg-white border-b border-line">
        <div className="flex items-center gap-3 h-14 px-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-md active:bg-muted sc-no-select"
          >
            <IconChevronLeft />
          </button>
          <Avatar src={otherPartyAvatarUrl ?? undefined} name={otherPartyName} size={24} />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <p
              className="text-[15px] font-bold truncate"
              style={{
                color: "#0F1416",
                fontFamily:
                  "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif",
              }}
            >
              {otherPartyName}
            </p>
            {chat.archivedAt && (
              <span className="inline-flex items-center px-2 h-5 rounded-pill bg-muted text-[11px] font-medium text-subheading">
                Archived
              </span>
            )}
          </div>
          {/* P1-B9.4: pin toggle. Filled icon when pinned, outline when
              not. Only rendered once the thread fetch has resolved so a
              ghost-tap during loading can't fire a PATCH. */}
          {chat.status === "ready" && chat.threadId && (
            <button
              type="button"
              onClick={() => void chat.togglePin()}
              aria-label={chat.pinned ? "Unpin conversation" : "Pin conversation"}
              aria-pressed={chat.pinned}
              className="grid h-10 w-10 place-items-center rounded-md active:bg-muted sc-no-select"
              style={{ color: chat.pinned ? "#039EA0" : "#0F1416" }}
            >
              <PinIcon filled={chat.pinned} />
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      {chat.status === "loading" && (
        <div className="flex-1 px-4 py-6 space-y-3" aria-busy="true">
          <div className="h-10 w-1/2 rounded-2xl bg-muted animate-pulse" />
          <div className="ml-auto h-10 w-2/3 rounded-2xl bg-muted animate-pulse" />
          <div className="h-10 w-1/3 rounded-2xl bg-muted animate-pulse" />
        </div>
      )}
      {chat.status === "no_carer_yet" && (
        <div className="flex flex-1 flex-col">
          <EmptyChatState otherPartyName={otherPartyName} />
        </div>
      )}
      {chat.status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[15px] font-semibold text-heading">
            Couldn&rsquo;t load chat.
          </p>
          <p className="mt-1 text-[13px] text-subheading">
            Check your connection and try again.
          </p>
        </div>
      )}
      {chat.status === "ready" && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label={`Conversation with ${otherPartyName}`}
          className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
          style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}
        >
          {chat.messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <p className="text-[13px] text-subheading">
                Say hi to {otherPartyName}.
              </p>
            </div>
          ) : (
            chat.messages.map((m, idx) => {
              const prev = chat.messages[idx - 1];
              const showGroup = shouldShowTimeGroup(m, prev);
              const own = m.sender_id === currentUserId;
              return (
                <div key={m.id}>
                  {showGroup && (
                    <div className="flex justify-center my-3">
                      <span className="inline-flex items-center px-3 h-6 rounded-pill bg-muted text-[11px] font-medium text-subheading">
                        {formatGroupLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div
                    className={
                      own
                        ? "flex justify-end items-center gap-1"
                        : "flex justify-start items-center gap-1"
                    }
                  >
                    <span
                      className="inline-block max-w-[75%] rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap break-words"
                      style={
                        own
                          ? { background: "#039EA0", color: "white" }
                          : { background: "#E8E8E8", color: "#0F1416" }
                      }
                    >
                      {m.body}
                    </span>
                    {!own && (
                      <button
                        type="button"
                        onClick={() => setReportingMessageId(m.id)}
                        aria-label="Report message"
                        className="grid h-7 w-7 place-items-center rounded-full text-[#7B6E5A] active:bg-muted sc-no-select"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Composer / archived notice */}
      {chat.status === "ready" && chat.archivedAt !== null && (
        <div className="sticky bottom-0 z-20 bg-white border-t border-line px-4 py-3 sc-safe-bottom">
          <p className="text-[12.5px] text-subheading text-center">
            This conversation is archived. Read-only.
          </p>
        </div>
      )}
      {reportingMessageId && (
        <ReportMessageSheet
          messageId={reportingMessageId}
          onClose={() => setReportingMessageId(null)}
        />
      )}
      {showComposer && (
        <div className="sticky bottom-0 z-20 bg-white border-t border-line px-3 py-2 sc-safe-bottom">
          {toast && (
            <p
              role="status"
              className="mb-2 text-[12.5px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-1.5"
            >
              {toast}
            </p>
          )}
          {/* P1-B9.2: quick-reply chips. Hidden while a send is in
              flight to prevent a double-tap stampeding the API. The row
              scrolls horizontally on narrow screens with no scrollbar
              chrome — mobile-first ergonomics. */}
          {role && !sending && (
            <div
              role="group"
              aria-label="Quick replies"
              className="-mx-1 mb-2 flex items-center gap-2 overflow-x-auto px-1 pb-1 sc-no-scrollbar"
            >
              {getQuickReplies(role).map((reply) => (
                <button
                  key={reply.id}
                  type="button"
                  onClick={() => void onSendChip(reply.text)}
                  className="flex-none rounded-pill border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-heading sc-no-select active:bg-primary-50"
                >
                  {reply.text}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              aria-label={`Message ${otherPartyName}`}
              placeholder="Message…"
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-2xl border border-line bg-white px-3 py-2 text-[14.5px] text-heading placeholder:text-[#A3A3A3] focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={composer.trim().length === 0 || sending}
              aria-disabled={composer.trim().length === 0 || sending}
              aria-label="Send message"
              className="grid h-10 w-10 place-items-center rounded-full text-white sc-no-select disabled:opacity-40"
              style={{ background: "#039EA0" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * P1-B9.4: pin glyph (filled vs. outline). Inline SVG to avoid pulling
 * in an icon library when the rest of the chat header already does the
 * same. Path borrowed from a generic pushpin silhouette.
 */
function PinIcon({ filled }: { filled: boolean }) {
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
