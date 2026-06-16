/**
 * Veriff Station API client wrapper.
 *
 * Thin typed client around the Veriff sessions API. Used by the identity
 * verification routes to create sessions and fetch decisions. Two headers are
 * sent on every request:
 *   - X-AUTH-CLIENT: the API public key (VERIFF_API_KEY)
 *   - X-HMAC-SIGNATURE: hex(hmac-sha256(VERIFF_SIGNATURE_KEY, <signed data>))
 *
 * Signed-data rule (per https://devdocs.veriff.com — "HMAC authentication"):
 *   - POST: the raw JSON request body.
 *   - GET:  the session ID.
 * The signature is lower-case hex with no prefix (mirrors the repo's Whereby
 * convention). See PR description for the one open question about the optional
 * "sha256=" prefix some Veriff docs show.
 *
 * Base URL is read from VERIFF_BASE_URL, default https://stationapi.veriff.com.
 * All failures surface as a typed VeriffApiError carrying the HTTP status +
 * (best-effort) response body.
 */
import crypto from "crypto";

const DEFAULT_BASE = "https://stationapi.veriff.com";

function apiBase(): string {
  return process.env.VERIFF_BASE_URL || DEFAULT_BASE;
}

function apiKey(): string {
  const key = process.env.VERIFF_API_KEY;
  if (!key) {
    throw new VeriffApiError(0, "Missing VERIFF_API_KEY");
  }
  return key;
}

function signatureKey(): string {
  const key = process.env.VERIFF_SIGNATURE_KEY;
  if (!key) {
    throw new VeriffApiError(0, "Missing VERIFF_SIGNATURE_KEY");
  }
  return key;
}

/** hex(hmac-sha256(VERIFF_SIGNATURE_KEY, payload)) — payload is the raw body
 *  for POSTs or the sessionId for GETs. */
export function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", signatureKey())
    .update(payload)
    .digest("hex");
}

export class VeriffApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "VeriffApiError";
    this.status = status;
    this.body = body;
  }
}

/** Person details passed through to Veriff on session creation. All optional —
 *  Veriff will collect what it needs during the flow. */
export type VeriffPerson = {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
};

export type CreateSessionInput = {
  person: VeriffPerson;
  /** Our internal reference (e.g. user id) echoed back on webhooks. */
  vendorData: string;
  /** Where Veriff sends the user after the flow completes. */
  callback?: string;
};

/** Subset of the Veriff verification object we persist/consume. */
export type VeriffSession = {
  id: string;
  url: string;
  vendorData?: string;
  status?: string;
  sessionToken?: string;
};

/** Subset of the Veriff decision payload we persist/consume. */
export type VeriffDecision = {
  status: string;
  verification: unknown;
};

type VeriffSessionResponse = {
  status: string;
  verification?: {
    id: string;
    url: string;
    vendorData?: string;
    status?: string;
    sessionToken?: string;
  };
};

type VeriffDecisionResponse = {
  status: string;
  verification: unknown;
};

async function parseError(res: Response): Promise<VeriffApiError> {
  let body: unknown;
  let message = `Veriff request failed (${res.status})`;
  try {
    body = await res.json();
    const b = body as { message?: string; code?: number };
    if (b && typeof b.message === "string") message = b.message;
  } catch {
    // non-JSON error body; keep the default message
  }
  return new VeriffApiError(res.status, message, body);
}

export async function createSession(
  input: CreateSessionInput,
): Promise<VeriffSession> {
  const payload = {
    verification: {
      person: input.person,
      vendorData: input.vendorData,
      ...(input.callback ? { callback: input.callback } : {}),
    },
  };
  const body = JSON.stringify(payload);

  let res: Response;
  try {
    res = await fetch(`${apiBase()}/v1/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": apiKey(),
        "X-HMAC-SIGNATURE": signPayload(body),
      },
      body,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    throw new VeriffApiError(0, message);
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  const data = (await res.json()) as VeriffSessionResponse;
  if (!data.verification) {
    throw new VeriffApiError(
      res.status,
      "Veriff response missing verification object",
      data,
    );
  }
  return {
    id: data.verification.id,
    url: data.verification.url,
    vendorData: data.verification.vendorData,
    status: data.verification.status,
    sessionToken: data.verification.sessionToken,
  };
}

export async function getDecision(
  sessionId: string,
): Promise<VeriffDecision> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase()}/v1/sessions/${encodeURIComponent(sessionId)}/decision`,
      {
        method: "GET",
        headers: {
          "X-AUTH-CLIENT": apiKey(),
          // GET signs the session ID, not a body.
          "X-HMAC-SIGNATURE": signPayload(sessionId),
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    throw new VeriffApiError(0, message);
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  const data = (await res.json()) as VeriffDecisionResponse;
  return { status: data.status, verification: data.verification };
}
