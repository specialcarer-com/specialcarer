/**
 * DBS application vendor adapter.
 *
 * SpecialCarers applies for a fresh Enhanced DBS on the carer's behalf via a
 * DBS partner. This file is the seam between our service layer and that
 * partner. Two implementations:
 *
 *   - MockDbsVendor    — in-memory state machine. Default in dev (DBS_VENDOR=mock).
 *                        Deterministic + configurable so the service + admin
 *                        flows can be exercised without a live integration.
 *   - DbsRestVendor    — real REST integration (PR-DBS-2). Talks to the partner
 *                        DBS API for fresh applications AND Update Service status.
 *
 * Selected at runtime via the DBS_VENDOR env var (mock | rest | ucheck — the
 * last value is the historical alias and remains accepted), defaulting to mock.
 *
 * ── DBS partner API assumptions (PR-DBS-2) ─────────────────────────────────
 * The current partner exposes a RESTful DBS API but the detailed endpoint
 * contract is only released under a partner onboarding agreement (≈8-12
 * weeks) — there is no public OpenAPI spec. This client is built against the
 * documented shape with the following ASSUMPTIONS, all of which are isolated
 * here so a single patch updates them once the partner docs land:
 *   - Base URL:   DBS_API_BASE (legacy: UCHECK_API_BASE).
 *                 Point this at the sandbox host during onboarding; the prod
 *                 host once approved. Controlled entirely by env.
 *   - Auth:       Authorization: Bearer <DBS_API_KEY> (legacy:
 *                 UCHECK_API_KEY).
 *   - Submit:     POST /applications { kind, applicant: {...} }
 *                 → { id | reference } used as our vendorReference.
 *   - Status:     GET /applications/{ref} → { status: <partner code> }.
 *   - Update Svc: GET /update-service/{certificateNumber}
 *                 → { result: 'clear' | 'change_pending' | 'invalidated' }.
 * TODO(dbs-partner-docs): confirm exact paths, request/response field names,
 * and status vocabulary against the partner docs and adjust the maps below.
 */

import type { DbsKind, DbsStatus } from "./types";

export type SubmitApplicationInput = {
  carerId: string;
  kind: DbsKind;
  carerDetails: {
    legalName: string;
    dateOfBirth: string;
    surname: string;
    addressLine1?: string;
    postcode?: string;
  };
};

export type SubmitApplicationResult = {
  vendorReference: string;
};

export type GetStatusResult = {
  status: DbsStatus;
  decisionAt?: Date;
  certificateNumber?: string;
};

/** Update Service status for a live certificate (self-verify + daily poll). */
export type UpdateServiceStatus = "clear" | "change_pending" | "invalidated";

export type GetUpdateServiceResult = {
  status: UpdateServiceStatus;
  checkedAt: Date;
};

export interface DbsVendor {
  readonly name: string;
  submitApplication(
    input: SubmitApplicationInput,
  ): Promise<SubmitApplicationResult>;
  getStatus(vendorReference: string): Promise<GetStatusResult>;
  /**
   * Query the DBS Update Service for a live certificate. Used by the daily
   * polling cron and the carer self-verify path. Certificate number is the
   * 12-digit DBS certificate id.
   */
  getUpdateServiceStatus(
    certificateNumber: string,
  ): Promise<GetUpdateServiceResult>;
}

// ── MockDbsVendor ────────────────────────────────────────────────────────────

type MockEntry = {
  status: DbsStatus;
  /** Queue of statuses returned on successive getStatus() calls, then sticky. */
  transitions: DbsStatus[];
  certificateNumber?: string;
  decisionAt?: Date;
};

/**
 * In-memory mock. Each submitApplication() mints a fresh reference starting in
 * 'submitted'. getStatus() walks any configured transition queue one step per
 * call, then sticks on the final value. Use configure() in tests to script a
 * specific path (e.g. submitted → in_progress → approved).
 */
export class MockDbsVendor implements DbsVendor {
  readonly name = "mock";
  private store = new Map<string, MockEntry>();
  private counter = 0;
  private updateService = new Map<string, UpdateServiceStatus>();

  async submitApplication(
    input: SubmitApplicationInput,
  ): Promise<SubmitApplicationResult> {
    this.counter += 1;
    const vendorReference = `mock-${input.kind}-${this.counter}-${input.carerId.slice(0, 8)}`;
    this.store.set(vendorReference, {
      status: "submitted",
      transitions: [],
    });
    return { vendorReference };
  }

  async getStatus(vendorReference: string): Promise<GetStatusResult> {
    const entry = this.store.get(vendorReference);
    if (!entry) {
      throw new Error(`MockDbsVendor: unknown vendorReference ${vendorReference}`);
    }
    // Advance one step through the scripted transition queue, if any.
    const next = entry.transitions.shift();
    if (next) {
      entry.status = next;
      if (next === "approved" || next === "rejected") {
        entry.decisionAt = entry.decisionAt ?? new Date();
        if (next === "approved" && !entry.certificateNumber) {
          entry.certificateNumber = `00${(100000000000 + this.counter).toString().slice(0, 10)}`;
        }
      }
    }
    return {
      status: entry.status,
      decisionAt: entry.decisionAt,
      certificateNumber: entry.certificateNumber,
    };
  }

  async getUpdateServiceStatus(
    certificateNumber: string,
  ): Promise<GetUpdateServiceResult> {
    // Default to 'clear'; tests script other outcomes via configureUpdateService().
    const status = this.updateService.get(certificateNumber) ?? "clear";
    return { status, checkedAt: new Date() };
  }

  /**
   * Test helper: script the status path a reference returns on successive
   * getStatus() calls. Not part of the DbsVendor interface.
   */
  configure(
    vendorReference: string,
    opts: { transitions?: DbsStatus[]; certificateNumber?: string },
  ): void {
    const entry = this.store.get(vendorReference);
    if (!entry) {
      throw new Error(`MockDbsVendor: unknown vendorReference ${vendorReference}`);
    }
    if (opts.transitions) entry.transitions = [...opts.transitions];
    if (opts.certificateNumber) entry.certificateNumber = opts.certificateNumber;
  }

  /** Test helper: script an Update Service result for a certificate number. */
  configureUpdateService(
    certificateNumber: string,
    status: UpdateServiceStatus,
  ): void {
    this.updateService.set(certificateNumber, status);
  }

  /** Test helper: drop all in-memory state. */
  reset(): void {
    this.store.clear();
    this.updateService.clear();
    this.counter = 0;
  }
}

// ── DbsRestVendor (real REST integration) ─────────────────────────────────────

const DEFAULT_DBS_BASE = "https://api.ucheck.co.uk/v1";
const DEFAULT_DBS_TIMEOUT_MS = 10_000;
const DBS_RETRY_ATTEMPTS = 3;

function timeoutMs(): number {
  const raw = process.env.DBS_TIMEOUT_MS || process.env.UCHECK_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DBS_TIMEOUT_MS;
}

export class DbsApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "DbsApiError";
    this.status = status;
    this.body = body;
  }
}

/** Map DBS partner application status codes to our internal DbsStatus enum. */
export function mapDbsStatus(raw: string): DbsStatus {
  switch (raw.toLowerCase()) {
    case "draft":
    case "created":
    case "not_started":
      return "not_started";
    case "submitted":
    case "received":
    case "pending":
      return "submitted";
    case "in_progress":
    case "processing":
    case "with_dbs":
    case "countersigned":
      return "in_progress";
    case "complete":
    case "completed":
    case "clear":
    case "approved":
      return "approved";
    case "rejected":
    case "declined":
    case "failed":
      return "rejected";
    case "expired":
    case "withdrawn":
      return "expired";
    default:
      // Unknown codes are treated as still-in-flight rather than guessed
      // approved/rejected — safest default for a safeguarding gate.
      return "in_progress";
  }
}

/** Map a DBS Update Service result to our enum. */
export function mapDbsUpdateServiceStatus(raw: string): UpdateServiceStatus {
  switch (raw.toLowerCase()) {
    case "clear":
    case "no_change":
    case "current":
      return "clear";
    case "change_pending":
    case "changed":
    case "review":
      return "change_pending";
    case "invalidated":
    case "invalid":
    case "revoked":
    case "expired":
      return "invalidated";
    default:
      // Conservative: anything unrecognised is treated as needing review.
      return "change_pending";
  }
}

/**
 * Real DBS partner integration. Talks to the partner REST API over fetch
 * with a 10s timeout and exponential-backoff retry (3 attempts) on 5xx /
 * network errors. 4xx responses fail fast (no retry). Reads DBS_API_KEY /
 * DBS_API_BASE (with legacy UCHECK_API_KEY / UCHECK_API_BASE fallbacks).
 */
export class DbsRestVendor implements DbsVendor {
  readonly name = "dbs-rest";

  private base(): string {
    return process.env.DBS_API_BASE || process.env.UCHECK_API_BASE || DEFAULT_DBS_BASE;
  }

  private apiKey(): string {
    const key = process.env.DBS_API_KEY || process.env.UCHECK_API_KEY;
    if (!key) throw new DbsApiError(0, "Missing DBS_API_KEY");
    return key;
  }

  private async request<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<T> {
    const url = `${this.base()}${path}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= DBS_RETRY_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs());
      try {
        const res = await fetch(url, {
          method: init.method,
          headers: {
            Authorization: `Bearer ${this.apiKey()}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
          },
          body: init.body ? JSON.stringify(init.body) : undefined,
          signal: controller.signal,
        });

        // Retry on 5xx; fail fast on 4xx.
        if (res.status >= 500) {
          lastError = new DbsApiError(
            res.status,
            `DBS API ${init.method} ${path} failed (${res.status})`,
            await safeBody(res),
          );
          await backoff(attempt);
          continue;
        }
        if (!res.ok) {
          throw new DbsApiError(
            res.status,
            `DBS API ${init.method} ${path} failed (${res.status})`,
            await safeBody(res),
          );
        }
        return (await res.json()) as T;
      } catch (e) {
        // AbortError (timeout) + network errors are retryable.
        if (e instanceof DbsApiError && e.status !== 0) throw e;
        lastError = e;
        if (attempt < DBS_RETRY_ATTEMPTS) await backoff(attempt);
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError instanceof DbsApiError) throw lastError;
    const message =
      lastError instanceof Error ? lastError.message : "DBS request failed";
    throw new DbsApiError(0, message);
  }

  async submitApplication(
    input: SubmitApplicationInput,
  ): Promise<SubmitApplicationResult> {
    const { carerDetails } = input;
    const data = await this.request<{ id?: string; reference?: string }>(
      "/applications",
      {
        method: "POST",
        body: {
          kind: input.kind,
          applicant: {
            firstName: firstNameOf(carerDetails.legalName, carerDetails.surname),
            lastName: carerDetails.surname,
            dob: carerDetails.dateOfBirth,
            address: {
              line1: carerDetails.addressLine1,
              postcode: carerDetails.postcode,
            },
          },
        },
      },
    );
    const vendorReference = data.reference ?? data.id;
    if (!vendorReference) {
      throw new DbsApiError(
        502,
        "DBS partner submitApplication response missing reference",
        data,
      );
    }
    return { vendorReference };
  }

  async getStatus(vendorReference: string): Promise<GetStatusResult> {
    const data = await this.request<{
      status?: string;
      decisionAt?: string;
      completedAt?: string;
      certificateNumber?: string;
      certificate?: { number?: string };
    }>(`/applications/${encodeURIComponent(vendorReference)}`, {
      method: "GET",
    });
    const rawStatus = data.status ?? "in_progress";
    const decisionRaw = data.decisionAt ?? data.completedAt;
    return {
      status: mapDbsStatus(rawStatus),
      decisionAt: decisionRaw ? new Date(decisionRaw) : undefined,
      certificateNumber:
        data.certificateNumber ?? data.certificate?.number ?? undefined,
    };
  }

  async getUpdateServiceStatus(
    certificateNumber: string,
  ): Promise<GetUpdateServiceResult> {
    const data = await this.request<{ result?: string; status?: string }>(
      `/update-service/${encodeURIComponent(certificateNumber)}`,
      { method: "GET" },
    );
    const raw = data.result ?? data.status ?? "change_pending";
    return {
      status: mapDbsUpdateServiceStatus(raw),
      checkedAt: new Date(),
    };
  }
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Exponential backoff: ~100ms, 200ms, 400ms … capped at 2s. */
function backoff(attempt: number): Promise<void> {
  const ms = Math.min(2000, 100 * 2 ** (attempt - 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort first name: legalName minus a trailing surname. */
function firstNameOf(legalName: string, surname: string): string {
  const trimmed = legalName.trim();
  if (surname && trimmed.toLowerCase().endsWith(surname.toLowerCase())) {
    return trimmed.slice(0, trimmed.length - surname.length).trim() || trimmed;
  }
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

// ── Selection ────────────────────────────────────────────────────────────────

// A single mock instance is shared per process so the service layer + tests
// see consistent state across calls within a run.
let mockSingleton: MockDbsVendor | null = null;

export function getMockDbsVendor(): MockDbsVendor {
  if (!mockSingleton) mockSingleton = new MockDbsVendor();
  return mockSingleton;
}

/**
 * Pick a vendor based on the DBS_VENDOR env var. Defaults to 'mock'.
 */
export function getDbsVendor(): DbsVendor {
  const choice = (process.env.DBS_VENDOR ?? "mock").toLowerCase();
  if (choice === "ucheck" || choice === "rest") return new DbsRestVendor();
  return getMockDbsVendor();
}
