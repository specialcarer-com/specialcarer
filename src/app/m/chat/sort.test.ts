/**
 * Tests for the pinned-first thread-list sort helper.
 *
 * Pure data, so node:test like the rest of src/lib/chat/*. The shape
 * matches the SQL clause `ORDER BY pinned DESC, COALESCE(
 * last_message_at, created_at) DESC` — within each pin group the input
 * order is preserved (Array.prototype.sort is stable on Node 20).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sortPinnedFirst } from "./sort";

type Row = { id: string; pinned?: boolean };

describe("sortPinnedFirst", () => {
  it("returns an empty array unchanged", () => {
    assert.deepEqual(sortPinnedFirst<Row>([]), []);
  });

  it("places pinned rows before unpinned, preserving input order within each group", () => {
    const input: Row[] = [
      { id: "a" },
      { id: "b", pinned: true },
      { id: "c" },
      { id: "d", pinned: true },
      { id: "e" },
    ];
    const out = sortPinnedFirst(input).map((r) => r.id);
    assert.deepEqual(out, ["b", "d", "a", "c", "e"]);
  });

  it("treats `pinned: false` and missing `pinned` as equivalent", () => {
    const input: Row[] = [
      { id: "x", pinned: false },
      { id: "y" },
      { id: "z", pinned: true },
    ];
    const out = sortPinnedFirst(input).map((r) => r.id);
    assert.deepEqual(out, ["z", "x", "y"]);
  });

  it("does not mutate the input array", () => {
    const input: Row[] = [
      { id: "a" },
      { id: "b", pinned: true },
    ];
    const snapshot = input.map((r) => r.id);
    sortPinnedFirst(input);
    assert.deepEqual(
      input.map((r) => r.id),
      snapshot,
      "sortPinnedFirst must be pure",
    );
  });

  it("is stable when all rows have the same pin state", () => {
    const allPinned: Row[] = [
      { id: "1", pinned: true },
      { id: "2", pinned: true },
      { id: "3", pinned: true },
    ];
    assert.deepEqual(
      sortPinnedFirst(allPinned).map((r) => r.id),
      ["1", "2", "3"],
    );
    const noneePinned: Row[] = [{ id: "1" }, { id: "2" }, { id: "3" }];
    assert.deepEqual(
      sortPinnedFirst(noneePinned).map((r) => r.id),
      ["1", "2", "3"],
    );
  });
});
