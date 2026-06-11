"use client";

import * as React from "react";
import type {
  TimelineEvent,
  TimelineReactionKind,
} from "@/lib/timeline/types";
import { TIMELINE_REACTION_KINDS } from "@/lib/timeline/types";

/** Brand palette (mirrors tailwind tokens; inlined for the card surfaces). */
const TEAL = "#039EA0";
const CREAM = "#F4EFE6";
const INK = "#0F1416";

const REACTION_EMOJI: Record<TimelineReactionKind, string> = {
  heart: "❤️",
  pray: "🙏",
  thanks: "🙌",
  concern: "😟",
};

const KIND_ACCENT: Record<TimelineEvent["event_type"], string> = {
  "note.created": TEAL,
  "booking.confirmed": "#F4A261",
  "booking.started": "#F4A261",
  "booking.completed": "#2A9D8F",
  "booking.cancelled": "#E76F51",
};

export function eventHeadline(
  event: TimelineEvent,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const actor = event.payload.actor_name ?? t("card.someone");
  switch (event.event_type) {
    case "note.created":
      return t("card.noteCreated", { actor });
    case "booking.confirmed":
      return t("card.bookingConfirmed");
    case "booking.started":
      return t("card.bookingStarted", { actor });
    case "booking.completed":
      return t("card.bookingCompleted", { actor });
    case "booking.cancelled":
      return t("card.bookingCancelled");
  }
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export type TimelineEventCardProps = {
  event: TimelineEvent;
  /** Translator scoped to the `timeline` namespace. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  canComment: boolean;
  onReact: (eventId: string, kind: TimelineReactionKind) => void;
  onToggleComments: (eventId: string) => void;
  expanded: boolean;
  busy?: boolean;
  children?: React.ReactNode;
};

/**
 * Pure-ish event card. Varies its body per event type. The only state it owns
 * is delegated to callbacks (react / toggle comments), so it renders
 * deterministically from props — which is what the component test asserts.
 */
export default function TimelineEventCard({
  event,
  t,
  canComment,
  onReact,
  onToggleComments,
  expanded,
  busy,
  children,
}: TimelineEventCardProps) {
  const accent = KIND_ACCENT[event.event_type];
  const headline = eventHeadline(event, t);

  return (
    <article
      className="rounded-2xl shadow-card overflow-hidden"
      style={{ background: "#fff" }}
      data-event-type={event.event_type}
      data-testid="timeline-event-card"
    >
      <div className="flex">
        <span
          aria-hidden
          className="w-1.5 shrink-0"
          style={{ background: accent }}
        />
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between gap-2">
            <p
              className="text-[14px] font-bold"
              style={{ color: INK }}
            >
              {headline}
            </p>
            <time className="text-[11px] text-subheading shrink-0">
              {timeLabel(event.occurred_at)}
            </time>
          </div>

          {/* Note body */}
          {event.event_type === "note.created" && event.payload.excerpt && (
            <div
              className="mt-2 rounded-xl px-3 py-2 text-[13px] leading-relaxed"
              style={{ background: CREAM, color: INK }}
            >
              {event.payload.excerpt}
              {event.payload.photo_count
                ? ` · ${t("card.photos", { count: event.payload.photo_count })}`
                : ""}
            </div>
          )}
          {event.event_type === "note.created" && event.payload.summary && (
            <p className="mt-2 text-[12px] text-subheading">
              <span className="font-semibold">{t("card.keyPoints")}: </span>
              {event.payload.summary}
            </p>
          )}

          {/* Reaction bar */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {TIMELINE_REACTION_KINDS.map((kind) => {
              const summary = event.reactions.find((r) => r.kind === kind);
              const count = summary?.count ?? 0;
              const mine = summary?.mine ?? false;
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={busy}
                  onClick={() => onReact(event.id, kind)}
                  aria-pressed={mine}
                  aria-label={t(`reaction.${kind}`)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition disabled:opacity-50 ${
                    mine
                      ? "border-primary bg-primary-50 text-primary font-semibold"
                      : "border-line text-subheading"
                  }`}
                >
                  <span aria-hidden>{REACTION_EMOJI[kind]}</span>
                  {count > 0 && <span>{count}</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onToggleComments(event.id)}
              className="ml-auto text-[12px] font-semibold text-primary"
              aria-expanded={expanded}
            >
              {event.comment_count > 0
                ? t("card.commentCount", { count: event.comment_count })
                : canComment
                  ? t("card.addComment")
                  : t("card.noComments")}
            </button>
          </div>

          {expanded && children}
        </div>
      </div>
    </article>
  );
}
