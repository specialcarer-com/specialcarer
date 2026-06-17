/**
 * DBS application vendor adapter (PR-DBS-1).
 *
 * SpecialCarers applies for a fresh Enhanced DBS on the carer's behalf via a
 * vendor (uCheck). This file is the seam between our service layer and that
 * vendor. Two implementations:
 *
 *   - MockDbsVendor  — in-memory state machine. Default in dev (DBS_VENDOR=mock).
 *                      Deterministic + configurable so the service + admin
 *                      flows can be exercised without a live integration.
 *   - UCheckVendor   — stub. Throws until UCHECK_API_KEY is set; the real
 *                      integration lands in PR-DBS-2.
 *
 * Selected at runtime via the DBS_VENDOR env var (mock | ucheck), defaulting
 * to mock.
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

export interface DbsVendor {
  readonly name: string;
  submitApplication(
    input: SubmitApplicationInput,
  ): Promise<SubmitApplicationResult>;
  getStatus(vendorReference: string): Promise<GetStatusResult>;
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

  /** Test helper: drop all in-memory state. */
  reset(): void {
    this.store.clear();
    this.counter = 0;
  }
}

// ── UCheckVendor (stub) ──────────────────────────────────────────────────────

const PR_DBS_2_MESSAGE = "uCheck integration arrives in PR-DBS-2";

/**
 * Stub for the real uCheck integration. Every method throws until
 * UCHECK_API_KEY is configured — at which point PR-DBS-2 fills in the bodies.
 */
export class UCheckVendor implements DbsVendor {
  readonly name = "ucheck";

  async submitApplication(
    _input: SubmitApplicationInput,
  ): Promise<SubmitApplicationResult> {
    throw new Error(PR_DBS_2_MESSAGE);
  }

  async getStatus(_vendorReference: string): Promise<GetStatusResult> {
    throw new Error(PR_DBS_2_MESSAGE);
  }
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
  if (choice === "ucheck") return new UCheckVendor();
  return getMockDbsVendor();
}
