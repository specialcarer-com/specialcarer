/**
 * Pure-logic tests for the booking-tasks hook helpers.
 *
 * The hook itself depends on React's renderer; here we cover the
 * deterministic helpers it exports — same approach as useChat.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  optimisticToggle,
  progress,
  replaceTask,
} from "./useBookingTasks";
import type { BookingTaskRow } from "./types";

function row(over: Partial<BookingTaskRow>): BookingTaskRow {
  return {
    id: "t1",
    booking_id: "b1",
    label: "x",
    done: false,
    done_at: null,
    done_by: null,
    position: 0,
    created_by: null,
    created_at: "2026-05-27T08:00:00.000Z",
    updated_at: "2026-05-27T08:00:00.000Z",
    ...over,
  };
}

describe("replaceTask", () => {
  it("swaps the matching id, preserving order", () => {
    const before = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })];
    const after = replaceTask(before, row({ id: "b", label: "swapped" }));
    assert.deepEqual(
      after.map((t) => t.label),
      ["x", "swapped", "x"],
    );
  });

  it("returns the previous list (same reference) when no id matches", () => {
    const before = [row({ id: "a" })];
    const after = replaceTask(before, row({ id: "zzz" }));
    assert.strictEqual(after, before);
  });
});

describe("optimisticToggle", () => {
  const NOW = new Date("2026-05-27T10:00:00.000Z");

  it("done=true stamps done_at and done_by", () => {
    const out = optimisticToggle(row({}), true, "user-1", NOW);
    assert.equal(out.done, true);
    assert.equal(out.done_at, NOW.toISOString());
    assert.equal(out.done_by, "user-1");
    assert.equal(out.updated_at, NOW.toISOString());
  });

  it("done=false clears done_at and done_by", () => {
    const out = optimisticToggle(
      row({ done: true, done_at: "earlier", done_by: "u" }),
      false,
      "user-1",
      NOW,
    );
    assert.equal(out.done, false);
    assert.equal(out.done_at, null);
    assert.equal(out.done_by, null);
  });
});

describe("progress", () => {
  it("counts done out of total", () => {
    const list = [
      row({ id: "1", done: true }),
      row({ id: "2", done: false }),
      row({ id: "3", done: true }),
    ];
    assert.deepEqual(progress(list), { done: 2, total: 3 });
  });

  it("zero / zero when empty", () => {
    assert.deepEqual(progress([]), { done: 0, total: 0 });
  });
});
