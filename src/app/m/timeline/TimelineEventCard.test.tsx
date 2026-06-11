/**
 * TimelineEventCard render test (gap 41).
 *
 * Renders the card to static markup for each event type and asserts the
 * headline copy, the data-event-type marker, and the full reaction bar are
 * present. Uses a passthrough translator so we test layout, not i18n wiring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TimelineEventCard, { eventHeadline } from "./TimelineEventCard";
import type { TimelineEvent, TimelineEventType } from "@/lib/timeline/types";

/** Translator that echoes the key and appends any vars, for stable assertions. */
function t(key: string, vars?: Record<string, string | number>): string {
  if (!vars) return key;
  const parts = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${key}(${parts})`;
}

function makeEvent(type: TimelineEventType): TimelineEvent {
  return {
    id: `evt-${type}`,
    family_id: "fam-1",
    seeker_id: "seeker-1",
    event_type: type,
    booking_id: type.startsWith("booking") ? "bk-1" : null,
    actor_id: "actor-1",
    payload: { actor_name: "Aisha", excerpt: "A short note" },
    occurred_at: "2026-06-11T10:00:00.000Z",
    comments: [],
    comment_count: 0,
    reactions: [],
  };
}

const TYPES: TimelineEventType[] = [
  "note.created",
  "booking.confirmed",
  "booking.started",
  "booking.completed",
  "booking.cancelled",
];

function render(event: TimelineEvent): string {
  return renderToStaticMarkup(
    h(TimelineEventCard, {
      event,
      t,
      canComment: true,
      onReact: () => {},
      onToggleComments: () => {},
      expanded: false,
    }),
  );
}

test("renders a headline and the type marker for every event type", () => {
  for (const type of TYPES) {
    const event = makeEvent(type);
    const html = render(event);
    assert.match(
      html,
      new RegExp(`data-event-type="${type}"`),
      `${type} marker`,
    );
    assert.ok(
      html.includes(eventHeadline(event, t)),
      `${type} headline present`,
    );
  }
});

test("renders all four reaction buttons", () => {
  const html = render(makeEvent("note.created"));
  assert.match(html, /aria-label="reaction\.heart"/);
  assert.match(html, /aria-label="reaction\.pray"/);
  assert.match(html, /aria-label="reaction\.thanks"/);
  assert.match(html, /aria-label="reaction\.concern"/);
});

test("shows the note excerpt only for note.created", () => {
  assert.ok(render(makeEvent("note.created")).includes("A short note"));
  assert.ok(!render(makeEvent("booking.started")).includes("A short note"));
});

test("comment toggle label reflects count + permission", () => {
  const withComments = { ...makeEvent("note.created"), comment_count: 3 };
  assert.ok(render(withComments).includes("card.commentCount(count=3)"));

  const noneCanComment = render(makeEvent("note.created"));
  assert.ok(noneCanComment.includes("card.addComment"));
});
