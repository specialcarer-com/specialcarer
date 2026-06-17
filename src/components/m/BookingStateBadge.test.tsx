/**
 * <BookingStateBadge> render tests (PR-R3).
 *
 * Renders to static markup (node:test + react-dom/server, the same harness as
 * CarerCard.test.tsx) and asserts the label, palette and data marker for every
 * lifecycle state, plus the canonical-status mapping helper.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BookingStateBadge,
  BOOKING_STATES,
  bookingStateLabel,
  bookingStateFromStatus,
  type BookingState,
} from "./BookingStateBadge";

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

const EXPECTED_LABEL: Record<BookingState, string> = {
  requested: "Requested",
  accepted: "Confirmed",
  in_progress: "In progress now",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

test("renders the correct label and data marker for every state", () => {
  for (const state of BOOKING_STATES) {
    const html = render(h(BookingStateBadge, { state }));
    assert.match(
      html,
      new RegExp(EXPECTED_LABEL[state].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${state}: label`,
    );
    assert.match(
      html,
      new RegExp(`data-booking-state="${state}"`),
      `${state}: marker`,
    );
  }
});

test("bookingStateLabel returns the expected label for every state", () => {
  for (const state of BOOKING_STATES) {
    assert.equal(bookingStateLabel(state), EXPECTED_LABEL[state]);
  }
});

test("each state renders a distinct background colour", () => {
  const seen = new Set<string>();
  for (const state of BOOKING_STATES) {
    const html = render(h(BookingStateBadge, { state }));
    const m = html.match(/background-color:\s*([^;"]+)/i);
    assert.ok(m, `${state}: has a background colour`);
    const colour = m![1].trim().toLowerCase();
    assert.ok(!seen.has(colour), `${state}: colour ${colour} is unique`);
    seen.add(colour);
  }
  assert.equal(seen.size, BOOKING_STATES.length);
});

test("size prop switches the padding/text scale", () => {
  const sm = render(h(BookingStateBadge, { state: "accepted", size: "sm" }));
  const md = render(h(BookingStateBadge, { state: "accepted", size: "md" }));
  assert.match(sm, /text-\[11px\]/);
  assert.match(md, /text-\[12px\]/);
});

test("className is forwarded onto the badge", () => {
  const html = render(
    h(BookingStateBadge, { state: "completed", className: "mt-2" }),
  );
  assert.match(html, /mt-2/);
});

test("bookingStateFromStatus maps canonical enum values to lifecycle states", () => {
  assert.equal(bookingStateFromStatus("pending"), "requested");
  assert.equal(bookingStateFromStatus("accepted"), "accepted");
  assert.equal(bookingStateFromStatus("paid"), "accepted");
  assert.equal(bookingStateFromStatus("in_progress"), "in_progress");
  assert.equal(bookingStateFromStatus("completed"), "completed");
  assert.equal(bookingStateFromStatus("paid_out"), "completed");
  assert.equal(bookingStateFromStatus("cancelled"), "cancelled");
  assert.equal(bookingStateFromStatus("refunded"), "cancelled");
  assert.equal(bookingStateFromStatus("disputed"), "disputed");
});

test("bookingStateFromStatus returns null for unknown/empty status", () => {
  assert.equal(bookingStateFromStatus("something_else"), null);
  assert.equal(bookingStateFromStatus(null), null);
  assert.equal(bookingStateFromStatus(undefined), null);
  assert.equal(bookingStateFromStatus(""), null);
});
