/**
 * Unit tests for the Veriff client wrapper. The global fetch is stubbed so we
 * assert URL, headers (X-AUTH-CLIENT + X-HMAC-SIGNATURE), payload, and error
 * mapping without real network calls. Mirrors the Whereby client test pattern.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  createSession,
  getDecision,
  signPayload,
  VeriffApiError,
} from "../veriff";

type FetchCall = { url: string; init: RequestInit };

const realFetch = globalThis.fetch;
let calls: FetchCall[] = [];

const API_KEY = "pub-key-123";
const SIG_KEY = "sig-key-456";

function stubFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    return responder(url, init ?? {});
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hmac(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

beforeEach(() => {
  calls = [];
  process.env.VERIFF_API_KEY = API_KEY;
  process.env.VERIFF_SIGNATURE_KEY = SIG_KEY;
  process.env.VERIFF_BASE_URL = "https://veriff.example.test";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.VERIFF_API_KEY;
  delete process.env.VERIFF_SIGNATURE_KEY;
  delete process.env.VERIFF_BASE_URL;
});

describe("createSession", () => {
  it("POSTs to /v1/sessions with auth + body-signed HMAC headers", async () => {
    stubFetch(() =>
      jsonResponse({
        status: "success",
        verification: {
          id: "sess-1",
          url: "https://magic.veriff.me/v/abc",
          vendorData: "user-1",
          status: "created",
        },
      }),
    );

    const s = await createSession({
      person: { firstName: "Ada", lastName: "Lovelace" },
      vendorData: "user-1",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://veriff.example.test/v1/sessions");
    assert.equal(calls[0].init.method, "POST");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["X-AUTH-CLIENT"], API_KEY);
    assert.equal(headers["Content-Type"], "application/json");
    // POST signs the raw JSON body.
    const sentBody = String(calls[0].init.body);
    assert.equal(headers["X-HMAC-SIGNATURE"], hmac(SIG_KEY, sentBody));

    const parsed = JSON.parse(sentBody);
    assert.equal(parsed.verification.vendorData, "user-1");
    assert.equal(parsed.verification.person.firstName, "Ada");
    assert.equal(parsed.verification.person.lastName, "Lovelace");

    assert.equal(s.id, "sess-1");
    assert.equal(s.url, "https://magic.veriff.me/v/abc");
  });

  it("includes the callback when provided", async () => {
    stubFetch(() =>
      jsonResponse({
        status: "success",
        verification: { id: "s", url: "u" },
      }),
    );
    await createSession({
      person: {},
      vendorData: "user-2",
      callback: "https://app.test/m/identity/complete",
    });
    const parsed = JSON.parse(String(calls[0].init.body));
    assert.equal(
      parsed.verification.callback,
      "https://app.test/m/identity/complete",
    );
  });

  it("defaults the base URL when VERIFF_BASE_URL is unset", async () => {
    delete process.env.VERIFF_BASE_URL;
    stubFetch(() =>
      jsonResponse({ status: "success", verification: { id: "s", url: "u" } }),
    );
    await createSession({ person: {}, vendorData: "x" });
    assert.ok(
      calls[0].url.startsWith("https://stationapi.veriff.com/v1/sessions"),
    );
  });

  it("maps a non-2xx response to VeriffApiError with status + body", async () => {
    stubFetch(() => jsonResponse({ status: "fail", message: "bad key" }, 401));
    await assert.rejects(createSession({ person: {}, vendorData: "x" }), (e) => {
      assert.ok(e instanceof VeriffApiError);
      assert.equal(e.status, 401);
      assert.equal(e.message, "bad key");
      return true;
    });
  });

  it("throws VeriffApiError(0) when the API key is missing", async () => {
    delete process.env.VERIFF_API_KEY;
    await assert.rejects(createSession({ person: {}, vendorData: "x" }), (e) => {
      assert.ok(e instanceof VeriffApiError);
      assert.equal(e.status, 0);
      return true;
    });
  });

  it("throws when the response is missing the verification object", async () => {
    stubFetch(() => jsonResponse({ status: "success" }));
    await assert.rejects(createSession({ person: {}, vendorData: "x" }));
  });
});

describe("getDecision", () => {
  it("GETs /v1/sessions/:id/decision with the sessionId-signed HMAC", async () => {
    stubFetch(() =>
      jsonResponse({ status: "success", verification: { status: "approved" } }),
    );
    const d = await getDecision("sess-9");
    assert.equal(
      calls[0].url,
      "https://veriff.example.test/v1/sessions/sess-9/decision",
    );
    assert.equal(calls[0].init.method, "GET");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["X-AUTH-CLIENT"], API_KEY);
    // GET signs the session id, not a body.
    assert.equal(headers["X-HMAC-SIGNATURE"], hmac(SIG_KEY, "sess-9"));
    assert.equal(d.status, "success");
  });

  it("maps a 404 to VeriffApiError", async () => {
    stubFetch(() => jsonResponse({ message: "not found" }, 404));
    await assert.rejects(getDecision("missing"), (e) => {
      assert.ok(e instanceof VeriffApiError);
      assert.equal(e.status, 404);
      return true;
    });
  });
});

describe("signPayload", () => {
  it("produces lower-case hex hmac-sha256 of the payload", () => {
    assert.equal(signPayload("hello"), hmac(SIG_KEY, "hello"));
  });
});
