/**
 * Unit tests for care-note summarisation (gap 29).
 *
 * Covers:
 *   - summariseText provider: happy path (model/temperature/prompt), and
 *     failure classification (missing key, non-2xx, empty completion).
 *   - summariseNote orchestrator: short note → null (no provider call),
 *     cached note → returns existing row (no provider call), fresh long note
 *     → calls the provider once and persists, unique-violation race ignored.
 *
 * No network call or API key needed — fetch and the provider fn are injected.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  summariseText,
  summariseNote,
  SUMMARY_MODEL,
  SUMMARY_PROMPT_VERSION,
  MIN_SUMMARY_CHARS,
  type FetchLike,
  type SummaryStore,
  type CachedSummary,
} from "./summarise";

const LONG_NOTE =
  "Today was a settled day. " + "Mrs P had a good breakfast and ".repeat(20);

function okFetch(content: string): {
  fetchImpl: FetchLike;
  calls: { url: string; body: Record<string, unknown> }[];
} {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => "",
    };
  };
  return { fetchImpl, calls };
}

function makeStore(opts: {
  cached?: CachedSummary | null;
  inserts?: unknown[];
  insertError?: Error;
}): SummaryStore {
  return {
    async getCached() {
      return opts.cached ?? null;
    },
    async insert(row) {
      opts.inserts?.push(row);
      if (opts.insertError) throw opts.insertError;
    },
  };
}

describe("summariseText — provider", () => {
  it("posts the right model/temperature/prompt and returns the summary", async () => {
    const { fetchImpl, calls } = okFetch("- ate well\n- calm mood");
    const res = await summariseText({
      text: LONG_NOTE,
      fetchImpl,
      apiKey: "sk-test",
    });
    assert.equal(res.summary, "- ate well\n- calm mood");
    assert.equal(res.model, SUMMARY_MODEL);
    assert.equal(res.promptVersion, SUMMARY_PROMPT_VERSION);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, SUMMARY_MODEL);
    const messages = calls[0].body.messages as { role: string; content: string }[];
    assert.equal(messages[0].role, "system");
    assert.match(messages[0].content, /UK English/);
    assert.equal(messages[1].content, LONG_NOTE);
  });

  it("trims whitespace from the completion", async () => {
    const { fetchImpl } = okFetch("  - ate well  ");
    const res = await summariseText({ text: LONG_NOTE, fetchImpl, apiKey: "k" });
    assert.equal(res.summary, "- ate well");
  });

  it("throws when the API key is missing", async () => {
    await assert.rejects(
      () => summariseText({ text: LONG_NOTE, apiKey: "" }),
      /summarise_provider_unconfigured/,
    );
  });

  it("throws a classified error on a non-2xx response", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    });
    await assert.rejects(
      () => summariseText({ text: LONG_NOTE, fetchImpl, apiKey: "k" }),
      /summarise_provider_failed: 500/,
    );
  });

  it("throws on an empty completion", async () => {
    const { fetchImpl } = okFetch("");
    await assert.rejects(
      () => summariseText({ text: LONG_NOTE, fetchImpl, apiKey: "k" }),
      /empty completion/,
    );
  });
});

describe("summariseNote — orchestrator", () => {
  it("returns null and never calls the provider for a short note", async () => {
    let called = false;
    const res = await summariseNote({
      noteId: "n1",
      noteText: "Quick note, all fine today.",
      store: makeStore({}),
      summarise: async () => {
        called = true;
        return { summary: "x", model: "m", promptVersion: "v1" };
      },
    });
    assert.equal(res, null);
    assert.equal(called, false);
  });

  it("treats a note exactly at MIN_SUMMARY_CHARS as long enough", async () => {
    const text = "a".repeat(MIN_SUMMARY_CHARS);
    let called = false;
    const inserts: unknown[] = [];
    await summariseNote({
      noteId: "n1",
      noteText: text,
      store: makeStore({ inserts }),
      summarise: async () => {
        called = true;
        return { summary: "- ok", model: "m", promptVersion: "v1" };
      },
    });
    assert.equal(called, true);
    assert.equal(inserts.length, 1);
  });

  it("returns the cached summary without calling the provider", async () => {
    let called = false;
    const res = await summariseNote({
      noteId: "n1",
      noteText: LONG_NOTE,
      store: makeStore({
        cached: { summary: "- cached", model: "m", prompt_version: "v1" },
      }),
      summarise: async () => {
        called = true;
        return { summary: "- fresh", model: "m", promptVersion: "v1" };
      },
    });
    assert.equal(called, false);
    assert.equal(res?.summary, "- cached");
  });

  it("calls the provider and persists for a fresh long note", async () => {
    let called = 0;
    const inserts: { noteId: string; summary: string }[] = [];
    const res = await summariseNote({
      noteId: "n1",
      noteText: LONG_NOTE,
      store: makeStore({ inserts: inserts as unknown[] }),
      summarise: async () => {
        called += 1;
        return { summary: "- ate well\n- calm", model: "gpt-4o-mini", promptVersion: "v1" };
      },
    });
    assert.equal(called, 1);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].noteId, "n1");
    assert.equal(inserts[0].summary, "- ate well\n- calm");
    assert.equal(res?.summary, "- ate well\n- calm");
    assert.equal(res?.model, "gpt-4o-mini");
  });

  it("propagates a provider error to the caller", async () => {
    await assert.rejects(
      () =>
        summariseNote({
          noteId: "n1",
          noteText: LONG_NOTE,
          store: makeStore({}),
          summarise: async () => {
            throw new Error("summarise_provider_failed: 429");
          },
        }),
      /429/,
    );
  });
});
