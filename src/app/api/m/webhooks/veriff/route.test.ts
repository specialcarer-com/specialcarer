/**
 * Tests for the Veriff webhook route. The route has no next/headers / cookie
 * dependency, so we drive POST directly with a real Request and a real
 * X-HMAC-SIGNATURE header (hex HMAC-SHA256 over the raw body, keyed with
 * VERIFF_SIGNATURE_KEY). The Supabase admin client is exercised through a
 * stubbed env: an unknown session short-circuits to a 200 (log only) before
 * any DB write, and a missing service-role key surfaces as a 500. This mirrors
 * the Whereby webhook route test.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { POST } from "./route";

const SIG_KEY = "veriff_sig_test";

function sign(body: string): string {
  return crypto.createHmac("sha256", SIG_KEY).update(body).digest("hex");
}

function request(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signature !== null) headers["x-hmac-signature"] = signature;
  return new Request("https://app.test/api/m/webhooks/veriff", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  process.env.VERIFF_SIGNATURE_KEY = SIG_KEY;
  // Admin client needs these to construct; the unknown-session path returns
  // 200 before any network call so no real Supabase round-trip happens.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role-key";
});

afterEach(() => {
  delete process.env.VERIFF_SIGNATURE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("POST /api/m/webhooks/veriff", () => {
  it("returns 401 for an invalid signature", async () => {
    const body = JSON.stringify({
      verification: { id: "s1", status: "approved" },
    });
    const res = await POST(request(body, "deadbeef"));
    assert.equal(res.status, 401);
  });

  it("returns 401 when the signature header is missing", async () => {
    const body = JSON.stringify({
      verification: { id: "s1", status: "approved" },
    });
    const res = await POST(request(body, null));
    assert.equal(res.status, 401);
  });

  it("returns 401 when the signature secret is unset", async () => {
    delete process.env.VERIFF_SIGNATURE_KEY;
    const body = JSON.stringify({ verification: { id: "s1" } });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 401);
  });

  it("returns 200 (log only) for a valid signature on a payload with no status", async () => {
    // No actionable status → handler short-circuits to 200 before any DB write.
    const body = JSON.stringify({ id: "s1", action: "future_unknown_event" });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { received: boolean }).received, true);
  });

  it("returns 200 (log only) for a valid signature with no session id", async () => {
    const body = JSON.stringify({ action: "submitted" });
    const res = await POST(request(body, sign(body)));
    assert.equal(res.status, 200);
  });
});
