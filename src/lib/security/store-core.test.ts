/**
 * Unit tests for the recovery-code store cores (gap 13): issue-batch ordering
 * (regenerate invalidates the old batch before inserting), and consume matching
 * with real scrypt hashes + the double-burn guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeFromList, issueBatch, type StoredCode } from "./store-core";
import { hashRecoveryCode, verifyRecoveryCode } from "./recovery-codes-core";

test("issueBatch deletes prior unused codes BEFORE inserting the new batch", async () => {
  const calls: string[] = [];
  const inserted: { code_hash: string; batch_id: string }[][] = [];
  const out = await issueBatch(
    {
      async deleteUnused() {
        calls.push("delete");
      },
      async insert(rows) {
        calls.push("insert");
        inserted.push(rows);
      },
    },
    ["AAAA", "BBBB", "CCCC"],
    async (c) => `hash(${c})`,
    "batch-1",
  );
  assert.deepEqual(calls, ["delete", "insert"], "delete must precede insert");
  assert.deepEqual(out, ["AAAA", "BBBB", "CCCC"], "returns the plaintext batch");
  assert.equal(inserted[0].length, 3);
  assert.ok(inserted[0].every((r) => r.batch_id === "batch-1"));
});

test("consumeFromList marks the matching code used and stops", async () => {
  const codeA = "ABCDEFGHJKMNPQRS";
  const codeB = "TVWXYZ0123456789";
  const rows: StoredCode[] = [
    { id: "1", code_hash: await hashRecoveryCode(codeA), used_at: null },
    { id: "2", code_hash: await hashRecoveryCode(codeB), used_at: null },
  ];
  const marked: string[] = [];
  const ok = await consumeFromList(
    {
      listUnused: async () => rows,
      verify: verifyRecoveryCode,
      async markUsed(id) {
        marked.push(id);
        return true;
      },
    },
    codeB,
  );
  assert.equal(ok, true);
  assert.deepEqual(marked, ["2"], "only the matching code is burned");
});

test("consumeFromList returns false when no code matches", async () => {
  const rows: StoredCode[] = [
    { id: "1", code_hash: await hashRecoveryCode("ABCDEFGHJKMNPQRS"), used_at: null },
  ];
  const ok = await consumeFromList(
    { listUnused: async () => rows, verify: verifyRecoveryCode, markUsed: async () => true },
    "TVWXYZ0123456789",
  );
  assert.equal(ok, false);
});

test("consumeFromList returns false if the guarded markUsed loses the race", async () => {
  const code = "ABCDEFGHJKMNPQRS";
  const rows: StoredCode[] = [
    { id: "1", code_hash: await hashRecoveryCode(code), used_at: null },
  ];
  const ok = await consumeFromList(
    {
      listUnused: async () => rows,
      verify: verifyRecoveryCode,
      markUsed: async () => false, // concurrent submit already burned it
    },
    code,
  );
  assert.equal(ok, false, "a lost markUsed race must not count as consumed");
});
