import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FlagReason,
  FlagStatus,
} from "@/lib/chat/admin-queue-handler";
import FlagRowActions from "./FlagRowActions";

export const dynamic = "force-dynamic";

const JAKARTA =
  "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif";

const REASON_LABEL: Record<FlagReason, string> = {
  off_platform_contact: "Off-platform contact",
  off_platform_payment: "Off-platform payment",
  harassment: "Harassment",
  spam: "Spam",
  safeguarding: "Safeguarding",
  other: "Other",
};

type Row = {
  id: string;
  message_id: string;
  thread_id: string;
  flagged_by: string | null;
  reason: FlagReason;
  auto_detected: boolean;
  detected_pattern: string | null;
  status: FlagStatus;
  admin_notes: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
};

type ProfileRow = { id: string; full_name: string | null };

export default async function ChatModerationQueuePage() {
  await requireAdmin();
  const admin = createAdminClient();

  // The page intentionally focuses on the open queue. Filters,
  // bulk-actions, and an audit-log feed are scoped to follow-up tickets.
  const { data: flagData } = await admin
    .from("chat_message_flags")
    .select(
      "id, message_id, thread_id, flagged_by, reason, auto_detected, detected_pattern, status, admin_notes, created_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (flagData ?? []) as Row[];

  const messageIds = Array.from(new Set(rows.map((r) => r.message_id)));
  const { data: msgData } = messageIds.length
    ? await admin
        .from("chat_messages")
        .select("id, body, sender_id, created_at")
        .in("id", messageIds)
    : { data: [] };
  const messageById = new Map(
    ((msgData ?? []) as MessageRow[]).map((m) => [m.id, m]),
  );

  const userIds = Array.from(
    new Set(
      [
        ...((msgData ?? []) as MessageRow[]).map((m) => m.sender_id),
        ...rows.map((r) => r.flagged_by).filter((x): x is string => !!x),
      ],
    ),
  );
  const { data: profileData } = userIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const profileById = new Map(
    ((profileData ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  return (
    <main
      className="mx-auto max-w-5xl px-6 py-8"
      style={{ fontFamily: JAKARTA, color: "#0F1416" }}
    >
      <header className="mb-6">
        <p className="text-[12px] uppercase tracking-wider text-[#039EA0] font-semibold">
          Trust & Safety
        </p>
        <h1 className="mt-1 text-2xl font-bold">Chat moderation</h1>
        <p className="mt-2 text-sm text-[#52606D] max-w-2xl">
          Open chat flags raised by participants (reports) or detected
          automatically (off-platform contact / payment attempts). Review
          the message in context and take an action — every decision is
          recorded against the flag row.
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center text-sm"
          style={{ background: "#F4EFE6", borderColor: "#E2D9C8", color: "#52606D" }}
        >
          No open flags. The queue is clear.
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => {
            const msg = messageById.get(row.message_id) ?? null;
            const sender = msg ? profileById.get(msg.sender_id) ?? null : null;
            const reporter = row.flagged_by
              ? profileById.get(row.flagged_by) ?? null
              : null;
            return (
              <li
                key={row.id}
                className="rounded-xl border bg-white p-5 shadow-sm"
                style={{ borderColor: "#E5E0D5" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      background: row.auto_detected ? "#FBEEDC" : "#E6F4F4",
                      color: row.auto_detected ? "#8A4B0B" : "#055B5C",
                    }}
                  >
                    {row.auto_detected ? "Auto-detected" : "User reported"}
                  </span>
                  <span
                    className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: "#E5E0D5", color: "#0F1416" }}
                  >
                    {REASON_LABEL[row.reason] ?? row.reason}
                  </span>
                  {row.detected_pattern && (
                    <span className="text-[11px] text-[#7B6E5A] font-mono">
                      {row.detected_pattern}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-[#7B6E5A]">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-wider text-[#7B6E5A] font-semibold">
                    Message
                  </p>
                  <blockquote
                    className="mt-1 rounded-md px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words"
                    style={{ background: "#F4EFE6", color: "#0F1416" }}
                  >
                    {msg?.body ?? "(message unavailable)"}
                  </blockquote>
                  <p className="mt-2 text-[12px] text-[#52606D]">
                    Sender:{" "}
                    <span className="font-semibold">
                      {sender?.full_name ?? msg?.sender_id ?? "unknown"}
                    </span>
                    {" · "}Thread{" "}
                    <code className="text-[11px]">{row.thread_id.slice(0, 8)}</code>
                  </p>
                </div>

                {row.flagged_by && (
                  <div className="mt-3 text-[12px] text-[#52606D]">
                    Reported by{" "}
                    <span className="font-semibold">
                      {reporter?.full_name ?? row.flagged_by}
                    </span>
                    {row.admin_notes && (
                      <span>
                        {" · "}Notes:{" "}
                        <span className="italic">{row.admin_notes}</span>
                      </span>
                    )}
                  </div>
                )}

                <FlagRowActions flagId={row.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

