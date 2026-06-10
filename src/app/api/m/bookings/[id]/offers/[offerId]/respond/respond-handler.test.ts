/**
 * Tests for the carer offer-respond handler (gap 17 + accept→booking loop).
 *
 * Drives the pure handler with an in-memory client that simulates the
 * accept_match_offer RPC (first-accept-wins for "Now", seeker-pick for
 * "Scheduled"). No live DB needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleRespond,
  parseRespondBody,
  type AcceptRpcResult,
  type OfferRow,
  type RespondClient,
  type RespondResult,
} from "./respond-handler";

/** Narrow a RespondResult to its success body for assertions. */
function okBody(
  res: RespondResult,
): Extract<RespondResult["body"], { ok: true }> {
  assert.ok("ok" in res.body && res.body.ok === true, "expected an ok body");
  return res.body;
}

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
  acceptResult: AcceptRpcResult = { result: "pending_seeker_pick" },
): RespondClient {
  return {
    async loadOffer() {
      return offer;
    },
    async updateOffer(args) {
      calls.push(args);
    },
    async acceptOffer() {
      return acceptResult;
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

  it("accept on a NOW booking returns instant_confirm and does not double-update the offer", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls, {
      result: "instant_confirm",
      booking_id: "booking-1",
      mode: "now",
    });
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 200);
    const body = okBody(res);
    assert.equal(body.action, "accept");
    assert.ok(body.action === "accept" && body.outcome.result === "instant_confirm");
    // The RPC owns the offer write; the handler must not also updateOffer.
    assert.equal(calls.length, 0);
  });

  it("accept on a SCHEDULED booking returns pending_seeker_pick", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls, {
      result: "pending_seeker_pick",
      booking_id: "booking-1",
      mode: "scheduled",
    });
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 200);
    const body = okBody(res);
    assert.ok(body.action === "accept");
    assert.equal(body.outcome.result, "pending_seeker_pick");
    assert.equal(body.outcome.mode, "scheduled");
  });

  it("accept that lost the NOW race surfaces result 'lost' with 200", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls, {
      result: "lost",
      booking_id: "booking-1",
      mode: "now",
    });
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 200);
    const body = okBody(res);
    assert.ok(body.action === "accept");
    assert.equal(body.outcome.result, "lost");
  });

  it("fires onAccepted with the offer + rpc result", async () => {
    const calls: UpdateCall[] = [];
    const seen: AcceptRpcResult[] = [];
    const client = makeClient(offerRow(), calls, {
      result: "instant_confirm",
      booking_id: "booking-1",
      mode: "now",
    });
    client.onAccepted = ({ rpc }) => {
      seen.push(rpc);
    };
    await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].result, "instant_confirm");
  });

  it("declines a pending offer and stores the reason", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls);
    const res = await handleRespond(client, {
      ...base,
      body: { action: "decline", reason: "busy that day" },
    });
    assert.equal(res.status, 200);
    okBody(res);
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

  it("410 when the RPC reports the offer expired under its lock", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls, { result: "expired" });
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 410);
  });

  it("409 when the RPC reports an invalid state under its lock", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls, {
      result: "invalid_state",
      status: "declined",
    });
    const res = await handleRespond(client, { ...base, body: { action: "accept" } });
    assert.equal(res.status, 409);
  });

  it("400 on an invalid body before any DB read", async () => {
    const calls: UpdateCall[] = [];
    const client = makeClient(offerRow(), calls);
    const res = await handleRespond(client, { ...base, body: { action: "nope" } });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
});
