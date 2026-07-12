/**
 * Unit tests for Whereby webhook signature verification and event recognition.
 *
 * Whereby sends "Whereby-Signature: t=<unix_seconds>,v1=<hex_hmac>" where the
 * HMAC-SHA256 is computed over `${t}.${rawBody}`. We pass an explicit `now`
 * into verifyWherebySignature so timestamp/replay assertions are deterministic.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  verifyWherebySignature,
  isKnownWebhookEvent,
  KNOWN_WEBHOOK_EVENTS,
} from "./webhook";

const SECRET = "whsec_test";
const NOW_MS = 1_700_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

function hmac(secret: string, t: number, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
}

function header(t: number, body: string, secret: string = SECRET): string {
  return `t=${t},v1=${hmac(secret, t, body)}`;
}

beforeEach(() => {
  process.env.WHEREBY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.WHEREBY_WEBHOOK_SECRET;
});

describe("verifyWherebySignature", () => {
  const body = JSON.stringify({ type: "room.client.joined" });

  it("returns true for a valid signature with a recent timestamp", () => {
    assert.equal(verifyWherebySignature(body, header(NOW_S, body), NOW_MS), true);
  });

  it("returns false when the timestamp is more than 5 minutes old", () => {
    const t = NOW_S - 301;
    assert.equal(verifyWherebySignature(body, header(t, body), NOW_MS), false);
  });

  it("returns false when the timestamp is more than 5 minutes in the future", () => {
    const t = NOW_S + 301;
    assert.equal(verifyWherebySignature(body, header(t, body), NOW_MS), false);
  });

  it("returns true at the edge of the allowed window", () => {
    assert.equal(verifyWherebySignature(body, header(NOW_S - 300, body), NOW_MS), true);
    assert.equal(verifyWherebySignature(body, header(NOW_S + 300, body), NOW_MS), true);
  });

  it("accepts a timestamp exactly 300s old when now has sub-second ms", () => {
    const nowWithMs = NOW_MS + 999;
    const t = NOW_S - 300;
    assert.equal(verifyWherebySignature(body, header(t, body), nowWithMs), true);
  });

  it("rejects a timestamp 301s old even when now has sub-second ms", () => {
    const nowWithMs = NOW_MS + 999;
    const t = NOW_S - 301;
    assert.equal(verifyWherebySignature(body, header(t, body), nowWithMs), false);
  });

  it("returns false for a missing header", () => {
    assert.equal(verifyWherebySignature(body, null, NOW_MS), false);
  });

  it("returns false for an empty header", () => {
    assert.equal(verifyWherebySignature(body, "", NOW_MS), false);
  });

  it("returns false when t= is missing", () => {
    const v1 = hmac(SECRET, NOW_S, body);
    assert.equal(verifyWherebySignature(body, `v1=${v1}`, NOW_MS), false);
  });

  it("returns false when v1= is missing", () => {
    assert.equal(verifyWherebySignature(body, `t=${NOW_S}`, NOW_MS), false);
  });

  it("returns false (no throw) for non-hex v1", () => {
    assert.doesNotThrow(() => {
      const ok = verifyWherebySignature(body, `t=${NOW_S},v1=zzzz`, NOW_MS);
      assert.equal(ok, false);
    });
  });

  it("returns false for a non-numeric timestamp", () => {
    const v1 = hmac(SECRET, NOW_S, body);
    assert.equal(verifyWherebySignature(body, `t=abc,v1=${v1}`, NOW_MS), false);
  });

  it("returns false when signed with the wrong secret", () => {
    const bad = `t=${NOW_S},v1=${hmac("wrong-secret", NOW_S, body)}`;
    assert.equal(verifyWherebySignature(body, bad, NOW_MS), false);
  });

  it("returns false when the body differs from what was signed", () => {
    const sig = header(NOW_S, body);
    const tampered = JSON.stringify({ type: "room.client.left" });
    assert.equal(verifyWherebySignature(tampered, sig, NOW_MS), false);
  });

  it("returns false when the secret is unset", () => {
    delete process.env.WHEREBY_WEBHOOK_SECRET;
    assert.equal(verifyWherebySignature(body, header(NOW_S, body), NOW_MS), false);
  });
});

describe("isKnownWebhookEvent", () => {
  it("returns true for each known event", () => {
    for (const type of KNOWN_WEBHOOK_EVENTS) {
      assert.equal(isKnownWebhookEvent(type), true);
    }
  });

  it("knows exactly the five MVP events", () => {
    assert.deepEqual(
      [...KNOWN_WEBHOOK_EVENTS].sort(),
      [
        "recording.finished",
        "room.client.joined",
        "room.client.left",
        "room.session.ended",
        "room.session.started",
      ],
    );
  });

  it("returns false for recording.ready (the old wrong name)", () => {
    assert.equal(isKnownWebhookEvent("recording.ready"), false);
  });

  it("returns false for other unknown events", () => {
    assert.equal(isKnownWebhookEvent("transcription.started"), false);
    assert.equal(isKnownWebhookEvent("assistant.requested"), false);
    assert.equal(isKnownWebhookEvent("totally.made.up"), false);
  });
});
