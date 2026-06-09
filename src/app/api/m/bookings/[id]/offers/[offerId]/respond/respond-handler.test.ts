/**
 * Tests for the carer offer-respond handler (gap 17).
 *
 * Drives the pure handler with a stub client that records the update payload,
 * so we assert status transitions / expiry / validation without a live DB.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleRespond,
  parseRespondBody,
  type OfferRow,
  type RespondClient,
} from "./respond-handler";

const NOW = Date.parse("2026-06-09T12:00:00Z");
const FUTURE = new Date(NOW + 5 * 60 * 1000).toISOString();
const PAST = new Date(NOW - 5 * 60 * 1000).toISOString();

type UpdateCall = {
  offerId: string;
  status: OfferRow["status"];
  respondedAt: string;
  declineReason: string | null;
};

function makeClient(
  offer: OfferRow | null,
  calls: UpdateCall[],
): RespondClient {
  return {
    async loadOffer() {
      return offer;
    },
    async updateOffer(args) {
      calls.push(args);
    },
  };
}

function offerRow(over: Partial<OfferRow> = {}): OfferRow {
  return {
    id: "offer-1",
    booking_id: "booking-1",
    carer_id: "carer-1",
    status: "pending",
    expires_at: FUTURE,
    ...over,
  };
}

describe("parseRespondBody", () => {
  it("accepts a valid accept action", () => {
    const r = parseRespondBody({ action: "accept" });
    assert.deepEqual(r, { ok: true, action: "accept", reason: null });
  });

  it("accepts decline with a reason, trimmed + capped", () => {
    const r = parseRespondBody({ action: "decline", reason: "  too far  " });
    assert.equal(r.ok && r.reason, "too far");
  });

  it("decline reason is dropped on accept action", () => {
    const r = parseRespondBody({ action: "accept", reason: "ignored" });
    assert.equal(r.ok && r.reason, null);
  });

  it("empty/whitespace decline reason becomes null", () => {
    const r = parseRespondBody({ action: "decline", reason: "   " });
    assert.equal(r.ok && r.reason, null);
  });

  it("rejects an unknown action", () => {
    const r = parseRespondBody({ action: "maybe" });
    assert.equal(r.ok, false);
  });

  it("rejects a non-object body", () => {
    assert.equal(parseRespondBody(null).ok, false);
    assert.equal(parseRespondBody("nope").ok, false);
  });

  it("rejects a non-string reason", () => {
    const r = parseRespondBody({ action: "decline", reason: 42 });
    assert.equal(r.ok, false);
  });
});

describe("handleRespond", () => {
  const base = {
    bookingId: "booking-1",
    offerId: "offer-1",
    carerId: "carer-1",
    now: NOW,
  };

  it("accepts a pending offer", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls);
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, action: "accept" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, "accepted");
    assert.equal(calls[0].declineReason, null);
  });

  it("declines a pending offer and stores the reason", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls);
    const res = await handleRespond(client, {
      ...base,
      body: { action: "decline", reason: "busy that day" },
    });
    assert.equal(res.status, 200);
    assert.equal(calls[0].status, "declined");
    assert.equal(calls[0].declineReason, "busy that day");
  });

  it("404 when the offer is not found / not the caller's", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(null, calls);
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
  });

  it("409 when the offer is no longer pending", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow({ status: "declined" }), calls);
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 409);
    assert.equal(calls.length, 0);
  });

  it("410 + marks expired when past expires_at", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow({ expires_at: PAST }), calls);
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 410);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, "expired");
  });

  it("400 on an invalid body before any DB read", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls);
    const res = await handleRespond(client, { ...base, body: { action: "nope" } });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
});
