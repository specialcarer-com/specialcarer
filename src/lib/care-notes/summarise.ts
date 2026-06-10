/**
 * Gap 29: AI "Key points" summarisation of long carer shift notes.
 *
 * Mirrors the chat-translation provider (src/lib/chat/translate.ts): the repo
 * has no OpenAI SDK — the existing "AI" features call OpenAI's REST
 * chat-completions endpoint directly with `fetch`, so we reuse that approach
 * and add no dependency. Same env var (OPENAI_API_KEY) and same model family
 * (gpt-4o-mini).
 *
 * `summariseNote` is the read-through orchestrator the route + the journal
 * save path call. It:
 *   1. Skips notes shorter than MIN_SUMMARY_CHARS (returns null).
 *   2. Reads the cache (care_note_summaries) by note_id; hit → returns it.
 *   3. Miss → calls the provider, persists the row, returns it.
 *
 * The provider call (`summarise`) and the DB layer (`SummaryStore`) are both
 * injected so the route wires real OpenAI + Supabase while tests drive stubs
 * with no network call or API key.
 */

export const SUMMARY_MODEL = "gpt-4o-mini";
export const SUMMARY_PROMPT_VERSION = "v1";

/** Notes shorter than this are not worth summarising — return null. */
export const MIN_SUMMARY_CHARS = 200;

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type SummariseResult = {
  /** Markdown bullet list (2-3 "- " lines). */
  summary: string;
  model: string;
  promptVersion: string;
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

export type SummariseFn = (text: string) => Promise<SummariseResult>;

const SYSTEM_PROMPT =
  "You summarise a home-care visit note written by a carer for the family " +
  "to read on their care timeline. Produce 2-3 concise bullet points " +
  "capturing the key observations only — mood, food and fluid intake, " +
  "medication, mobility, and anything to flag (incidents, refusals, " +
  "distress). Warm, reassuring, plain English for family members. No " +
  "clinical jargon. Use UK English spelling. Output ONLY a markdown bullet " +
  'list, one point per line starting with "- ", no heading, no preamble.';

type ChatCompletion = {
  choices?: { message?: { content?: string | null } }[];
};

export type SummariseTextOptions = {
  text: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Test seam — defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string;
};

/**
 * Call OpenAI to turn a note into a short bullet summary. Throws a classified
 * Error on any failure (missing key, non-2xx, malformed/empty completion) so
 * the caller decides whether to fall back to "Summary unavailable" or retry.
 */
export async function summariseText(
  opts: SummariseTextOptions,
): Promise<SummariseResult> {
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("summarise_provider_unconfigured");
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
        model: SUMMARY_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: opts.text },
        ],
      }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`summarise_provider_failed: ${detail}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `summarise_provider_failed: ${res.status} ${detail.slice(0, 200)}`,
    );
  }

  let json: ChatCompletion;
  try {
    json = (await res.json()) as ChatCompletion;
  } catch {
    throw new Error("summarise_provider_failed: unparsable response");
  }

  const summary = json.choices?.[0]?.message?.content?.trim();
  if (!summary) {
    throw new Error("summarise_provider_failed: empty completion");
  }

  return {
    summary,
    model: SUMMARY_MODEL,
    promptVersion: SUMMARY_PROMPT_VERSION,
  };
}

export type CachedSummary = {
  summary: string;
  model: string;
  prompt_version: string;
};

/** DB seam — real impl wraps Supabase; tests pass stubs. */
export type SummaryStore = {
  /** Cache lookup by note_id; null when no summary row exists. */
  getCached(noteId: string): Promise<CachedSummary | null>;
  /** Persist a freshly-computed summary (service role). */
  insert(row: {
    noteId: string;
    summary: string;
    model: string;
    promptVersion: string;
  }): Promise<void>;
};

export type SummariseNoteInput = {
  noteId: string;
  noteText: string;
  store: SummaryStore;
  /** Provider call — defaults to summariseText with env/global fetch. */
  summarise?: SummariseFn;
};

/**
 * Read-through summarisation. Returns the cached/new summary, or null when the
 * note is too short to summarise. Throws if the provider fails (caller decides
 * fallback). Persist failures other than a unique-violation race propagate.
 */
export async function summariseNote(
  input: SummariseNoteInput,
): Promise<CachedSummary | null> {
  const { noteId, noteText, store } = input;

  if ((noteText?.trim().length ?? 0) < MIN_SUMMARY_CHARS) {
    return null;
  }

  const cached = await store.getCached(noteId);
  if (cached) return cached;

  const summarise: SummariseFn =
    input.summarise ?? ((text) => summariseText({ text }));
  const result = await summarise(noteText);

  await store.insert({
    noteId,
    summary: result.summary,
    model: result.model,
    promptVersion: result.promptVersion,
  });

  return {
    summary: result.summary,
    model: result.model,
    prompt_version: result.promptVersion,
  };
}
