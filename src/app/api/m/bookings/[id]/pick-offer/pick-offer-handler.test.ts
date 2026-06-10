/**
 * Tests for the seeker pick-offer handler. Drives the pure handler with a
 * stub that simulates the seeker_pick_offer RPC outcome.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handlePick,
  parsePickBody,
  type PickClient,
  type PickResult,
  type PickRpcResult,
} from "./pick-offer-handler";

function okBody(res: PickResult): Extract<PickResult["body"], { ok: true }> {
  assert.ok("ok" in res.body && res.body.ok === true, "expected an ok body");
  return res.body;
}

function makeClient(
  result: PickRpcResult,
  onConfirmedCalls: PickRpcResult[] = [],
): PickClient {
  return {
    async pickOffer() {
      return result;
    },
    onConfirmed: ({ rpc }) => {
      onConfirmedCalls.push(rpc);
    },
  };
}

describe("parsePickBody", () => {
  it("requires a non-empty offerId", () => {
    assert.equal(parsePickBody({}).ok, false);
    assert.equal(parsePickBody({ offerId: "" }).ok, false);
    assert.equal(parsePickBody({ offerId: 5 }).ok, false);
    assert.equal(parsePickBody(null).ok, false);
  });

  it("accepts a valid offerId", () => {
    const r = parsePickBody({ offerId: "abc" });
    assert.deepEqual(r, { ok: true, offerId: "abc" });
  });
});

describe("handlePick", () => {
  const base = { bookingId: "b1" };

  it("400 on a missing offerId", async () => {
    const res = await handlePick(makeClient({ result: "confirmed" }), {
      ...base,
      body: {},
    });
    assert.equal(res.status, 400);
  });

  it("200 with outcome on a successful confirm + fires onConfirmed", async () => {
    const seen: PickRpcResult[] = [];
    const client = makeClient(
      { result: "confirmed", booking_id: "b1", carer_id: "c2", mode: "scheduled" },
      seen,
    );
    const res = await handlePick(client, { ...base, body: { offerId: "o2" } });
    assert.equal(res.status, 200);
    const body = okBody(res);
    assert.equal(body.outcome.result, "confirmed");
    assert.equal(body.outcome.carer_id, "c2");
    assert.equal(seen.length, 1);
  });

  it("409 when the booking is already confirmed (no onConfirmed)", async () => {
    const seen: PickRpcResult[] = [];
    const client = makeClient({ result: "already_confirmed", booking_id: "b1" }, seen);
    const res = await handlePick(client, { ...base, body: { offerId: "o2" } });
    assert.equal(res.status, 409);
    assert.equal(seen.length, 0);
  });

  it("409 when the offer is in an invalid state", async () => {
    const res = await handlePick(
      makeClient({ result: "invalid_state", status: "declined" }),
      { ...base, body: { offerId: "o2" } },
    );
    assert.equal(res.status, 409);
  });
});
