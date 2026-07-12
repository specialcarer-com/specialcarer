"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  TimelineEvent,
  TimelineReactionKind,
} from "@/lib/timeline/types";
import TimelineEventCard from "./TimelineEventCard";

const CREAM = "#F4EFE6";
const INK = "#0F1416";

/** Group label for a day, relative where helpful. */
function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function dayHeading(
  iso: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const k = dayKey(iso);
  if (k === dayKey(today.toISOString())) return t("day.today");
  if (k === dayKey(yesterday.toISOString())) return t("day.yesterday");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type Group = { key: string; heading: string; events: TimelineEvent[] };

export default function TimelineClient({
  initialEvents,
  initialCursor,
  currentUserId,
}: {
  initialEvents: TimelineEvent[];
  initialCursor: string | null;
  currentUserId: string;
}) {
  const t = useTranslations("timeline");
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const k = dayKey(ev.occurred_at);
      const list = map.get(k);
      if (list) list.push(ev);
      else map.set(k, [ev]);
    }
    return Array.from(map.entries()).map(([key, evs]) => ({
      key,
      heading: dayHeading(evs[0].occurred_at, t),
      events: evs,
    }));
  }, [events, t]);

  /** Replace a single event in state (e.g. after a reaction/comment refresh). */
  const patchEvent = useCallback(
    (eventId: string, next: TimelineEvent) => {
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? next : e)),
      );
    },
    [],
  );

  /** Refetch one event's hydrated state from the feed and patch it in. */
  const refreshEvent = useCallback(
    async (eventId: string) => {
      try {
        const res = await fetch(`/api/m/timeline?event=${eventId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { events: TimelineEvent[] };
        const fresh = json.events.find((e) => e.id === eventId);
        if (fresh) patchEvent(eventId, fresh);
      } catch {
        // best-effort; leave optimistic state in place
      }
    },
    [patchEvent],
  );

  const handleReact = useCallback(
    async (eventId: string, kind: TimelineReactionKind) => {
      setError(null);
      // Optimistic toggle of the matching reaction summary.
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== eventId) return e;
          const reactions = [...e.reactions];
          const idx = reactions.findIndex((r) => r.kind === kind);
          if (idx === -1) {
            reactions.push({ kind, count: 1, mine: true });
          } else {
            const r = reactions[idx];
            reactions[idx] = {
              ...r,
              mine: !r.mine,
              count: Math.max(0, r.count + (r.mine ? -1 : 1)),
            };
          }
          return { ...e, reactions };
        }),
      );
      setBusyEventId(eventId);
      try {
        const res = await fetch(
          `/api/m/timeline/events/${eventId}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind }),
          },
        );
        if (!res.ok) {
          setError(t("error.reaction"));
          await refreshEvent(eventId);
        }
      } catch {
        setError(t("error.reaction"));
        await refreshEvent(eventId);
      } finally {
        setBusyEventId(null);
      }
    },
    [refreshEvent, t],
  );

  const handleToggleComments = useCallback((eventId: string) => {
    setExpandedId((cur) => (cur === eventId ? null : eventId));
  }, []);

  const handleSubmitComment = useCallback(
    async (eventId: string) => {
      const draft = (commentDrafts[eventId] ?? "").trim();
      if (!draft) return;
      setError(null);
      setBusyEventId(eventId);
      try {
        const res = await fetch(
          `/api/m/timeline/events/${eventId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: draft }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? t("error.comment"));
          return;
        }
        setCommentDrafts((d) => ({ ...d, [eventId]: "" }));
        await refreshEvent(eventId);
      } catch {
        setError(t("error.comment"));
      } finally {
        setBusyEventId(null);
      }
    },
    [commentDrafts, refreshEvent, t],
  );

  const handleDeleteComment = useCallback(
    async (eventId: string, commentId: string) => {
      if (!confirm(t("comment.deleteConfirm"))) return;
      setBusyEventId(eventId);
      try {
        const res = await fetch(`/api/m/timeline/comments/${commentId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setError(t("error.comment"));
          return;
        }
        await refreshEvent(eventId);
      } catch {
        setError(t("error.comment"));
      } finally {
        setBusyEventId(null);
      }
    },
    [refreshEvent, t],
  );

  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/m/timeline?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError(t("error.load"));
        return;
      }
      const json = (await res.json()) as {
        events: TimelineEvent[];
        next_cursor: string | null;
      };
      setEvents((prev) => [...prev, ...json.events]);
      setCursor(json.next_cursor);
    } catch {
      setError(t("error.load"));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, t]);

  if (events.length === 0) {
    return (
      <section className="px-5 pt-10 pb-16 text-center">
        <div
          className="mx-auto grid h-16 w-16 place-items-center rounded-full"
          style={{ background: CREAM }}
          aria-hidden
        >
          <span className="text-[28px]">🌱</span>
        </div>
        <h2 className="mt-4 text-[17px] font-bold" style={{ color: INK }}>
          {t("empty.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-[13px] text-subheading leading-relaxed">
          {t("empty.body")}
        </p>
      </section>
    );
  }

  return (
    <section className="px-4 pt-4 pb-8 space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-900"
        >
          {error}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.key} className="space-y-2.5">
          <h2 className="px-1 text-[12px] font-bold uppercase tracking-wide text-subheading">
            {group.heading}
          </h2>
          {group.events.map((event) => {
            const expanded = expandedId === event.id;
            const canComment = event.seeker_id === currentUserId || true;
            return (
              <TimelineEventCard
                key={event.id}
                event={event}
                t={t}
                canComment={canComment}
                onReact={handleReact}
                onToggleComments={handleToggleComments}
                expanded={expanded}
                busy={busyEventId === event.id}
              >
                <CommentThread
                  event={event}
                  t={t}
                  draft={commentDrafts[event.id] ?? ""}
                  busy={busyEventId === event.id}
                  onDraftChange={(value) =>
                    setCommentDrafts((d) => ({ ...d, [event.id]: value }))
                  }
                  onSubmit={() => handleSubmitComment(event.id)}
                  onDelete={(commentId) =>
                    handleDeleteComment(event.id, commentId)
                  }
                />
              </TimelineEventCard>
            );
          })}
        </div>
      ))}

      {cursor && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-full border border-line px-5 py-2 text-[13px] font-semibold text-subheading disabled:opacity-50"
          >
            {loadingMore ? t("loadMore.loading") : t("loadMore.label")}
          </button>
        </div>
      )}
    </section>
  );
}

function CommentThread({
  event,
  t,
  draft,
  busy,
  onDraftChange,
  onSubmit,
  onDelete,
}: {
  event: TimelineEvent;
  t: (key: string, vars?: Record<string, string | number>) => string;
  draft: string;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onDelete: (commentId: string) => void;
}) {
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      {event.comments.length === 0 ? (
        <p className="text-[12px] text-subheading">{t("comment.none")}</p>
      ) : (
        <ul className="space-y-2.5">
          {event.comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12px]">
                  <span className="font-semibold" style={{ color: INK }}>
                    {c.author_name ?? t("comment.someone")}
                  </span>{" "}
                  <span className="text-subheading">{c.body}</span>
                </p>
              </div>
              {c.is_mine && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  disabled={busy}
                  className="shrink-0 text-[11px] font-semibold text-rose-600 disabled:opacity-50"
                  aria-label={t("comment.delete")}
                >
                  {t("comment.delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={t("comment.placeholder")}
          disabled={busy}
          className="flex-1 rounded-full border border-line px-3.5 py-2 text-[13px] outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {t("comment.send")}
        </button>
      </form>
    </div>
  );
}
