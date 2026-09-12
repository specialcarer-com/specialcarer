/**
 * Tests for the pure helpers behind the admin deferred-erasure
 * queue page (C1.4).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysIso,
  canManuallyRetry,
  canManuallySkip,
  classifyDeferredRow,
  DEFERRED_QUEUE_MAX_ATTEMPTS,
  londonTodayIso,
  parseDeferredQueueFilter,
  serialiseDeferredQueueFilter,
  summariseDeferredQueue,
  type DeferredQueueViewRow,
} from "./deferred-queue-view";

function row(overrides: Partial<DeferredQueueViewRow> = {}): DeferredQueueViewRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    dsar_request_id: "22222222-2222-2222-2222-222222222222",
    subject_email: "jane@example.com",
    subject_user_id: null,
    table_name: "payroll_runs",
    owner_column: "user_id",
    owner_value: "33333333-3333-3333-3333-333333333333",
    column_name: null,
    retained_until: "2027-01-01",
    state: "pending",
    attempt_count: 0,
    last_attempt_at: null,
    last_error: null,
    completed_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("addDaysIso", () => {
  it("adds days without timezone drift", () => {
    assert.equal(addDaysIso("2026-09-12", 30), "2026-10-12");
    assert.equal(addDaysIso("2026-01-31", 1), "2026-02-01");
    assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
  });

  it("handles zero and negatives", () => {
    assert.equal(addDaysIso("2026-09-12", 0), "2026-09-12");
    assert.equal(addDaysIso("2026-09-12", -12), "2026-08-31");
  });

  it("crosses BST/GMT boundaries safely", () => {
    // 25 Oct 2026 is when UK reverts to GMT.
    assert.equal(addDaysIso("2026-10-25", 1), "2026-10-26");
    assert.equal(addDaysIso("2026-03-29", 1), "2026-03-30");
  });
});

describe("londonTodayIso", () => {
  it("returns YYYY-MM-DD in London civil time", () => {
    // 2026-09-12 02:00 BST is 2026-09-12 in London.
    const bst = new Date("2026-09-12T01:00:00.000Z");
    assert.equal(londonTodayIso(bst), "2026-09-12");
    // 2026-12-15 00:30 UTC is 2026-12-15 in London (GMT, no offset).
    const gmt = new Date("2026-12-15T00:30:00.000Z");
    assert.equal(londonTodayIso(gmt), "2026-12-15");
    // 2026-09-12 23:30 UTC is 2026-09-13 in London (BST +1h).
    const wrap = new Date("2026-09-12T23:30:00.000Z");
    assert.equal(londonTodayIso(wrap), "2026-09-13");
  });
});

describe("parseDeferredQueueFilter", () => {
  it("returns empty defaults on empty input", () => {
    const f = parseDeferredQueueFilter({});
    assert.deepEqual(f, { states: [], due: "all", q: "" });
  });

  it("parses a comma-separated state list", () => {
    const f = parseDeferredQueueFilter({ state: "pending,error" });
    assert.deepEqual(f.states, ["pending", "error"]);
  });

  it("accepts a repeated string[] state param", () => {
    const f = parseDeferredQueueFilter({ state: ["pending", "skipped"] });
    assert.deepEqual(f.states, ["pending", "skipped"]);
  });

  it("drops unknown states and de-duplicates", () => {
    const f = parseDeferredQueueFilter({
      state: "pending,pending,gibberish,error",
    });
    assert.deepEqual(f.states, ["pending", "error"]);
  });

  it("parses the due filter and rejects unknowns", () => {
    assert.equal(parseDeferredQueueFilter({ due: "overdue" }).due, "overdue");
    assert.equal(parseDeferredQueueFilter({ due: "upcoming" }).due, "upcoming");
    assert.equal(parseDeferredQueueFilter({ due: "all" }).due, "all");
    assert.equal(parseDeferredQueueFilter({ due: "wat" }).due, "all");
  });

  it("trims free-text and accepts array[0]", () => {
    assert.equal(parseDeferredQueueFilter({ q: "  jane  " }).q, "jane");
    assert.equal(
      parseDeferredQueueFilter({ q: ["payroll", "junk"] }).q,
      "payroll",
    );
  });
});

describe("serialiseDeferredQueueFilter", () => {
  it("returns empty string for empty filter", () => {
    assert.equal(
      serialiseDeferredQueueFilter({ states: [], due: "all", q: "" }),
      "",
    );
  });

  it("URL-encodes free-text", () => {
    const s = serialiseDeferredQueueFilter({
      states: [],
      due: "all",
      q: "jane doe & co",
    });
    assert.equal(s, "q=jane%20doe%20%26%20co");
  });

  it("round-trips through parseDeferredQueueFilter", () => {
    const original = {
      states: ["error", "pending"] as const,
      due: "overdue" as const,
      q: "payroll",
    };
    const s = serialiseDeferredQueueFilter(original);
    const parsed = parseDeferredQueueFilter(
      Object.fromEntries(
        s.split("&").map((p) => {
          const [k, v] = p.split("=");
          return [k, decodeURIComponent(v ?? "")];
        }),
      ),
    );
    assert.deepEqual([...parsed.states].sort(), ["error", "pending"]);
    assert.equal(parsed.due, "overdue");
    assert.equal(parsed.q, "payroll");
  });
});

describe("classifyDeferredRow", () => {
  const today = "2026-09-12";

  it("badges completed", () => {
    assert.equal(
      classifyDeferredRow(row({ state: "completed" }), today),
      "completed",
    );
  });
  it("badges processing", () => {
    assert.equal(
      classifyDeferredRow(row({ state: "processing" }), today),
      "processing",
    );
  });
  it("badges error", () => {
    assert.equal(
      classifyDeferredRow(row({ state: "error", attempt_count: 3 }), today),
      "error",
    );
  });
  it("badges skipped as abandoned once attempt_count hits the ceiling", () => {
    assert.equal(
      classifyDeferredRow(
        row({ state: "skipped", attempt_count: DEFERRED_QUEUE_MAX_ATTEMPTS }),
        today,
      ),
      "abandoned",
    );
    assert.equal(
      classifyDeferredRow(
        row({ state: "skipped", attempt_count: 0 }),
        today,
      ),
      "skipped",
    );
  });
  it("badges pending-future vs overdue", () => {
    assert.equal(
      classifyDeferredRow(
        row({ state: "pending", retained_until: "2027-01-01" }),
        today,
      ),
      "pending",
    );
    assert.equal(
      classifyDeferredRow(
        row({ state: "pending", retained_until: "2026-09-10" }),
        today,
      ),
      "overdue",
    );
    // Boundary: retained_until === today counts as overdue.
    assert.equal(
      classifyDeferredRow(
        row({ state: "pending", retained_until: today }),
        today,
      ),
      "overdue",
    );
  });
});

describe("canManuallyRetry", () => {
  const today = "2026-09-12";

  it("permits errored rows whose retention has passed", () => {
    assert.equal(
      canManuallyRetry(
        row({ state: "error", retained_until: "2026-09-01" }),
        today,
      ),
      true,
    );
  });
  it("permits abandoned rows (state='skipped', high attempt_count)", () => {
    assert.equal(
      canManuallyRetry(
        row({
          state: "skipped",
          attempt_count: DEFERRED_QUEUE_MAX_ATTEMPTS,
          retained_until: "2026-09-01",
        }),
        today,
      ),
      true,
    );
  });
  it("refuses when retention window is still in the future", () => {
    assert.equal(
      canManuallyRetry(
        row({ state: "error", retained_until: "2027-01-01" }),
        today,
      ),
      false,
    );
  });
  it("refuses on pending / processing / completed", () => {
    for (const s of ["pending", "processing", "completed"] as const) {
      assert.equal(
        canManuallyRetry(
          row({ state: s, retained_until: "2026-01-01" }),
          today,
        ),
        false,
        `state=${s} should not be retryable`,
      );
    }
  });
});

describe("canManuallySkip", () => {
  it("permits pending / error", () => {
    assert.equal(canManuallySkip(row({ state: "pending" })), true);
    assert.equal(canManuallySkip(row({ state: "error" })), true);
  });
  it("refuses everything else", () => {
    for (const s of ["processing", "completed", "skipped"] as const) {
      assert.equal(
        canManuallySkip(row({ state: s })),
        false,
        `state=${s} should not be skippable`,
      );
    }
  });
});

describe("summariseDeferredQueue", () => {
  const today = "2026-09-12";

  it("returns zeros for empty input", () => {
    const s = summariseDeferredQueue([], today);
    assert.deepEqual(s, {
      total: 0,
      overdue: 0,
      upcoming_30d: 0,
      error: 0,
      abandoned: 0,
      completed: 0,
      skipped: 0,
      pending_future: 0,
    });
  });

  it("buckets correctly across every badge", () => {
    const rows: DeferredQueueViewRow[] = [
      row({ state: "pending", retained_until: "2026-09-01" }), // overdue
      row({ state: "pending", retained_until: "2026-09-15" }), // upcoming_30d
      row({ state: "pending", retained_until: "2027-01-01" }), // pending_future only
      row({ state: "error", attempt_count: 3, retained_until: "2026-09-01" }),
      row({
        state: "skipped",
        attempt_count: DEFERRED_QUEUE_MAX_ATTEMPTS,
        retained_until: "2026-08-01",
      }),
      row({ state: "skipped", attempt_count: 1, retained_until: "2026-08-01" }),
      row({ state: "completed", retained_until: "2026-08-01" }),
      row({ state: "processing", retained_until: "2026-08-01" }),
    ];
    const s = summariseDeferredQueue(rows, today);
    assert.equal(s.total, 8);
    assert.equal(s.overdue, 1);
    // upcoming_30d also counts as pending_future, so pending_future
    // should be the 3 pending rows.
    assert.equal(s.pending_future, 2);
    assert.equal(s.upcoming_30d, 1);
    assert.equal(s.error, 1);
    assert.equal(s.abandoned, 1);
    assert.equal(s.skipped, 1);
    assert.equal(s.completed, 1);
  });
});
