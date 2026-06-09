/**
 * Route-level tests for POST /api/m/chat/messages/[id]/translate.
 *
 * Auth (401) and participation (403) are guarded at the route boundary,
 * so they're covered by the route wiring; here we drive the pure
 * handleTranslate with stub clients to verify validation, the
 * cache-hit / cache-miss paths, and provider-failure handling. Matches
 * the node:test handler-test pattern used by pin/route.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleTranslate,
  type TranslateClient,
  type CachedTranslation,
} from "@/lib/chat/translate-handler";
import type { TranslateResult } from "@/lib/chat/translate";

function makeClient(opts: {
  cached?: CachedTranslation | null;
  body?: string | null;
  inserted?: unknown[];
}): TranslateClient {
  return {
    async getCached() {
      return opts.cached ?? null;
    },
    async getMessageBody() {
      return opts.body ?? null;
    },
    async insertCached(row) {
      opts.inserted?.push(row);
    },
  };
}

const okTranslate = async (o: {
  text: string;
  targetLang: string;
}): Promise<TranslateResult> => ({
  translated: `[${o.targetLang}] ${o.text}`,
  detectedSource: "en",
  provider: "gpt-4o-mini",
});

describe("handleTranslate — validation", () => {
  it("400 on a non-object body", async () => {
    const res = await handleTranslate({
      message_id: "m1",
      body: "nope",
      client: makeClient({}),
      translate: okTranslate,
    });
    assert.equal(res.status, 400);
  });

  it("400 on a missing/invalid target_lang", async () => {
    for (const bad of [{}, { target_lang: "english" }, { target_lang: "E" }, { target_lang: "es_ES" }]) {
      const res = await handleTranslate({
        message_id: "m1",
        body: bad,
        client: makeClient({}),
        translate: okTranslate,
      });
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
  });

  it("accepts a region-tagged code like en-GB", async () => {
    const res = await handleTranslate({
      message_id: "m1",
      body: { target_lang: "en-GB" },
      client: makeClient({ body: "hola" }),
      translate: okTranslate,
    });
    assert.equal(res.status, 200);
  });
});

describe("handleTranslate — cache hit", () => {
  it("returns the cached row without calling the provider", async () => {
    let called = false;
    const res = await handleTranslate({
      message_id: "m1",
      body: { target_lang: "es" },
      client: makeClient({
        cached: {
          translated_body: "Hola",
          detected_source_lang: "en",
          provider: "gpt-4o-mini",
        },
      }),
      translate: async () => {
        called = true;
        return okTranslate({ text: "x", targetLang: "es" });
      },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      translated_body: string;
      cached: boolean;
      target_lang: string;
    };
    assert.equal(json.translated_body, "Hola");
    assert.equal(json.cached, true);
    assert.equal(json.target_lang, "es");
    assert.equal(called, false);
  });
});

describe("handleTranslate — cache miss", () => {
  it("fetches body, calls provider, inserts, returns cached:false", async () => {
    const inserted: unknown[] = [];
    const res = await handleTranslate({
      message_id: "m1",
      body: { target_lang: "es" },
      client: makeClient({ cached: null, body: "Hello", inserted }),
      translate: okTranslate,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      translated_body: string;
      cached: boolean;
    };
    assert.equal(json.translated_body, "[es] Hello");
    assert.equal(json.cached, false);
    assert.equal(inserted.length, 1);
    assert.deepEqual(inserted[0], {
      messageId: "m1",
      targetLang: "es",
      translatedBody: "[es] Hello",
      detectedSourceLang: "en",
      provider: "gpt-4o-mini",
    });
  });

  it("cache_only miss returns 204 without calling the provider", async () => {
    let called = false;
    const res = await handleTranslate({
      message_id: "m1",
      body: { target_lang: "es", cache_only: true },
      client: makeClient({ cached: null, body: "Hello" }),
      translate: async () => {
        called = true;
        return okTranslate({ text: "x", targetLang: "es" });
      },
    });
    assert.equal(res.status, 204);
    assert.equal(called, false);
  });

  it("404 when the message body does not exist", async () => {
    const res = await handleTranslate({
      message_id: "missing",
      body: { target_lang: "es" },
      client: makeClient({ cached: null, body: null }),
      translate: okTranslate,
    });
    assert.equal(res.status, 404);
  });

  it("502 and no insert when the provider throws", async () => {
    const inserted: unknown[] = [];
    const res = await handleTranslate({
      message_id: "m1",
      body: { target_lang: "es" },
      client: makeClient({ cached: null, body: "Hello", inserted }),
      translate: async () => {
        throw new Error("translate_provider_failed: 500");
      },
    });
    assert.equal(res.status, 502);
    assert.equal(inserted.length, 0);
  });
});
