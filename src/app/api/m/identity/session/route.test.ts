/**
 * Adapter test for the identity session route.
 *
 * The POST route handler resolves the caller from cookies (next/headers), which
 * cannot be driven outside a request scope under node:test — the same reason
 * the Whereby interview room route has no route.test (its logic is covered by
 * room-handler.test.ts). The request-independent half of this route is the
 * Supabase + Veriff *adapter* (buildIdentityClient); we exercise that here with
 * a stubbed global fetch and stubbed Supabase env so the Veriff call shape and
 * the row-mapping are verified end to end. The pure handler logic
 * (flag gate / idempotency / status codes) is covered in
 * identity-handler.test.ts.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { buildIdentityClient } from "@/lib/identity/adapter";

type FetchCall = { url: string; init: RequestInit };

const realFetch = globalThis.fetch;
let calls: FetchCall[] = [];

const API_KEY = "pub-key";
const SIG_KEY = "sig-key";

function stubFetch(responder: (url: string) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    return responder(url);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  process.env.VERIFF_API_KEY = API_KEY;
  process.env.VERIFF_SIGNATURE_KEY = SIG_KEY;
  process.env.VERIFF_BASE_URL = "https://veriff.example.test";
  // buildIdentityClient → createAdminClient needs these to construct. The
  // Supabase JS client is lazy: no network until a query is awaited, and this
  // test only awaits createSession (which hits our stubbed fetch for the
  // profiles read + the Veriff POST). We assert on the Veriff call.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.VERIFF_API_KEY;
  delete process.env.VERIFF_SIGNATURE_KEY;
  delete process.env.VERIFF_BASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("identity session adapter (buildIdentityClient)", () => {
  it("createSession reads the profile then POSTs a signed session to Veriff", async () => {
    stubFetch((url) => {
      // Supabase PostgREST profile read.
      if (url.includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify({ full_name: "Grace Hopper" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Veriff session create.
      return new Response(
        JSON.stringify({
          status: "success",
          verification: { id: "sess-xyz", url: "https://magic.veriff.me/v/x" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = buildIdentityClient();
    const created = await client.createSession({
      userId: "11111111-1111-1111-1111-111111111111",
    });

    assert.equal(created.id, "sess-xyz");
    assert.equal(created.url, "https://magic.veriff.me/v/x");

    const veriffCall = calls.find((c) => c.url.endsWith("/v1/sessions"));
    assert.ok(veriffCall, "expected a Veriff /v1/sessions call");
    const headers = veriffCall.init.headers as Record<string, string>;
    assert.equal(headers["X-AUTH-CLIENT"], API_KEY);
    const body = String(veriffCall.init.body);
    const expectedSig = crypto
      .createHmac("sha256", SIG_KEY)
      .update(body)
      .digest("hex");
    assert.equal(headers["X-HMAC-SIGNATURE"], expectedSig);

    const parsed = JSON.parse(body);
    assert.equal(parsed.verification.vendorData, "11111111-1111-1111-1111-111111111111");
    assert.equal(parsed.verification.person.firstName, "Grace");
    assert.equal(parsed.verification.person.lastName, "Hopper");
  });

  it("exposes the full IdentityClient surface", () => {
    const client = buildIdentityClient();
    assert.equal(typeof client.getLatestForUser, "function");
    assert.equal(typeof client.getById, "function");
    assert.equal(typeof client.getBySessionId, "function");
    assert.equal(typeof client.createSession, "function");
    assert.equal(typeof client.insertRow, "function");
    assert.equal(typeof client.updateFromWebhook, "function");
  });
});
