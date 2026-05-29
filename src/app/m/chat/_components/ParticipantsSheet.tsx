"use client";

/**
 * P1-B11: bottom sheet that lists the active participants of a chat
 * thread (seeker / carer / family) and lets the seeker remove family
 * members.
 *
 * The data layer is hot-swappable: pass `fetchParticipants` / `onRemove`
 * for live use, or rely on the defaults (which hit `/api/m/chat/threads/
 * [threadId]/participants`). For the mock-data thread page, callers pass
 * stub providers that resolve to a fixed list — the UI tests for layout
 * and role badges still apply.
 */
import { useEffect, useState } from "react";

export type Participant = {
  user_id: string;
  role: "seeker" | "carer" | "family" | "admin";
  display_name: string | null;
  avatar_url: string | null;
  added_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  /** Whether the current viewer is the seeker (controls Remove visibility). */
  viewerIsSeeker: boolean;
  /** Override the fetcher (tests / mock thread pages). */
  fetchParticipants?: (threadId: string) => Promise<Participant[]>;
  /** Override the remove call. Resolve to ok=true to mark success. */
  onRemove?: (
    threadId: string,
    userId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Opens the invite sheet (rendered by parent). */
  onInvite: () => void;
};

async function defaultFetch(threadId: string): Promise<Participant[]> {
  const res = await fetch(
    `/api/m/chat/threads/${encodeURIComponent(threadId)}/participants`,
    { cache: "no-store" },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { participants: Participant[] };
  return json.participants ?? [];
}

async function defaultRemove(
  threadId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `/api/m/chat/threads/${encodeURIComponent(threadId)}/participants/${encodeURIComponent(
      userId,
    )}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? "remove_failed" };
  }
  return { ok: true };
}

const ROLE_LABEL: Record<Participant["role"], string> = {
  seeker: "Seeker",
  carer: "Carer",
  family: "Family",
  admin: "Admin",
};

const ROLE_TINT: Record<Participant["role"], string> = {
  seeker: "#039EA0",
  carer: "#F4A261",
  family: "#5C6770",
  admin: "#0F1416",
};

export function ParticipantsSheet({
  open,
  onClose,
  threadId,
  viewerIsSeeker,
  fetchParticipants = defaultFetch,
  onRemove = defaultRemove,
  onInvite,
}: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !threadId) return;
    setLoading(true);
    setError(null);
    fetchParticipants(threadId)
      .then((list) => setParticipants(list))
      .catch(() => setError("Could not load participants."))
      .finally(() => setLoading(false));
  }, [open, threadId, fetchParticipants]);

  async function handleRemove(userId: string) {
    if (!threadId) return;
    const out = await onRemove(threadId, userId);
    if (out.ok) {
      setParticipants((prev) => prev.filter((p) => p.user_id !== userId));
    } else {
      setError(out.error ?? "Could not remove.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Participants"
    >
      <div
        className="w-full rounded-t-2xl bg-white p-5 sc-safe-bottom"
        onClick={(e) => e.stopPropagation()}
        style={{
          fontFamily:
            "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-bold text-heading">
            Participants
          </h2>
          {viewerIsSeeker ? (
            <button
              type="button"
              onClick={onInvite}
              className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-white"
              style={{ background: "#039EA0" }}
            >
              + Invite family
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-subheading">Loading…</p>
        ) : error ? (
          <p className="mt-4 text-sm" style={{ color: "#A22" }}>
            {error}
          </p>
        ) : participants.length === 0 ? (
          <p className="mt-4 text-sm text-subheading">No participants yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {participants.map((p) => (
              <li
                key={p.user_id}
                className="flex items-center gap-3 py-3"
              >
                <div
                  className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-muted text-[12px] font-semibold text-heading"
                  aria-hidden
                >
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (p.display_name ?? "?").slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-heading">
                    {p.display_name ?? "Member"}
                  </p>
                  <p
                    className="text-[11px] font-medium"
                    style={{ color: ROLE_TINT[p.role] }}
                  >
                    {ROLE_LABEL[p.role]}
                  </p>
                </div>
                {viewerIsSeeker && p.role === "family" ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(p.user_id)}
                    className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-heading"
                    aria-label={`Remove ${p.display_name ?? "family member"}`}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-11 w-full rounded-full bg-muted font-display text-[14.5px] font-semibold text-heading"
        >
          Close
        </button>
      </div>
    </div>
  );
}
