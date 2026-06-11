/**
 * Timeline fan-out tests (gap 41).
 *
 * Pure-logic coverage of the recipient resolver (`computeRecipients`) and the
 * event-title helper, plus the two timeline push variants routed through
 * `buildPayload` so the deeplink + copy contract is locked down.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRecipients, eventTitleFor } from "./fanout-logic";
import { buildPayload } from "@/lib/push/notify";

const SEEKER = "00000000-0000-0000-0000-000000000001";
const MEMBER_A = "00000000-0000-0000-0000-000000000002";
const MEMBER_B = "00000000-0000-0000-0000-000000000003";
const CARER = "00000000-0000-0000-0000-000000000004";
const EVENT = "00000000-0000-0000-0000-0000000000ff";

describe("computeRecipients", () => {
  it("includes the seeker and active members, excludes the actor", () => {
    const out = computeRecipients({
      seekerId: SEEKER,
      members: [
        { userId: MEMBER_A, status: "active" },
        { userId: MEMBER_B, status: "active" },
      ],
      actorId: MEMBER_A,
      carerId: null,
    });
    assert.deepEqual(out.sort(), [SEEKER, MEMBER_B].sort());
  });

  it("skips invited/removed members and null user ids", () => {
    const out = computeRecipients({
      seekerId: SEEKER,
      members: [
        { userId: MEMBER_A, status: "invited" },
        { userId: null, status: "active" },
        { userId: MEMBER_B, status: "removed" },
      ],
      actorId: null,
      carerId: null,
    });
    assert.deepEqual(out, [SEEKER]);
  });

  it("adds the booking carer for events", () => {
    const out = computeRecipients({
      seekerId: SEEKER,
      members: [{ userId: MEMBER_A, status: "active" }],
      actorId: null,
      carerId: CARER,
    });
    assert.ok(out.includes(CARER));
    assert.equal(new Set(out).size, out.length, "no duplicates");
  });

  it("de-dups when the carer is also the actor (carer self-note)", () => {
    const out = computeRecipients({
      seekerId: SEEKER,
      members: [{ userId: MEMBER_A, status: "active" }],
      actorId: CARER,
      carerId: CARER,
    });
    assert.ok(!out.includes(CARER), "actor wins over carer");
    assert.deepEqual(out.sort(), [SEEKER, MEMBER_A].sort());
  });
});

describe("eventTitleFor", () => {
  it("uses the note excerpt (truncated) for note.created", () => {
    const long = "x".repeat(200);
    const title = eventTitleFor("note.created", { excerpt: long });
    assert.equal(title.length, 80);
  });

  it("has a fallback per booking transition", () => {
    assert.match(eventTitleFor("booking.confirmed", {}), /confirmed/i);
    assert.match(eventTitleFor("booking.started", {}), /started/i);
    assert.match(eventTitleFor("booking.completed", {}), /completed/i);
    assert.match(eventTitleFor("booking.cancelled", {}), /cancelled/i);
  });
});

describe("buildPayload — timeline variants", () => {
  it("event_created deeplinks to the event and names the actor", () => {
    const out = buildPayload({
      type: "timeline.event_created",
      recipientId: MEMBER_A,
      eventId: EVENT,
      actorName: "Aisha",
      eventTitle: "Had a lovely walk",
    });
    assert.equal(out.recipientUserId, MEMBER_A);
    assert.equal(out.title, "New activity from Aisha");
    assert.equal(out.body, "Had a lovely walk");
    assert.equal(out.deeplink, `/m/timeline?event=${EVENT}`);
  });

  it("comment_created falls back to a generic title without an actor", () => {
    const out = buildPayload({
      type: "timeline.comment_created",
      recipientId: SEEKER,
      eventId: EVENT,
      actorName: null,
      commentPreview: "Thank you so much",
    });
    assert.equal(out.title, "New comment");
    assert.equal(out.deeplink, `/m/timeline?event=${EVENT}`);
  });
});
