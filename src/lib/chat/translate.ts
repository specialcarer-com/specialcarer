/**
 * Gap 4: chat message translation provider.
 *
 * The repo has no OpenAI SDK (the "AI" features are heuristic), and the
 * task brief asks us not to add a dependency. So this calls OpenAI's REST
 * chat-completions endpoint directly with `fetch` — zero new packages.
 *
 * The system prompt pins the model to a translation engine: output only
 * the translated text, echo unchanged if already in the target language,
 * temperature 0 for determinism. We return the model name as `provider`
 * so the cache row records what produced each translation.
 *
 * `fetchImpl` is injectable so the unit tests can drive the happy path,
 * the target=source echo, and provider-failure classification without a
 * network call or an API key.
 */

export const TRANSLATE_MODEL = "gpt-4o-mini";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type TranslateResult = {
  translated: string;
  detectedSource: string;
  provider: string;
};

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type TranslateOptions = {
  text: string;
  targetLang: string;
  sourceLangHint?: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Test seam — defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string;
};

function systemPrompt(targetLang: string, sourceLangHint?: string): string {
  const hint = sourceLangHint
    ? ` The source language is likely "${sourceLangHint}".`
    : "";
  return (
    `You are a translation engine. Translate the user's message to language ` +
    `code ${targetLang}. Output ONLY the translated text, no preamble, no ` +
    `quotes. If the message is already in the target language, echo it ` +
    `unchanged.${hint}`
  );
}

type ChatCompletion = {
  choices?: { message?: { content?: string | null } }[];
};

/**
 * Translate `text` into `targetLang`. Throws a classified Error on any
 * failure (missing key, non-2xx response, malformed/empty completion) so
 * the caller can map it to a 5xx without leaking provider internals.
 */
export async function translateText(
  opts: TranslateOptions,
): Promise<TranslateResult> {
  const { text, targetLang, sourceLangHint } = opts;
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("translate_provider_unconfigured");
  }

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TRANSLATE_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt(targetLang, sourceLangHint) },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`translate_provider_failed: ${detail}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `translate_provider_failed: ${res.status} ${detail.slice(0, 200)}`,
    );
  }

  let json: ChatCompletion;
  try {
    json = (await res.json()) as ChatCompletion;
  } catch {
    throw new Error("translate_provider_failed: unparsable response");
  }

  const translated = json.choices?.[0]?.message?.content?.trim();
  if (!translated) {
    throw new Error("translate_provider_failed: empty completion");
  }

  return {
    translated,
    detectedSource: sourceLangHint ?? "auto",
    provider: TRANSLATE_MODEL,
  };
}
