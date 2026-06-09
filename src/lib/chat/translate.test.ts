/**
 * Unit tests for the translation provider. Drives translateText with an
 * injected fetch stub + api key so no network call or env var is needed.
 * Covers: happy path, target=source (model echoes the input), and
 * provider-failure classification (network error, non-2xx, empty body).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  translateText,
  TRANSLATE_MODEL,
  type FetchLike,
} from "./translate";

function okFetch(content: string): {
  fetchImpl: FetchLike;
  calls: { url: string; body: unknown }[];
} {
  const calls: { url: string; body: unknown }[] = [];
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

describe("translateText — happy path", () => {
  it("returns the model's translated text and provider name", async () => {
    const { fetchImpl, calls } = okFetch("Hola, ¿cómo estás?");
    const res = await translateText({
      text: "Hello, how are you?",
      targetLang: "es",
      fetchImpl,
      apiKey: "sk-test",
    });
    assert.equal(res.translated, "Hola, ¿cómo estás?");
    assert.equal(res.provider, TRANSLATE_MODEL);
    assert.equal(calls.length, 1);
    // System prompt names the target language code.
    const body = calls[0].body as {
      model: string;
      temperature: number;
      messages: { role: string; content: string }[];
    };
    assert.equal(body.model, TRANSLATE_MODEL);
    assert.equal(body.temperature, 0);
    assert.match(body.messages[0].content, /\bes\b/);
    assert.equal(body.messages[1].content, "Hello, how are you?");
  });

  it("trims surrounding whitespace from the completion", async () => {
    const { fetchImpl } = okFetch("  Bonjour  ");
    const res = await translateText({
      text: "Hello",
      targetLang: "fr",
      fetchImpl,
      apiKey: "sk-test",
    });
    assert.equal(res.translated, "Bonjour");
  });

  it("forwards the source-language hint into detectedSource", async () => {
    const { fetchImpl } = okFetch("Hello");
    const res = await translateText({
      text: "Hello",
      targetLang: "es",
      sourceLangHint: "en",
      fetchImpl,
      apiKey: "sk-test",
    });
    assert.equal(res.detectedSource, "en");
  });
});

describe("translateText — target equals source", () => {
  it("echoes the message unchanged when already in the target language", async () => {
    // The system prompt instructs the model to echo; we simulate that.
    const { fetchImpl } = okFetch("Already English text.");
    const res = await translateText({
      text: "Already English text.",
      targetLang: "en",
      fetchImpl,
      apiKey: "sk-test",
    });
    assert.equal(res.translated, "Already English text.");
  });
});

describe("translateText — error paths", () => {
  it("throws translate_provider_unconfigured when no api key", async () => {
    const { fetchImpl } = okFetch("x");
    await assert.rejects(
      translateText({
        text: "Hello",
        targetLang: "es",
        fetchImpl,
        apiKey: "",
      }),
      /translate_provider_unconfigured/,
    );
  });

  it("classifies a network/throw as translate_provider_failed", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    await assert.rejects(
      translateText({
        text: "Hello",
        targetLang: "es",
        fetchImpl,
        apiKey: "sk-test",
      }),
      /translate_provider_failed: ECONNRESET/,
    );
  });

  it("classifies a non-2xx response as translate_provider_failed", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => "rate limited",
    });
    await assert.rejects(
      translateText({
        text: "Hello",
        targetLang: "es",
        fetchImpl,
        apiKey: "sk-test",
      }),
      /translate_provider_failed: 429/,
    );
  });

  it("throws when the completion is empty", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
      text: async () => "",
    });
    await assert.rejects(
      translateText({
        text: "Hello",
        targetLang: "es",
        fetchImpl,
        apiKey: "sk-test",
      }),
      /empty completion/,
    );
  });
});
