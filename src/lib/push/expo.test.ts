/**
 * Tests for the Expo push HTTP wrapper.
 *
 * Manual fetch mocking — same pattern as other tests in the repo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sendExpoPush, type ExpoPushMessage } from "./expo";

function makeMessage(to: string): ExpoPushMessage {
  return { to, title: "t", body: "b" };
}

describe("sendExpoPush", () => {
  it("returns empty data and skips fetch when no messages", async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = (async () => {
      calls += 1;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const out = await sendExpoPush([]);
      assert.deepEqual(out, { data: [] });
      assert.equal(calls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("POSTs to the Expo push URL with the right headers and JSON body", async () => {
    const originalFetch = global.fetch;
    const captured: Array<{
      url: string;
      method: string | undefined;
      headers: Record<string, string>;
      body: unknown;
    }> = [];
    global.fetch = (async (input, init) => {
      const reqInit = init as RequestInit | undefined;
      const headers: Record<string, string> = {};
      const h = reqInit?.headers;
      if (h && typeof h === "object" && !Array.isArray(h)) {
        for (const [k, v] of Object.entries(h)) headers[k] = String(v);
      }
      captured.push({
        url: String(input),
        method: reqInit?.method,
        headers,
        body: JSON.parse(reqInit?.body as string),
      });
      const body = JSON.parse(reqInit?.body as string) as ExpoPushMessage[];
      const data = body.map(() => ({ status: "ok" as const, id: "x" }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;

    const prev = process.env.EXPO_ACCESS_TOKEN;
    delete process.env.EXPO_ACCESS_TOKEN;
    try {
      const out = await sendExpoPush([makeMessage("t1"), makeMessage("t2")]);
      assert.equal(captured.length, 1);
      assert.equal(
        captured[0].url,
        "https://exp.host/--/api/v2/push/send",
      );
      assert.equal(captured[0].method, "POST");
      assert.equal(captured[0].headers["Content-Type"], "application/json");
      assert.equal(captured[0].headers["Accept"], "application/json");
      assert.equal(
        captured[0].headers["Accept-Encoding"],
        "gzip, deflate",
      );
      assert.equal(captured[0].headers["Authorization"], undefined);
      assert.equal((captured[0].body as ExpoPushMessage[]).length, 2);
      assert.equal(out.data.length, 2);
      assert.equal(out.data[0].status, "ok");
    } finally {
      if (prev !== undefined) process.env.EXPO_ACCESS_TOKEN = prev;
      global.fetch = originalFetch;
    }
  });

  it("chunks into batches of 100 (150 → 100 + 50)", async () => {
    const originalFetch = global.fetch;
    const batchSizes: number[] = [];
    global.fetch = (async (_input, init) => {
      const reqInit = init as RequestInit | undefined;
      const body = JSON.parse(reqInit?.body as string) as ExpoPushMessage[];
      batchSizes.push(body.length);
      const data = body.map((_, i) => ({
        status: "ok" as const,
        id: `id-${i}`,
      }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;
    try {
      const messages: ExpoPushMessage[] = [];
      for (let i = 0; i < 150; i++) messages.push(makeMessage(`tok-${i}`));
      const out = await sendExpoPush(messages);
      assert.deepEqual(batchSizes, [100, 50]);
      assert.equal(out.data.length, 150);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("sets the Authorization header iff EXPO_ACCESS_TOKEN is set", async () => {
    const originalFetch = global.fetch;
    let auth: string | undefined;
    global.fetch = (async (_input, init) => {
      const reqInit = init as RequestInit | undefined;
      const h = reqInit?.headers as Record<string, string> | undefined;
      auth = h?.Authorization;
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "1" }] }), {
        status: 200,
      });
    }) as typeof fetch;
    const prev = process.env.EXPO_ACCESS_TOKEN;
    process.env.EXPO_ACCESS_TOKEN = "secret-token";
    try {
      await sendExpoPush([makeMessage("t1")]);
      assert.equal(auth, "Bearer secret-token");
    } finally {
      if (prev === undefined) delete process.env.EXPO_ACCESS_TOKEN;
      else process.env.EXPO_ACCESS_TOKEN = prev;
      global.fetch = originalFetch;
    }
  });
});
