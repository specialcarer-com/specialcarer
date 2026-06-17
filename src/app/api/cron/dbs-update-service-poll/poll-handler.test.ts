/**
 * Unit tests for the DBS Update Service daily-poll handler (PR-DBS-2).
 *
 * Drives pollUpdateService() against an in-memory PollClient + a scriptable
 * vendor stub so the three outcomes (clear / change_pending / invalidated),
 * row skipping, and error capture can be exercised without a database or a
 * live uCheck integration. The route-level CRON_SECRET auth is covered by the
 * route itself; this file tests the row-processing logic the route delegates to.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pollUpdateService,
  type DueRow,
  type PollClient,
  type PollNotifier,
} from "./poll-handler";
import type {
  DbsVendor,
  GetUpdateServiceResult,
  UpdateServiceStatus,
} from "@/lib/dbs/vendor";

// ── Test doubles ─────────────────────────────────────────────────────────────

type Calls = {
  fetchDueRows: string[];
  markChecked: Array<[string, string]>;
  markChangePending: Array<[string, string, string]>;
  markInvalidated: Array<[string, string, string]>;
};

function makeClient(rows: DueRow[]): { client: PollClient; calls: Calls } {
  const calls: Calls = {
    fetchDueRows: [],
    markChecked: [],
    markChangePending: [],
    markInvalidated: [],
  };
  const client: PollClient = {
    async fetchDueRows(cutoffIso) {
      calls.fetchDueRows.push(cutoffIso);
      return rows;
    },
    async markChecked(id, nowIso) {
      calls.markChecked.push([id, nowIso]);
    },
    async markChangePending(id, carerId, nowIso) {
      calls.markChangePending.push([id, carerId, nowIso]);
    },
    async markInvalidated(id, carerId, nowIso) {
      calls.markInvalidated.push([id, carerId, nowIso]);
    },
  };
  return { client, calls };
}

function makeNotifier(): { notify: PollNotifier; calls: Record<string, string[]> } {
  const calls: Record<string, string[]> = {
    adminChangePending: [],
    adminInvalidated: [],
    carerInvalidated: [],
  };
  const notify: PollNotifier = {
    async adminChangePending(carerId) {
      calls.adminChangePending.push(carerId);
    },
    async adminInvalidated(carerId) {
      calls.adminInvalidated.push(carerId);
    },
    async carerInvalidated(carerId) {
      calls.carerInvalidated.push(carerId);
    },
  };
  return { notify, calls };
}

/** Vendor stub returning a scripted status per certificate number. */
function makeVendor(
  byCert: Record<string, UpdateServiceStatus | Error>,
): DbsVendor {
  return {
    name: "stub",
    async submitApplication() {
      throw new Error("not used");
    },
    async getStatus() {
      throw new Error("not used");
    },
    async getUpdateServiceStatus(cert): Promise<GetUpdateServiceResult> {
      const v = byCert[cert];
      if (v instanceof Error) throw v;
      return { status: v ?? "clear", checkedAt: new Date() };
    },
  };
}

const NOW = new Date("2026-06-17T06:23:00.000Z");
const now = () => NOW;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("pollUpdateService", () => {
  it("bumps last-checked for a 'clear' result", async () => {
    const rows: DueRow[] = [
      {
        id: "a1",
        carer_id: "c1",
        certificate_number: "001234567890",
        update_service_last_checked_at: null,
      },
    ];
    const { client, calls } = makeClient(rows);
    const { notify, calls: ncalls } = makeNotifier();
    const summary = await pollUpdateService({
      admin: client,
      vendor: makeVendor({ "001234567890": "clear" }),
      notify,
      now,
    });
    assert.equal(summary.checked, 1);
    assert.equal(summary.clear, 1);
    assert.deepEqual(calls.markChecked, [["a1", NOW.toISOString()]]);
    assert.equal(calls.markChangePending.length, 0);
    assert.equal(calls.markInvalidated.length, 0);
    assert.equal(ncalls.adminChangePending.length, 0);
  });

  it("flags change_pending and notifies the admin", async () => {
    const rows: DueRow[] = [
      {
        id: "a1",
        carer_id: "c1",
        certificate_number: "001234567890",
        update_service_last_checked_at: "2026-06-15T06:00:00.000Z",
      },
    ];
    const { client, calls } = makeClient(rows);
    const { notify, calls: ncalls } = makeNotifier();
    const summary = await pollUpdateService({
      admin: client,
      vendor: makeVendor({ "001234567890": "change_pending" }),
      notify,
      now,
    });
    assert.equal(summary.change_pending, 1);
    assert.deepEqual(calls.markChangePending, [["a1", "c1", NOW.toISOString()]]);
    assert.deepEqual(ncalls.adminChangePending, ["c1"]);
    assert.equal(ncalls.carerInvalidated.length, 0);
  });

  it("expires + suspends and notifies admin AND carer on invalidated", async () => {
    const rows: DueRow[] = [
      {
        id: "a1",
        carer_id: "c1",
        certificate_number: "001234567890",
        update_service_last_checked_at: null,
      },
    ];
    const { client, calls } = makeClient(rows);
    const { notify, calls: ncalls } = makeNotifier();
    const summary = await pollUpdateService({
      admin: client,
      vendor: makeVendor({ "001234567890": "invalidated" }),
      notify,
      now,
    });
    assert.equal(summary.invalidated, 1);
    assert.deepEqual(calls.markInvalidated, [["a1", "c1", NOW.toISOString()]]);
    assert.deepEqual(ncalls.adminInvalidated, ["c1"]);
    assert.deepEqual(ncalls.carerInvalidated, ["c1"]);
  });

  it("skips rows with no certificate number (never calls the vendor)", async () => {
    const rows: DueRow[] = [
      {
        id: "a1",
        carer_id: "c1",
        certificate_number: null,
        update_service_last_checked_at: null,
      },
    ];
    const { client, calls } = makeClient(rows);
    const summary = await pollUpdateService({
      admin: client,
      vendor: makeVendor({}),
      now,
    });
    assert.equal(summary.skipped, 1);
    assert.equal(summary.checked, 0);
    assert.equal(calls.markChecked.length, 0);
  });

  it("captures a per-row vendor error without aborting the run", async () => {
    const rows: DueRow[] = [
      {
        id: "a1",
        carer_id: "c1",
        certificate_number: "001111111111",
        update_service_last_checked_at: null,
      },
      {
        id: "a2",
        carer_id: "c2",
        certificate_number: "002222222222",
        update_service_last_checked_at: null,
      },
    ];
    const { client, calls } = makeClient(rows);
    const summary = await pollUpdateService({
      admin: client,
      vendor: makeVendor({
        "001111111111": new Error("uCheck down"),
        "002222222222": "clear",
      }),
      now,
    });
    assert.equal(summary.checked, 2);
    assert.equal(summary.clear, 1);
    assert.equal(summary.errors.length, 1);
    assert.equal(summary.errors[0].id, "a1");
    assert.match(summary.errors[0].message, /uCheck down/);
    // The second (healthy) row still processed.
    assert.deepEqual(calls.markChecked, [["a2", NOW.toISOString()]]);
  });

  it("passes a cutoff 23h before now to fetchDueRows", async () => {
    const { client, calls } = makeClient([]);
    await pollUpdateService({ admin: client, vendor: makeVendor({}), now });
    assert.equal(calls.fetchDueRows.length, 1);
    const cutoff = new Date(calls.fetchDueRows[0]).getTime();
    const expected = NOW.getTime() - 23 * 60 * 60 * 1000;
    assert.equal(cutoff, expected);
  });
});
