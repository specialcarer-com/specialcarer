/**
 * Tests for the quick-reply config.
 *
 * Pure data + a tiny dispatcher, so the test surface is small: shape,
 * uniqueness, role mapping, and the defensive fallback. These run in
 * node:test like the rest of src/lib/chat/*.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getQuickReplies, type QuickReply } from "./quick-replies";

function assertShape(reply: QuickReply, where: string) {
  assert.equal(typeof reply.id, "string", `${where}: id is string`);
  assert.equal(typeof reply.text, "string", `${where}: text is string`);
  assert.ok(reply.id.length > 0, `${where}: id non-empty`);
  assert.ok(reply.text.length > 0, `${where}: text non-empty`);
  assert.ok(
    /^[a-z][a-z0-9_]*$/.test(reply.id),
    `${where}: id is snake_case (${reply.id})`,
  );
  // Keep chips short — they live in a horizontally scrollable row and
  // multi-line wrapping looks broken.
  assert.ok(reply.text.length <= 32, `${where}: text <=32 chars`);
}

describe("getQuickReplies", () => {
  it("returns five carer replies", () => {
    const carer = getQuickReplies("carer");
    assert.equal(carer.length, 5);
    for (const r of carer) assertShape(r, "carer");
  });

  it("returns five seeker replies", () => {
    const seeker = getQuickReplies("seeker");
    assert.equal(seeker.length, 5);
    for (const r of seeker) assertShape(r, "seeker");
  });

  it("carer + seeker arrays contain unique ids within each set", () => {
    for (const role of ["carer", "seeker"] as const) {
      const set = getQuickReplies(role);
      const ids = new Set(set.map((r) => r.id));
      assert.equal(ids.size, set.length, `${role} has duplicate ids`);
    }
  });

  it("falls back to the seeker set for an unknown role", () => {
    // Intentional cast — we want to exercise the defensive branch.
    const fallback = getQuickReplies("admin" as unknown as "seeker");
    assert.deepEqual(fallback, getQuickReplies("seeker"));
  });

  it("each chip text is sensible (no leading/trailing whitespace, no newlines)", () => {
    for (const role of ["carer", "seeker"] as const) {
      for (const r of getQuickReplies(role)) {
        assert.equal(r.text, r.text.trim(), `${role}/${r.id}: trimmed`);
        assert.ok(
          !/[\r\n\t]/.test(r.text),
          `${role}/${r.id}: no control chars`,
        );
      }
    }
  });

  it("carer set includes the operational status chips the brief requires", () => {
    const ids = getQuickReplies("carer").map((r) => r.id);
    for (const id of ["on_my_way", "arrived", "running_late"]) {
      assert.ok(ids.includes(id), `carer set missing ${id}`);
    }
  });

  it("seeker set includes the courtesy + escalation chips the brief requires", () => {
    const ids = getQuickReplies("seeker").map((r) => r.id);
    for (const id of ["thanks", "please_call_me", "need_to_reschedule"]) {
      assert.ok(ids.includes(id), `seeker set missing ${id}`);
    }
  });
});
