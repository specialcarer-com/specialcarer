"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  IconSend,
  IconPhone,
  IconChevronLeft,
} from "../../_components/ui";
import { getChat, type ChatMessage } from "../../_lib/mock";
import { AttachmentPicker, type SelectedFile } from "../_components/AttachmentPicker";
import {
  AttachmentList,
  type RenderableAttachment,
} from "../_components/AttachmentRender";
import {
  MAX_PER_MESSAGE,
  uploadAttachment,
} from "@/lib/chat/attachments-client";
import {
  ParticipantsSheet,
  type Participant,
} from "../_components/ParticipantsSheet";
import { InviteFamilySheet } from "../_components/InviteFamilySheet";

type DraftAttachment = RenderableAttachment & { local_url?: string };
type LocalMessage = ChatMessage & { attachments?: RenderableAttachment[] };

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const data = getChat(params.id);

  const [messages, setMessages] = useState<LocalMessage[]>(data?.thread ?? []);
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
  const uploadAbort = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // P1-B11: the mock-data thread page has no live thread_id; for now
  // we render the participants header purely from the carer record so
  // the surface area exists. The sheets call the real endpoints when
  // a real threadId is wired up in a follow-up — until then they're
  // gated behind the seeker viewer flag (mock viewer = seeker).
  const threadId = params.id ?? null;
  const viewerIsSeeker = true;
  const mockParticipants: Participant[] = data?.carer
    ? [
        {
          user_id: "viewer",
          role: "seeker",
          display_name: "You",
          avatar_url: null,
          added_at: new Date().toISOString(),
        },
        {
          user_id: "carer-1",
          role: "carer",
          display_name: data.carer.name,
          avatar_url: data.carer.photo ?? null,
          added_at: new Date().toISOString(),
        },
      ]
    : [];

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!data || !data.carer) {
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

  const { carer } = data;

  function send() {
    const text = draft.trim();
    if (!text && draftAttachments.length === 0) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${prev.length + 1}`,
        fromMe: true,
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachments: draftAttachments.length ? [...draftAttachments] : undefined,
      },
    ]);
    setDraft("");
    setDraftAttachments([]);
  }

  async function handleSelected(file: SelectedFile) {
    // Local placeholder: optimistic preview while the upload runs.
    const localUrl = URL.createObjectURL(file.blob);
    setUploading({
      filename: file.filename,
      loaded: 0,
      total: file.size_bytes,
    });
    uploadAbort.current = new AbortController();
    try {
      // In this mock-driven view there is no real message_id yet — when
      // wired to the live thread, replace `local-draft` with the persisted
      // message id returned from POST /messages. For now we attach the
      // local preview directly so the UX is testable end-to-end.
      // TODO(b9.1-wiring): replace local-draft with real message id once
      // the chat thread page is migrated off the mock store.
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
        // Offline / mock fallback: still let the user "send" with a
        // locally previewed attachment so the UI demo works.
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
              <Avatar src={carer.photo} size={36} name={carer.name} />
            </div>
          </button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold text-heading">{carer.name}</p>
            <p className="text-[11px] text-primary">Online</p>
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
            className="grid h-10 w-10 place-items-center rounded-full bg-muted text-heading"
            aria-label="Call"
          >
            <IconPhone />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto mb-4 w-fit rounded-full bg-muted px-3 py-1 text-[11px] text-subheading">
          Today
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

      <div className="border-t border-line bg-white px-4 py-3 sc-safe-bottom">
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
              !!uploading || draftAttachments.length >= MAX_PER_MESSAGE
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
            placeholder="Type a message"
            className="max-h-32 flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-[15px] text-heading placeholder:text-subheading focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={send}
            disabled={!draft.trim() && draftAttachments.length === 0}
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-white shadow-card transition active:scale-95 disabled:bg-muted disabled:text-subheading"
            aria-label="Send"
          >
            <IconSend />
          </button>
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
        // Mock-mode fetcher returns the synthesized seeker+carer list so
        // the sheet renders meaningfully on the demo thread.
        fetchParticipants={async () => mockParticipants}
        onRemove={async () => ({ ok: true })}
        onInvite={() => {
          setParticipantsOpen(false);
          setInviteOpen(true);
        }}
      />
      <InviteFamilySheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        threadId={threadId}
        onSubmit={async () => ({ ok: true })}
        onSent={(email) => setToast(`Invite sent to ${email}`)}
      />
    </div>
  );
}
