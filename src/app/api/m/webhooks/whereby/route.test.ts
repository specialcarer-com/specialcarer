/**
 * Tests for the Whereby webhook route. The route has no next/headers / cookie
 * dependency, so we drive POST directly with a real Request and a real
 * "Whereby-Signature" header ("t=<unix_seconds>,v1=<hex_hmac>") computed against
 * WHEREBY_WEBHOOK_SECRET.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { POST } from "./route";

const SECRET = "whsec_test";

function sign(body: string, t: number = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto
    .createHmac("sha256", SECRET)
    .update(`${t}.${body}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

function request(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signature !== null) headers["whereby-signature"] = signature;
  return new Request("https://app.test/api/m/webhooks/whereby", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  process.env.WHEREBY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.WHEREBY_WEBHOOK_SECRET;
});

describe("POST /api/m/webhooks/whereby", () => {
  it("returns 200 for a valid signature + known event", async () => {
    const body = JSON.stringify({ type: "room.client.joined" });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { received: boolean }).received, true);
  });

  it("returns 200 for a valid signature + unknown event", async () => {
    const body = JSON.stringify({ type: "some.future.event" });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 200);
  });

  it("returns 200 for a recording.finished event", async () => {
    const body = JSON.stringify({ type: "recording.finished" });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 200);
  });

  it("returns 401 for an invalid signature", async () => {
    const body = JSON.stringify({ type: "room.client.left" });
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(request(body, `t=${ts},v1=deadbeef`));
    assert.equal(res.status, 401);
  });

  it("returns 401 for a stale timestamp (replay protection)", async () => {
    const body = JSON.stringify({ type: "room.client.left" });
    const stale = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(request(body, sign(body, stale)));
    assert.equal(res.status, 401);
  });

  it("returns 401 when the signature header is missing", async () => {
    const body = JSON.stringify({ type: "room.client.left" });
    const res = await POST(request(body, null));
    assert.equal(res.status, 401);
  });

  it("returns 401 when the secret is unset (cannot verify)", async () => {
    delete process.env.WHEREBY_WEBHOOK_SECRET;
    const body = JSON.stringify({ type: "room.client.joined" });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 401);
  });
});
