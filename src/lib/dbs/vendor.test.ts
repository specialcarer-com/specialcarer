/**
 * Unit tests for the DBS application vendor adapter.
 * Runs under tsx via the `test` npm script.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  MockDbsVendor,
  DbsRestVendor,
  DbsApiError,
  mapDbsStatus,
  mapDbsUpdateServiceStatus,
} from "./vendor";

const carerDetails = {
  legalName: "Alex Carer",
  dateOfBirth: "1990-04-12",
  surname: "Carer",
};

describe("MockDbsVendor", () => {
  let vendor: MockDbsVendor;
  beforeEach(() => {
    vendor = new MockDbsVendor();
  });

  it("mints a fresh reference per application and starts 'submitted'", async () => {
    const a = await vendor.submitApplication({
      carerId: "11111111-2222-3333-4444-555555555555",
      kind: "adult",
      carerDetails,
    });
    const b = await vendor.submitApplication({
      carerId: "11111111-2222-3333-4444-555555555555",
      kind: "child",
      carerDetails,
    });
    assert.notEqual(a.vendorReference, b.vendorReference);
    const status = await vendor.getStatus(a.vendorReference);
    assert.equal(status.status, "submitted");
  });

  it("walks a scripted transition queue one step per getStatus call", async () => {
    const { vendorReference } = await vendor.submitApplication({
      carerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      kind: "adult",
      carerDetails,
    });
    vendor.configure(vendorReference, {
      transitions: ["in_progress", "approved"],
    });
    assert.equal((await vendor.getStatus(vendorReference)).status, "in_progress");
    const approved = await vendor.getStatus(vendorReference);
    assert.equal(approved.status, "approved");
    assert.ok(approved.decisionAt instanceof Date);
    assert.ok(
      approved.certificateNumber && approved.certificateNumber.length > 0,
    );
  });

  it("sticks on the final status after the queue is exhausted", async () => {
    const { vendorReference } = await vendor.submitApplication({
      carerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      kind: "child",
      carerDetails,
    });
    vendor.configure(vendorReference, { transitions: ["rejected"] });
    assert.equal((await vendor.getStatus(vendorReference)).status, "rejected");
    // Repeated calls stay rejected.
    assert.equal((await vendor.getStatus(vendorReference)).status, "rejected");
  });

  it("throws on an unknown reference", async () => {
    await assert.rejects(() => vendor.getStatus("nope"), /unknown vendorReference/);
  });

  it("getUpdateServiceStatus defaults to clear, configurable in tests", async () => {
    assert.equal((await vendor.getUpdateServiceStatus("001")).status, "clear");
    vendor.configureUpdateService("001", "invalidated");
    assert.equal((await vendor.getUpdateServiceStatus("001")).status, "invalidated");
  });

  it("reset() clears all state", async () => {
    const { vendorReference } = await vendor.submitApplication({
      carerId: "x",
      kind: "adult",
      carerDetails,
    });
    vendor.reset();
    await assert.rejects(() => vendor.getStatus(vendorReference));
  });
});

// ── Status maps ──────────────────────────────────────────────────────────────

describe("DBS REST status maps", () => {
  it("maps application status codes", () => {
    assert.equal(mapDbsStatus("submitted"), "submitted");
    assert.equal(mapDbsStatus("processing"), "in_progress");
    assert.equal(mapDbsStatus("complete"), "approved");
    assert.equal(mapDbsStatus("declined"), "rejected");
    assert.equal(mapDbsStatus("expired"), "expired");
    // Unknown → in_progress (safe for a safeguarding gate).
    assert.equal(mapDbsStatus("wat"), "in_progress");
  });

  it("maps update service results", () => {
    assert.equal(mapDbsUpdateServiceStatus("clear"), "clear");
    assert.equal(mapDbsUpdateServiceStatus("changed"), "change_pending");
    assert.equal(mapDbsUpdateServiceStatus("revoked"), "invalidated");
    // Unknown → change_pending (conservative).
    assert.equal(mapDbsUpdateServiceStatus("wat"), "change_pending");
  });
});

// ── DbsRestVendor (real, with mocked fetch) ───────────────────────────────────

const realFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DbsRestVendor", () => {
  beforeEach(() => {
    // Clear legacy fallbacks so a leaked env var can't satisfy the
    // "throws when DBS_API_KEY is missing" expectation.
    delete process.env.UCHECK_API_KEY;
    delete process.env.UCHECK_API_BASE;
    delete process.env.UCHECK_TIMEOUT_MS;
    process.env.DBS_API_KEY = "test-key";
    process.env.DBS_API_BASE = "https://sandbox.ucheck.test/v1";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.DBS_API_KEY;
    delete process.env.DBS_API_BASE;
    delete process.env.DBS_TIMEOUT_MS;
  });

  it("submitApplication posts and returns the vendor reference", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse(201, { reference: "UC-123" });
    }) as typeof fetch;

    const vendor = new DbsRestVendor();
    const res = await vendor.submitApplication({
      carerId: "carer-1",
      kind: "adult",
      carerDetails,
    });
    assert.equal(res.vendorReference, "UC-123");
    const seen = captured as { url: string; init: RequestInit } | null;
    assert.ok(seen);
    assert.equal(seen.init.method, "POST");
    assert.match(seen.url, /\/applications$/);
    const headers = seen.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-key");
  });

  it("getStatus maps the DBS partner status code", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(200, {
        status: "complete",
        completedAt: "2026-01-01T00:00:00Z",
        certificate: { number: "001234567890" },
      })) as typeof fetch;

    const vendor = new DbsRestVendor();
    const res = await vendor.getStatus("UC-123");
    assert.equal(res.status, "approved");
    assert.equal(res.certificateNumber, "001234567890");
    assert.ok(res.decisionAt instanceof Date);
  });

  it("retries on 5xx then succeeds (3 attempts allowed)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 3) return jsonResponse(503, { error: "down" });
      return jsonResponse(200, { result: "clear" });
    }) as typeof fetch;

    const vendor = new DbsRestVendor();
    const res = await vendor.getUpdateServiceStatus("001234567890");
    assert.equal(calls, 3);
    assert.equal(res.status, "clear");
  });

  it("fails fast on 4xx without retrying", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse(404, { error: "not found" });
    }) as typeof fetch;

    const vendor = new DbsRestVendor();
    await assert.rejects(() => vendor.getStatus("missing"), DbsApiError);
    assert.equal(calls, 1);
  });

  it("surfaces a timeout (AbortError) as a retried failure", async () => {
    process.env.DBS_TIMEOUT_MS = "20";
    let calls = 0;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      calls += 1;
      // Simulate the AbortController firing — reject like fetch does on abort.
      const signal = init.signal as AbortSignal | undefined;
      return await new Promise<Response>((_resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }
      });
    }) as typeof fetch;

    const vendor = new DbsRestVendor();
    await assert.rejects(() => vendor.getStatus("slow"), DbsApiError);
    // 3 attempts, each aborted.
    assert.equal(calls, 3);
  });

  it("throws on a malformed (non-JSON) success body", async () => {
    globalThis.fetch = (async () =>
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;

    const vendor = new DbsRestVendor();
    await assert.rejects(() => vendor.getStatus("UC-1"));
  });

  it("throws when DBS_API_KEY is missing", async () => {
    delete process.env.DBS_API_KEY;
    globalThis.fetch = (async () => jsonResponse(200, {})) as typeof fetch;
    const vendor = new DbsRestVendor();
    await assert.rejects(() => vendor.getStatus("UC-1"), /DBS_API_KEY/);
  });
});
