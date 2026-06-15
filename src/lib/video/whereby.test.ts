/**
 * Unit tests for the Whereby client wrapper. The global fetch is stubbed so we
 * assert URL, headers, payload, and error mapping without real network calls.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createMeeting,
  getMeeting,
  deleteMeeting,
  WherebyApiError,
} from "./whereby";

type FetchCall = { url: string; init: RequestInit };

const realFetch = globalThis.fetch;
let calls: FetchCall[] = [];

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

beforeEach(() => {
  calls = [];
  process.env.WHEREBY_API_KEY = "test-key";
  process.env.WHEREBY_API_BASE = "https://api.example.test/v1";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.WHEREBY_API_KEY;
  delete process.env.WHEREBY_API_BASE;
});

describe("createMeeting", () => {
  it("POSTs to /meetings with auth header and default payload", async () => {
    stubFetch(() =>
      jsonResponse({
        meetingId: "m1",
        endDate: "2026-06-20T10:00:00.000Z",
        hostRoomUrl: "https://host",
        viewerRoomUrl: "https://viewer",
      }),
    );

    const m = await createMeeting({ endDate: "2026-06-20T10:00:00.000Z" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.example.test/v1/meetings");
    assert.equal(calls[0].init.method, "POST");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-key");
    assert.equal(headers["Content-Type"], "application/json");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.endDate, "2026-06-20T10:00:00.000Z");
    assert.equal(body.roomMode, "normal");
    assert.equal(body.isLocked, true);
    assert.deepEqual(body.fields, ["hostRoomUrl", "viewerRoomUrl"]);
    assert.equal(m.meetingId, "m1");
    assert.equal(m.hostRoomUrl, "https://host");
    assert.equal(m.viewerRoomUrl, "https://viewer");
  });

  it("honours roomMode / isLocked overrides", async () => {
    stubFetch(() =>
      jsonResponse({
        meetingId: "m2",
        endDate: "x",
        hostRoomUrl: "h",
        viewerRoomUrl: "v",
      }),
    );
    await createMeeting({
      endDate: "x",
      roomMode: "group",
      isLocked: false,
    });
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.roomMode, "group");
    assert.equal(body.isLocked, false);
  });

  it("defaults the base URL when WHEREBY_API_BASE is unset", async () => {
    delete process.env.WHEREBY_API_BASE;
    stubFetch(() =>
      jsonResponse({
        meetingId: "m",
        endDate: "x",
        hostRoomUrl: "h",
        viewerRoomUrl: "v",
      }),
    );
    await createMeeting({ endDate: "x" });
    assert.ok(calls[0].url.startsWith("https://api.whereby.dev/v1/meetings"));
  });

  it("maps a non-2xx response to WherebyApiError with status + message", async () => {
    stubFetch(() => jsonResponse({ error: "bad request" }, 400));
    await assert.rejects(
      createMeeting({ endDate: "x" }),
      (e: unknown) => {
        assert.ok(e instanceof WherebyApiError);
        assert.equal(e.status, 400);
        assert.equal(e.message, "bad request");
        return true;
      },
    );
  });

  it("throws WherebyApiError(0) when the API key is missing", async () => {
    delete process.env.WHEREBY_API_KEY;
    await assert.rejects(
      createMeeting({ endDate: "x" }),
      (e: unknown) => {
        assert.ok(e instanceof WherebyApiError);
        assert.equal(e.status, 0);
        return true;
      },
    );
  });
});

describe("getMeeting", () => {
  it("GETs /meetings/:id with the auth header", async () => {
    stubFetch(() =>
      jsonResponse({
        meetingId: "abc",
        endDate: "x",
        hostRoomUrl: "h",
        viewerRoomUrl: "v",
      }),
    );
    const m = await getMeeting("abc");
    assert.equal(calls[0].url, "https://api.example.test/v1/meetings/abc");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(m.meetingId, "abc");
  });
});

describe("deleteMeeting", () => {
  it("DELETEs /meetings/:id and tolerates a 204 empty body", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await deleteMeeting("abc");
    assert.equal(calls[0].url, "https://api.example.test/v1/meetings/abc");
    assert.equal(calls[0].init.method, "DELETE");
  });

  it("maps a 404 to WherebyApiError", async () => {
    stubFetch(() => jsonResponse({ message: "not found" }, 404));
    await assert.rejects(deleteMeeting("missing"), (e: unknown) => {
      assert.ok(e instanceof WherebyApiError);
      assert.equal(e.status, 404);
      return true;
    });
  });
});
