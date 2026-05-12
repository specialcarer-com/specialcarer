import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFeed, type FeedEvent } from "./digest";

const ev = (
  iso: string,
  type: string,
  bookingId: string | null = null,
): FeedEvent => ({
  ts: iso,
  event_type: type,
  event_data: {},
  booking_id: bookingId,
});

describe("buildFeed", () => {
  it("keeps individual events when there are fewer than 3 in a cluster", () => {
    const items = buildFeed([
      ev("2026-05-12T09:00:00Z", "carer_checked_in", "b1"),
      ev("2026-05-12T13:00:00Z", "carer_checked_out", "b1"),
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0].kind, "event");
  });

  it("collapses 3+ same-day, same-type, same-booking events into one digest", () => {
    const items = buildFeed([
      ev("2026-05-12T09:00:00Z", "carer_checked_in", "b1"),
      ev("2026-05-12T10:00:00Z", "carer_checked_in", "b1"),
      ev("2026-05-12T11:00:00Z", "carer_checked_in", "b1"),
      ev("2026-05-12T13:00:00Z", "carer_checked_out", "b1"),
    ]);
    const digests = items.filter((i) => i.kind === "digest");
    const events = items.filter((i) => i.kind === "event");
    assert.equal(digests.length, 1);
    assert.equal(events.length, 1);
    if (digests[0].kind === "digest") {
      assert.equal(digests[0].count, 3);
      assert.equal(digests[0].children.length, 3);
    }
  });

  it("does not merge events from different bookings on the same day", () => {
    const items = buildFeed([
      ev("2026-05-12T09:00:00Z", "carer_checked_in", "b1"),
      ev("2026-05-12T10:00:00Z", "carer_checked_in", "b2"),
      ev("2026-05-12T11:00:00Z", "carer_checked_in", "b3"),
    ]);
    assert.equal(items.length, 3);
    assert.ok(items.every((i) => i.kind === "event"));
  });
});
